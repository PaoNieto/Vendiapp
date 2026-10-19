"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/avisos/admin";
import { recheckAi } from "@/lib/avisos/ai-gate";
import { resolveAlert } from "@/lib/avisos/alert";
import { AI_CAUSE_LABELS } from "@/lib/avisos/textos";

/**
 * Server actions del panel /admin/avisos.
 *
 * ⚠️ CADA acción vuelve a llamar a `requireAdmin()`: una server action es un
 * endpoint POST público y el layout no la protege (JonSnow #2).
 */

const resolveSchema = z.object({
  dedupeKey: z.string().trim().min(1).max(300),
});

/** [Marcar resuelta]: cierra la alerta abierta de esa llave (sin mail: la cerró Paolo). */
export async function resolveAlertAction(formData: FormData): Promise<void> {
  const adminUserId = await requireAdmin();
  const parsed = resolveSchema.safeParse({ dedupeKey: formData.get("dedupeKey") });
  if (!parsed.success) return;
  // Las `refund_failed` no se cierran a mano: `retryFailedRefunds()` solo lee las
  // abiertas, y cerrarla dejaría la devolución del cliente sin acreditar nunca.
  if (parsed.data.dedupeKey.startsWith("refund_failed:")) return;
  await resolveAlert(parsed.data.dedupeKey, {
    notify: false,
    resolution: { by: "admin", admin_user_id: adminUserId, at: new Date().toISOString() },
  });
  revalidatePath("/admin/avisos");
}

export type RecheckAiState =
  | { status: "idle" }
  | { status: "up"; text: string }
  | { status: "down"; text: string }
  | { status: "unknown"; text: string };

/** [Ya recargué]: prueba la IA en el momento (markAiUp / markAiDown según salga). */
// Se usa con useActionState: ignora el estado previo y el FormData.
export async function recheckAiAction(): Promise<RecheckAiState> {
  await requireAdmin();
  const probe = await recheckAi("admin");
  revalidatePath("/admin/avisos");
  if (probe.ok) {
    return { status: "up", text: "La IA respondió. Ya les avisamos a los clientes que vieron la pausa." };
  }
  if (probe.cause) {
    const label = AI_CAUSE_LABELS[probe.cause] ?? probe.cause;
    const http = probe.status ? ` (HTTP ${probe.status})` : "";
    return { status: "down", text: `Sigue caída: ${label}${http}.` };
  }
  return {
    status: "unknown",
    text: `La prueba no fue concluyente${probe.status ? ` (HTTP ${probe.status})` : ""}. No cambiamos nada; probá de nuevo en un minuto.`,
  };
}
