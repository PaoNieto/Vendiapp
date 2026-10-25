import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { aiGate } from "@/lib/avisos/ai-gate";

/**
 * POST /api/avisos/watch — el banner de «IA caída» lo llama mientras se
 * muestra (cada 60 s): anota al usuario en `ai_outage_watchers` para avisarle en
 * la campanita «Ya podés generar de nuevo.» cuando vuelva, Y es lo que hace
 * volver sola a la IA: con el banner prendido la UI apaga Generar/Analizar, así
 * que nadie más llega a `aiGate()`. Acá se llama `aiGate()`, que corre la prueba
 * cuando venció `next_probe_at` (claim atómico `ai_claim_probe`, entre 2 y 15
 * min según lo que lleve caída): no martillea a Google aunque haya mil banners.
 *
 * Respuestas: 401 sin sesión · 429 si repite antes de 30 s · 200
 * `{ watching: true }` (sigue caída: anotado) o `{ watching: false }` (la IA
 * está ok, o la prueba acaba de confirmar que volvió: refrescar el estado).
 *
 * Límite simple: una vez cada 30 s por usuario y por instancia, y solo escribe
 * si la IA figura caída (la escritura es idempotente: upsert por user_id).
 */

const MIN_INTERVAL_MS = 30_000;
const MAX_TRACKED = 5_000;
const lastCall = new Map<string, number>();

export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const now = Date.now();
  const last = lastCall.get(userId) ?? 0;
  if (now - last < MIN_INTERVAL_MS) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  if (lastCall.size >= MAX_TRACKED) lastCall.clear();
  lastCall.set(userId, now);

  // Con la IA caída: anota al usuario y, si toca, prueba si volvió.
  const gate = await aiGate({ watchUserId: userId });
  return NextResponse.json({ watching: !gate.open }, { status: 200 });
}
