import "server-only";
import { adminClientOrNull, errorText, num, rpcObject, str } from "./db";
import type { RefundBucket, RefundNoticeData, RefundNoticeKind } from "./types";

/**
 * Devolución + su aviso, en UNA transacción (RPC `refund_credits_with_notice`).
 *
 * Es el mecanismo de siempre (`grant_credits(..., 'refund')`, o
 * `grant_analysis_credits` para la bolsa de análisis) con dos garantías más:
 *  - el aviso «ya te devolvimos…» nace en la misma transacción que la plata;
 *  - es IDEMPOTENTE por `dedupeKey`: repetir la llamada nunca devuelve dos
 *    veces (la segunda da `duplicate`). Por eso se reintenta solo.
 *
 * Ilimitados → `unlimited`: NO se devuelve (acuñaría créditos), pero el aviso
 * sale igual con refunded = 0 (el texto omite «te devolvimos»). O sea: la ruta
 * llama SIEMPRE a esta función, sea quien sea el usuario.
 *
 * La RPC agrega a `data`: refunded, bucket y el saldo resultante (saldo /
 * saldo_analisis). No hace falta mandarlos.
 *
 * NUNCA tira. Si devuelve `ok: false`, la devolución NO ocurrió: la ruta tiene
 * que avisar `refund_pending` (misma llave de la tanda) y abrir la alerta U
 * `refund_failed` (ver lib/avisos/alert.ts), que el reintento resuelve solo.
 */
export type RefundResult =
  | { ok: true; status: "refunded"; notificationId: string | null; balance: number | null }
  | { ok: true; status: "duplicate"; notificationId: string | null; existingKind: string | null }
  | { ok: true; status: "unlimited"; notificationId: string | null }
  | { ok: false; error: string };

export async function refundWithNotice<K extends RefundNoticeKind>(input: {
  userId: string;
  amount: number;
  bucket: RefundBucket;
  kind: K;
  data: RefundNoticeData[K];
  /** Llave del aviso = llave de idempotencia de la devolución (ej. NOTICE_KEYS.batch(id)). */
  dedupeKey: string;
}): Promise<RefundResult> {
  const amount = Math.floor(input.amount);
  if (!input.userId || !input.dedupeKey || !Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "refundWithNotice: datos inválidos" };
  }
  const admin = adminClientOrNull();
  if (!admin) return { ok: false, error: "Sin cliente admin de Supabase" };

  let lastError = "desconocido";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data, error } = await admin.rpc("refund_credits_with_notice", {
        p_user_id: input.userId,
        p_amount: amount,
        p_bucket: input.bucket,
        p_kind: input.kind,
        p_data: input.data ?? {},
        p_dedupe_key: input.dedupeKey,
      });
      if (error) {
        lastError = error.message;
        console.error(
          `[avisos] refund_credits_with_notice falló (intento ${attempt + 1}):`,
          error.message,
        );
        continue;
      }
      const row = rpcObject(data);
      const status = str(row?.status);
      if (status === "refunded") {
        return {
          ok: true,
          status: "refunded",
          notificationId: str(row?.notification_id),
          balance: num(row?.balance),
        };
      }
      if (status === "duplicate") {
        return {
          ok: true,
          status: "duplicate",
          notificationId: str(row?.notification_id),
          existingKind: str(row?.existing_kind),
        };
      }
      if (status === "unlimited") {
        return { ok: true, status: "unlimited", notificationId: str(row?.notification_id) };
      }
      lastError = `respuesta inesperada: ${JSON.stringify(data)}`;
    } catch (err) {
      lastError = errorText(err);
      console.error(`[avisos] refund_credits_with_notice tiró (intento ${attempt + 1}):`, lastError);
    }
  }
  return { ok: false, error: lastError };
}
