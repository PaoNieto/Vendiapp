import "server-only";
import type { GeminiError } from "@/lib/ai/gemini-client";
import { alertAdmin } from "./alert";
import { adminClientOrNull, errorText } from "./db";
import { notifyUser } from "./notify";
import { isPayingCustomer } from "./paying";
import { refundWithNotice } from "./refund";
import { messageText, noticeText } from "./textos";
import type {
  AdminAlertDetails,
  AdminAlertKind,
  AlertSeverity,
  RefundBucket,
  RefundNoticeData,
  RefundNoticeKind,
} from "./types";

/**
 * Piezas comunes de las rutas de IA (generations, regenerate, analyze, briefs):
 * la respuesta 503 con la IA caída, la devolución con su aviso (o el aviso de
 * «devolución en proceso» + alerta U si falla) y la severidad de las fallas.
 *
 * Contrato de error al cliente: SOLO `{ error, message, refunded,
 * notificationId? }`. `error` es un código fijo (enum de abajo) y `message` el
 * texto exacto de la spec. Nunca textos crudos de Google, de Postgres ni de
 * Storage: eso va a `admin_alerts`.
 */

export type AiRouteErrorCode =
  | "ai_unavailable"
  | "rate_limited"
  | "insufficient_credits"
  | "insufficient_analysis_credits"
  | "photos_unreadable"
  | "charge_failed"
  | "db_unavailable"
  | "input_blocked"
  | "generation_failed"
  | "analysis_failed"
  | "refund_pending";

export type AiRouteError = {
  error: AiRouteErrorCode;
  message: string;
  refunded: number;
  notificationId?: string | null;
};

/** Cuerpo del 503 con la IA caída (banner «Ahora no podemos generar…»). */
export function aiUnavailableBody(): AiRouteError {
  return { error: "ai_unavailable", message: messageText("ai_down", {}), refunded: 0 };
}

/** «No pudimos empezar por un problema nuestro. No se te descontó nada…» */
export function chargeFailedBody(): AiRouteError {
  return { error: "charge_failed", message: messageText("charge_failed", {}), refunded: 0 };
}

/** «Tenemos un problema técnico de nuestro lado…» */
export function dbDownBody(): AiRouteError {
  return { error: "db_unavailable", message: messageText("db_down", {}), refunded: 0 };
}

/** 429 del tope por hora (mismo texto que el de las tandas). */
export function rateLimitedBody(limitHour: number): AiRouteError {
  return {
    error: "rate_limited",
    message: `Llegaste al máximo de intentos por ahora (${limitHour} por hora). Esperá un rato y seguí.`,
    refunded: 0,
  };
}

/**
 * Topes por usuario de regenerar y analizar (RPC `check_action_rate_limit`,
 * migración 0028). Holgados: están para cortar un bucle (cada intento cuesta
 * Gemini y, si falla por bloqueo de la salida, se devuelve), no para racionar.
 */
export const ACTION_RATE_LIMITS = {
  regenerate: { perHour: 60, perDay: 300 },
  analyze: { perHour: 30, perDay: 100 },
} as const;

export type RateLimitedAction = keyof typeof ACTION_RATE_LIMITS;

/**
 * ¿Puede hacer otro intento? FAIL-OPEN (mismo criterio que el tope de tandas):
 * si la RPC falla o no existe todavía, deja pasar. Llamalo DESPUÉS del portero
 * de la IA (un 503 no gasta cupo) y ANTES de cobrar.
 */
export async function checkActionRateLimit(
  userId: string,
  action: RateLimitedAction,
): Promise<{ allowed: boolean; limitHour: number }> {
  const limits = ACTION_RATE_LIMITS[action];
  const open = { allowed: true, limitHour: limits.perHour };
  const admin = adminClientOrNull();
  if (!admin) return open;
  try {
    const { data, error } = await admin.rpc("check_action_rate_limit", {
      p_user_id: userId,
      p_action: action,
      p_per_hour: limits.perHour,
      p_per_day: limits.perDay,
    });
    if (error) {
      console.error(`[avisos] check_action_rate_limit falló (${action}):`, error.message);
      return open;
    }
    const row = (Array.isArray(data) ? data[0] : data) as { allowed?: boolean } | null;
    return { allowed: row?.allowed !== false, limitHour: limits.perHour };
  } catch (err) {
    console.error(`[avisos] check_action_rate_limit tiró (${action}):`, errorText(err));
    return open;
  }
}

