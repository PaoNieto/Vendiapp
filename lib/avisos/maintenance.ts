import "server-only";
import { alertAdmin, remindOpenUrgentAlerts, resolveAlert } from "./alert";
import { recheckAi } from "./ai-gate";
import { adminClientOrNull, errorText, num, rpcArray, str } from "./db";
import { isPayingCustomer } from "./paying";
import { refundWithNotice } from "./refund";
import { NOTICE_KEYS, REFUND_CONFIRMED_KINDS, type RefundBucket } from "./types";
import { reconcileWhopPayments, type ReconcileResult } from "@/lib/whop/reconcile";

/**
 * MANTENIMIENTO de avisos: lo que no pasa dentro de una request.
 *
 *  - reapStaleGenerations → tandas colgadas (Vercel cortó la ruta a los 300 s):
 *                           en 'processing' hace más de 15 min.
 *  - retryFailedRefunds   → reintenta las devoluciones que fallaron y avisa
 *                           «Ya entró tu devolución de {n} créditos».
 *  - runAvisosMaintenance → todo junto + recordatorios de U + prueba de la IA +
 *                           el cruce con Whop (ventas cobradas sin acreditar).
 *    Pensado para el Vercel Cron diario (con `Bearer CRON_SECRET`, 503 si falta
 *    el secret, comparado con timingSafeEqual) y, si se quiere, para cuando
 *    Paolo abre el panel. Seguro de correr varias veces: todo es idempotente.
 *
 * NADA acá tira.
 */

export type ReapedGeneration = {
  generationId: string;
  userId: string;
  versionId: string | null;
  product: string | null;
  /** Créditos cobrados según el ledger. */
  charged: number;
  /** Imágenes guardadas (null si no se miró). */
  images: number | null;
  refunded: number;
  /** No se pudo verificar del lado server: quedó 'failed' SIN devolver; lo decide Paolo. */
  needsReview: boolean;
  notificationId: string | null;
  error: string | null;
};

/**
 * Tandas colgadas: llama a la RPC `reap_stale_generations` (que decide la plata
 * SOLO con `batch_charges`, que escribe únicamente el server: devuelve amount −
 * images_saved de los cobros que la ruta no cerró) y abre las alertas: M si había
 * algo cobrado (devuelto o para revisar), B si no. Con `userId`, solo las de
 * ese usuario (barato: sirve para
 * llamarlo antes de lanzar una tanda nueva).
 */
export async function reapStaleGenerations(
  opts: { userId?: string | null; limit?: number } = {},
): Promise<ReapedGeneration[]> {
  const admin = adminClientOrNull();
  if (!admin) return [];
  let items: Record<string, unknown>[];
  try {
    const { data, error } = await admin.rpc("reap_stale_generations", {
      p_user_id: opts.userId ?? null,
      p_limit: opts.limit ?? 25,
    });
    if (error) {
      console.error("[avisos] reap_stale_generations falló:", error.message);
      return [];
    }
    items = rpcArray(data);
  } catch (err) {
    console.error("[avisos] reap_stale_generations tiró:", errorText(err));
    return [];
  }

  const reaped: ReapedGeneration[] = items
    .map((item) => ({
      generationId: str(item.generation_id) ?? "",
      userId: str(item.user_id) ?? "",
      versionId: str(item.version_id),
      product: str(item.product),
      charged: num(item.charged) ?? 0,
      images: num(item.images),
      refunded: num(item.refunded) ?? 0,
      needsReview: item.needs_review === true,
      notificationId: str(item.notification_id),
      error: str(item.error),
    }))
    .filter((r) => r.generationId && r.userId);

  for (const r of reaped) {
    if (r.error) {
      await alertAdmin({
        kind: "batch_timeout",
        severity: "M",
        dedupeKey: `batch_timeout:${r.generationId}`,
        userId: r.userId,
        details: { generation_id: r.generationId, cause: "reaper_error", raw: r.error },
      });
      continue;
    }
    // Tanda colgada = M (panel + resumen diario); sin nada cobrado, B.
    const paying = r.charged > 0 && (await isPayingCustomer(r.userId));
    const severity = r.charged === 0 ? "B" : "M";
    await alertAdmin({
      kind: "batch_timeout",
      severity,
      dedupeKey: `batch_timeout:${r.generationId}`,
      userId: r.userId,
      details: {
        generation_id: r.generationId,
        version_id: r.versionId,
        product: r.product,
        charged: r.charged,
        refunded: r.refunded,
        delivered: r.images,
        needs_review: r.needsReview,
        paying,
      },
    });
  }
  return reaped;
}

/**
 * Reintenta las devoluciones de las alertas abiertas `refund_failed`.
 *
 * Antes de devolver, mira si la devolución original en realidad entró (la
 * transacción pudo confirmarse y perderse solo la respuesta): si el aviso de la
 * tanda (`details.notice_key`) es uno que confirma devolución, se cierra la
 * alerta sin devolver. Si no, devuelve con la llave
 * `refund_landed:<llave de la alerta>` (idempotente: un segundo reintento no
 * devuelve dos veces) y cierra la alerta (mail de "resuelta").
 */
