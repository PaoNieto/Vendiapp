import "server-only";
import { getWhopAccountId, whopFetch } from "./client";

/**
 * Lecturas de pagos y checkouts contra la API de Whop. Solo server.
 *
 * Todo con parámetros ESCALARES a propósito: la doc de Whop no dice cómo se
 * codifican los arrays en el query (`statuses`, `plan_ids`), así que el filtro
 * por estado se hace acá y no en la URL.
 */

/** Forma (parcial) de un Payment de Whop. Todo opcional: es input externo. */
export type WhopPayment = {
  id?: string;
  status?: string | null;
  paid_at?: string | null;
  created_at?: string | null;
  plan_id?: string | null;
  plan?: { id?: string | null } | null;
  product?: { id?: string | null } | null;
  checkout_configuration_id?: string | null;
  total?: number | null;
  usd_total?: number | null;
  currency?: string | null;
  metadata?: Record<string, unknown> | null;
  user?: {
    id?: string | null;
    name?: string | null;
    username?: string | null;
    email?: string | null;
  } | null;
};

/**
 * Pagos de PRUEBA que manda el botón "send test event" del dashboard de Whop
 * (`pay_xxxxxxxxxxxxxx`, US$50, visto el 13/10). Nunca se acreditan ni alertan.
 */
export function isWhopTestPaymentId(id: string | null | undefined): boolean {
  return typeof id === "string" && /^pay_x+$/i.test(id.trim());
}

/** ¿Whop ya lo cobró? (`status: paid`; `paid_at` como respaldo). */
export function isPaid(payment: WhopPayment): boolean {
  return payment.status === "paid" || (!payment.status && !!payment.paid_at);
}

/** Monto en USD para mostrarle a Paolo (usd_total si viene; si no, total). */
export function paymentAmountUsd(payment: WhopPayment): number | null {
  const value =
    typeof payment.usd_total === "number"
      ? payment.usd_total
      : payment.currency === "usd" && typeof payment.total === "number"
        ? payment.total
        : null;
  return value !== null && Number.isFinite(value) ? value : null;
}

/** `plan_...` del pago, venga plano o anidado. */
export function paymentPlanId(payment: WhopPayment): string | null {
  const id = payment.plan_id ?? payment.plan?.id ?? null;
  return typeof id === "string" && id ? id : null;
}

/** Lee una clave del metadata como string no vacío. */
export function readMetaString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Metadata de una checkout configuration (`ch_...`). Es el "checkout guardado":
 * la creamos nosotros server-side con `{ clerk_user_id, pack_id }`, así que lo
 * que diga es tan confiable como el metadata del pago. Devuelve null si no se
 * pudo leer (nunca tira).
 */
export async function fetchCheckoutMetadata(
  checkoutConfigurationId: string,
): Promise<Record<string, unknown> | null> {
  if (!/^ch_[A-Za-z0-9]+$/.test(checkoutConfigurationId)) return null;
  try {
    const config = await whopFetch<{ metadata?: Record<string, unknown> | null }>(
      `/checkout_configurations/${encodeURIComponent(checkoutConfigurationId)}`,
      { timeoutMs: 5000 },
    );
    const metadata = config?.metadata;
    return metadata && typeof metadata === "object" ? metadata : null;
  } catch (err) {
    console.error(
      "[whop] No se pudo leer la checkout configuration:",
      checkoutConfigurationId,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Pagos de la cuenta creados desde `since` (más nuevos primero, hasta `limit`).
 * Tira si Whop falla: el caller decide qué hacer.
 */
export async function listWhopPaymentsSince(
  since: Date,
  limit = 50,
): Promise<WhopPayment[]> {
  const params = new URLSearchParams({
    account_id: getWhopAccountId(),
    created_after: since.toISOString(),
    first: String(Math.min(Math.max(limit, 1), 100)),
    order: "created_at",
    direction: "desc",
  });
  const res = await whopFetch<{ data?: WhopPayment[] | null }>(
    `/payments?${params.toString()}`,
    { timeoutMs: 6000 },
  );
  return Array.isArray(res?.data) ? res.data : [];
}