/** Google bloqueó la SALIDA (finishReason IMAGE_SAFETY, etc.): por regla se devuelve, con tope. */
export function isOutputBlocked(error: GeminiError | null | undefined): boolean {
  return !!error && error.kind === "content_blocked" && error.stage === "output";
}

/** Más de esto por usuario en 24 h dejan de devolverse (se tratan como entrada bloqueada). */
export const OUTPUT_BLOCK_REFUNDS_PER_DAY = 3;

/**
 * Tope de devoluciones por bloqueo de la SALIDA. true = este se devuelve (y
 * queda contado); false = pasó el tope: NO se devuelve, se trata como entrada
 * bloqueada y se abre `output_block_capped` (M, una por usuario). Si la RPC
 * falla, devuelve true: ante la duda, la regla de Paolo (se devuelve).
 */
export async function claimOutputBlockRefund(userId: string): Promise<boolean> {
  const admin = adminClientOrNull();
  if (!admin) return true;
  try {
    const { data, error } = await admin.rpc("claim_output_block_refund", {
      p_user_id: userId,
      p_max_per_day: OUTPUT_BLOCK_REFUNDS_PER_DAY,
    });
    if (error) {
      console.error("[avisos] claim_output_block_refund falló:", error.message);
      return true;
    }
    return data !== false;
  } catch (err) {
    console.error("[avisos] claim_output_block_refund tiró:", errorText(err));
    return true;
  }
}

/** Alerta M del tope de bloqueos de la salida (una abierta por usuario). NUNCA tira. */
export async function alertOutputBlockCapped(input: {
  userId: string;
  route: string;
  details: Record<string, unknown>;
}): Promise<void> {
  await alertAdmin({
    kind: "output_block_capped",
    severity: "M",
    dedupeKey: `output_block_capped:${input.userId}`,
    userId: input.userId,
    details: { ...input.details, route: input.route, limit_per_day: OUTPUT_BLOCK_REFUNDS_PER_DAY },
  });
}

/** «No pudimos usar estas fotos. Probá con otras. No se te descontó nada.» */
export function photosUnreadableBody(): AiRouteError {
  return { error: "photos_unreadable", message: messageText("photos_unreadable", {}), refunded: 0 };
}

/**
 * Severidad de una falla que le tocó a un cliente: U si pagó (mail a Paolo en
 * el momento, para que le escriba), M si no (cortesía / admin). Con la IA caída
 * va M: la alerta U `ai_down` ya cubre el problema y no hace falta un mail por
 * cada tanda.
 */
export async function failureSeverity(
  userId: string,
  opts: { outage?: boolean } = {},
): Promise<{ severity: AlertSeverity; paying: boolean }> {
  const paying = await isPayingCustomer(userId);
  if (opts.outage) return { severity: "M", paying };
  return { severity: paying ? "U" : "M", paying };
}

/** Hora UTC `yyyymmddhh` (llave de las fallas de un cliente). */
function hourKey(now = new Date()): string {
  return now.toISOString().slice(0, 13).replace(/[-T]/g, "");
}

/**
 * Alerta de una falla con la severidad de arriba. NUNCA tira.
 *
 * Llave POR USUARIO Y HORA (`failure:<uid>:<yyyymmddhh>`), no por pedido: un
 * cliente que fuerza fallas suma `occurrences` en UNA alerta (como mucho un
 * mail por hora), no un U por intento. La llave del evento (`dedupeKey`) queda
 * en `details.event_key` para el panel.
 */
export async function alertFailure<K extends AdminAlertKind>(input: {
  kind: K;
  userId: string;
  dedupeKey: string;
  outage?: boolean;
  details: AdminAlertDetails[K];
}): Promise<void> {
  try {
    const { severity, paying } = await failureSeverity(input.userId, { outage: input.outage });
    await alertAdmin({
      kind: input.kind,
      severity,
      dedupeKey: `failure:${input.userId}:${hourKey()}`,
      userId: input.userId,
      details: { ...input.details, paying, event_key: input.dedupeKey } as AdminAlertDetails[K],
    });
  } catch (err) {
    console.error("[avisos] alertFailure tiró:", err instanceof Error ? err.message : err);
  }
}

