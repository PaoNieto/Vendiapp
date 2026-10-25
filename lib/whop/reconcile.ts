import "server-only";
import { alertAdmin, resolveAlert } from "@/lib/avisos/alert";
import { getProductByWhopPlanId } from "@/lib/billing/catalog";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isPaid,
  isWhopTestPaymentId,
  listWhopPaymentsSince,
  paymentAmountUsd,
  paymentPlanId,
  readMetaString,
} from "./payments";

/**
 * EL CRUCE CON WHOP: ventas que Whop cobró y que no están ni acreditadas
 * (`whop_processed_payments`) ni estacionadas (`whop_unmatched_payments`).
 * Es una de las tres causas de mail urgente del cobro (spec de avisos, #16).
 *
 *  - Ventana: últimas 72 h como máximo (JonSnow #4).
 *  - Gracia: un pago de menos de 10 min no cuenta (el webhook puede venir en
 *    camino o reintentándose).
 *  - Candado GLOBAL en `cron_runs` (un cruce cada 10 min entre todas las
 *    instancias), así nunca lo dispara de más el polling de un cliente ni un
 *    loop (JonSnow #7). `force` lo saltea (para el panel de Paolo).
 *  - Cada venta sin procesar abre una U con llave
 *    `whop:payment_unreconciled:<pay_id>`; cuando aparece procesada o
 *    estacionada, la alerta se cierra sola (y a Paolo le llega el "resuelta").
 *
 * Quién lo llama: el cron diario (runAvisosMaintenance), el panel al abrirse y
 * `/api/pago/estado` cuando un cliente lleva más de 90 s esperando (pasa por el
 * candado, así que eso es como mucho uno cada 10 min).
 *
 * Nunca tira.
 */

export type ReconcileResult = {
  status: "ok" | "locked" | "error";
  checked: number;
  /** pay_ cobrados sin procesar (cada uno con su alerta U). */
  missing: string[];
  /** Alertas de cruce que se cerraron solas en esta pasada. */
  resolved: number;
  error?: string;
};

const JOB = "whop_reconcile";
const MAX_HOURS = 72;
const GRACE_MS = 10 * 60_000;
const LOCK_BUCKET_MS = 10 * 60_000;
const ALERT_PREFIX = "whop:payment_unreconciled:";

export function unreconciledAlertKey(whopPaymentId: string): string {
  return `${ALERT_PREFIX}${whopPaymentId}`;
}

export async function reconcileWhopPayments(
  opts: { hours?: number; force?: boolean } = {},
): Promise<ReconcileResult> {
  const result: ReconcileResult = { status: "ok", checked: 0, missing: [], resolved: 0 };
  const hours = Math.min(Math.max(opts.hours ?? MAX_HOURS, 1), MAX_HOURS);

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (err) {
    return { ...result, status: "error", error: errText(err) };
  }

  // --- Candado global (un cruce cada 10 min) ---
  if (!opts.force) {
    try {
      const bucket = new Date(
        Math.floor(Date.now() / LOCK_BUCKET_MS) * LOCK_BUCKET_MS,
      ).toISOString();
      const { data, error } = await admin
        .from("cron_runs")
        .upsert(
          { job: JOB, run_key: bucket },
          { onConflict: "job,run_key", ignoreDuplicates: true },
        )
        .select("job");
      if (error) {
        // Sin candado no corremos: preferimos perder una pasada a martillar la
        // API de Whop. El cron diario lo vuelve a intentar.
        return { ...result, status: "error", error: `candado: ${error.message}` };
      }
      if (Array.isArray(data) && data.length === 0) {
        return { ...result, status: "locked" };
      }
    } catch (err) {
      return { ...result, status: "error", error: `candado: ${errText(err)}` };
    }
  }

  try {
    const now = Date.now();
    const payments = (
      await listWhopPaymentsSince(new Date(now - hours * 3_600_000), 100)
    ).filter((p) => p.id && isPaid(p) && !isWhopTestPaymentId(p.id));
    result.checked = payments.length;

    const ids = payments.map((p) => String(p.id));
    const known = new Set<string>();
    if (ids.length > 0) {
      const [processed, parked] = await Promise.all([
        admin.from("whop_processed_payments").select("whop_payment_id").in("whop_payment_id", ids),
        admin.from("whop_unmatched_payments").select("whop_payment_id").in("whop_payment_id", ids),
      ]);
      if (processed.error || parked.error) {
        throw new Error(processed.error?.message ?? parked.error?.message ?? "lectura");
      }
      for (const row of [...(processed.data ?? []), ...(parked.data ?? [])]) {
        known.add(String(row.whop_payment_id));
      }
    }

    for (const p of payments) {
      const id = String(p.id);
      if (known.has(id)) continue;
      const when = Date.parse(p.paid_at ?? p.created_at ?? "");
      if (Number.isFinite(when) && now - when < GRACE_MS) continue;

      result.missing.push(id);
      const planId = paymentPlanId(p);
      const metadata = p.metadata ?? null;
      await alertAdmin({
        kind: "payment_unreconciled",
        severity: "U",
        dedupeKey: unreconciledAlertKey(id),
        userId: readMetaString(metadata, "clerk_user_id"),
        details: {
          whop_payment_id: id,
          amount_usd: paymentAmountUsd(p),
          plan_id: planId,
          pack:
            readMetaString(metadata, "pack_id") ??
            (planId ? getProductByWhopPlanId(planId)?.id ?? null : null),
          customer_email: p.user?.email ?? null,
          paid_at: p.paid_at ?? null,
          cause: "Whop lo cobró y no está ni acreditado ni estacionado",
        },
      });
    }

    // Cerrar las alertas de cruce cuyo pago ya apareció.
    const { data: open } = await admin
      .from("admin_alerts")
      .select("dedupe_key")
      .is("resolved_at", null)
      .like("dedupe_key", `${ALERT_PREFIX}%`)
      .limit(100);
    const openIds = (open ?? [])
      .map((row) => String(row.dedupe_key).slice(ALERT_PREFIX.length))
      .filter(Boolean);
    if (openIds.length > 0) {
      const [processed, parked] = await Promise.all([
        admin.from("whop_processed_payments").select("whop_payment_id").in("whop_payment_id", openIds),
        admin.from("whop_unmatched_payments").select("whop_payment_id").in("whop_payment_id", openIds),
      ]);
      const done = new Set(
        [...(processed.data ?? []), ...(parked.data ?? [])].map((r) => String(r.whop_payment_id)),
      );
      for (const id of openIds) {
        if (!done.has(id)) continue;
        const { resolved } = await resolveAlert(unreconciledAlertKey(id), {
          resolution: { by: "cruce", note: "el pago apareció procesado o estacionado" },
        });
        if (resolved) result.resolved++;
      }
    }

    return result;
  } catch (err) {
    console.error("[whop-reconcile] El cruce falló:", errText(err));
    return { ...result, status: "error", error: errText(err) };
  }
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