export async function retryFailedRefunds(
  opts: { limit?: number } = {},
): Promise<{ checked: number; resolved: number; failed: number; skipped: number }> {
  const report = { checked: 0, resolved: 0, failed: 0, skipped: 0 };
  const admin = adminClientOrNull();
  if (!admin) return report;

  let alerts: Array<{ dedupe_key: string; user_id: string | null; details: Record<string, unknown> | null }>;
  try {
    const { data, error } = await admin
      .from("admin_alerts")
      .select("dedupe_key, user_id, details")
      .eq("kind", "refund_failed")
      .is("resolved_at", null)
      .order("first_seen", { ascending: true })
      .limit(opts.limit ?? 20);
    if (error) {
      console.error("[avisos] No se pudieron leer las devoluciones pendientes:", error.message);
      return report;
    }
    alerts = (data ?? []) as typeof alerts;
  } catch (err) {
    console.error("[avisos] retryFailedRefunds tiró:", errorText(err));
    return report;
  }

  for (const alert of alerts) {
    report.checked++;
    const details = alert.details ?? {};
    const userId = alert.user_id;
    const amount = num(details.amount);
    const bucket: RefundBucket | null =
      details.bucket === "generation" || details.bucket === "analysis" ? details.bucket : null;
    const noticeKey = str(details.notice_key);

    if (!userId || !amount || amount <= 0 || !bucket) {
      // Sin datos para devolver solo: queda para el panel.
      report.skipped++;
      continue;
    }

    try {
      if (noticeKey) {
        const { data: notice } = await admin
          .from("user_notifications")
          .select("kind")
          .eq("user_id", userId)
          .eq("dedupe_key", noticeKey)
          .maybeSingle();
        const kind = str(notice?.kind);
        if (kind && REFUND_CONFIRMED_KINDS.some((k) => k === kind)) {
          await resolveAlert(alert.dedupe_key, {
            resolution: { by: "retry", already_refunded: true },
          });
          report.resolved++;
          continue;
        }
      }

      const result = await refundWithNotice({
        userId,
        amount,
        bucket,
        kind: "refund_landed",
        data: {},
        dedupeKey: NOTICE_KEYS.refundLanded(alert.dedupe_key),
      });
      if (result.ok) {
        await resolveAlert(alert.dedupe_key, { resolution: { by: "retry", status: result.status } });
        report.resolved++;
      } else {
        report.failed++;
      }
    } catch (err) {
      console.error("[avisos] Reintento de devolución tiró:", errorText(err));
      report.failed++;
    }
  }
  return report;
}

/**
 * Retención: borra los avisos YA LEÍDOS creados hace más de `days` días
 * (default 90). Solo `user_notifications`: NUNCA el ledger, las tablas
 * `*_processed_*` ni las alertas (JonSnow #4: borrar el candado de un pago lo
 * haría acreditar dos veces). Los no leídos se quedan.
 *
 * Se filtra por `created_at` (el cliente no lo puede tocar), no por `read_at`,
 * y NUNCA se borran las marcas de tanda `gen:` ni las de regenerar `regen:`:
 * son candados de "la ruta terminó / ya se devolvió" (hallazgo de JonSnow del
 * 16/10: con read_at = '2020-01-01' el cliente hacía borrar la marca y forzaba
 * una devolución). NUNCA tira; devuelve cuántos borró (o null).
 */
export async function cleanupOldNotices(days = 90): Promise<number | null> {
  const admin = adminClientOrNull();
  if (!admin) return null;
  try {
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    const { data, error } = await admin
      .from("user_notifications")
      .delete()
      .not("read_at", "is", null)
      .lt("created_at", cutoff)
      // Sin llave, o con una llave que no sea marca de tanda/regeneración.
      .or('dedupe_key.is.null,and(dedupe_key.not.like."gen:*",dedupe_key.not.like."regen:*")')
      .select("id");
    if (error) {
      console.error("[avisos] Limpieza de avisos viejos falló:", error.message);
      return null;
    }
    return Array.isArray(data) ? data.length : 0;
  } catch (err) {
    console.error("[avisos] Limpieza de avisos viejos tiró:", errorText(err));
    return null;
  }
}

export type MaintenanceReport = {
  reaped: number;
  reapedRefunded: number;
  reapedNeedsReview: number;
  refunds: { checked: number; resolved: number; failed: number; skipped: number };
  reminders: number;
  /** Resultado de la prueba diaria de la IA. */
  ai: "ok" | "down" | "inconclusive";
  /** El cruce con Whop: ventas cobradas sin acreditar (cada una abre su U). */
  whop: Pick<ReconcileResult, "status" | "checked" | "resolved" | "error"> & { missing: number };
};

/**
 * Todo el mantenimiento en una llamada (para el cron). Incluye una prueba de
 * la IA aunque figure ok: si Google se quedó sin saldo de madrugada y nadie
 * generó, Paolo se entera por la alerta antes que un cliente.
 */
export async function runAvisosMaintenance(): Promise<MaintenanceReport> {
  const reaped = await reapStaleGenerations({ limit: 50 });
  const refunds = await retryFailedRefunds({ limit: 20 });
  const reminders = await remindOpenUrgentAlerts();
  const probe = await recheckAi("cron");
  // force: el cron es diario y tiene que correr aunque el candado de 10 min lo
  // haya tomado otra pasada. Es el que garantiza el U «cobrado sin acreditar»
  // cuando el webhook está roto y el comprador cerró la pestaña.
  const whop = await reconcileWhopPayments({ force: true });
  return {
    reaped: reaped.length,
    reapedRefunded: reaped.reduce((sum, r) => sum + r.refunded, 0),
    reapedNeedsReview: reaped.filter((r) => r.needsReview).length,
    refunds,
    reminders,
    ai: probe.ok ? "ok" : probe.cause ? "down" : "inconclusive",
    whop: {
      status: whop.status,
      checked: whop.checked,
      missing: whop.missing.length,
      resolved: whop.resolved,
      ...(whop.error ? { error: whop.error } : {}),
    },
  };
}