export type RefundOutcome = {
  /** refunded / unlimited / duplicate = la plata está bien; pending = la devolución falló. */
  status: "refunded" | "unlimited" | "duplicate" | "pending";
  /** Créditos que DE VERDAD volvieron (0 si ilimitado o si quedó pendiente). */
  refunded: number;
  /** Saldo de la bolsa después de devolver (si se sabe). */
  balance: number | null;
  notificationId: string | null;
  /** Texto exacto para el `message` de la respuesta. */
  message: string;
};

/**
 * Devuelve `amount` créditos con su aviso (misma transacción, idempotente por
 * `noticeKey`). Si la devolución FALLA:
 *  - aviso «Tu devolución de {n} créditos está en proceso…» con la MISMA llave
 *    (así la tanda igual termina con su único aviso `gen:<id>`);
 *  - alerta U `refund_failed` con llave `refund_failed:<noticeKey>`, que el
 *    reintento del cron (retryFailedRefunds) resuelve solo.
 * NUNCA tira.
 */
export async function refundOrPend<K extends RefundNoticeKind>(input: {
  userId: string;
  amount: number;
  bucket: RefundBucket;
  kind: K;
  data: RefundNoticeData[K];
  noticeKey: string;
  generationId?: string | null;
  versionId?: string | null;
  product?: string | null;
}): Promise<RefundOutcome> {
  const amount = Math.max(0, Math.floor(input.amount));
  const loose = (input.data ?? {}) as Record<string, unknown>;

  const result =
    amount > 0
      ? await refundWithNotice({
          userId: input.userId,
          amount,
          bucket: input.bucket,
          kind: input.kind,
          data: input.data,
          dedupeKey: input.noticeKey,
        })
      : ({ ok: false, error: "monto 0" } as const);

  if (result.ok) {
    if (result.status === "refunded") {
      const saldoField = input.bucket === "analysis" ? "saldo_analisis" : "saldo";
      return {
        status: "refunded",
        refunded: amount,
        balance: result.balance,
        notificationId: result.notificationId,
        message: renderRefundNotice(input.kind, {
          ...loose,
          refunded: amount,
          bucket: input.bucket,
          [saldoField]: result.balance,
        }),
      };
    }
    if (result.status === "unlimited") {
      return {
        status: "unlimited",
        refunded: 0,
        balance: null,
        notificationId: result.notificationId,
        message: renderRefundNotice(input.kind, { ...loose, refunded: 0 }),
      };
    }
    // duplicate: esa llave ya tenía su devolución (un reintento). La plata está.
    return {
      status: "duplicate",
      refunded: amount,
      balance: null,
      notificationId: result.notificationId,
      message: renderRefundNotice(input.kind, { ...loose, refunded: amount, bucket: input.bucket }),
    };
  }

  // La devolución NO ocurrió: aviso «en proceso» + alerta U para el reintento.
  const pendingData = {
    amount,
    bucket: input.bucket,
    generation_id: input.generationId ?? null,
    version_id: input.versionId ?? null,
    product: input.product ?? null,
  };
  const notificationId = await notifyUser(input.userId, "refund_pending", pendingData, input.noticeKey);
  await alertAdmin({
    kind: "refund_failed",
    severity: "U",
    dedupeKey: `refund_failed:${input.noticeKey}`,
    userId: input.userId,
    details: {
      amount,
      bucket: input.bucket,
      notice_key: input.noticeKey,
      generation_id: input.generationId ?? null,
      error: result.error,
    },
  });

  const pendingText = noticeText("refund_pending", pendingData);
  let message = pendingText;
  if (input.kind === "batch_partial") {
    // «Salieron k de n imágenes.» + «Tu devolución de … está en proceso…»
    const salieron = renderRefundNotice("batch_partial", { ...loose, refunded: 0 });
    const tail = pendingText.replace(/^No pudimos terminar por un problema nuestro\.\s*/, "");
    message = `${salieron} ${tail}`;
  }
  return { status: "pending", refunded: 0, balance: null, notificationId, message };
}

/** Texto del aviso de devolución con los campos que agrega SQL ya puestos. */
function renderRefundNotice(kind: RefundNoticeKind, data: Record<string, unknown>): string {
  return noticeText(kind, data as never);
}
