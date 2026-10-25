/**
 * CONTRATO del sistema de avisos (migración 0028). ISOMÓRFICO a propósito: lo
 * importan el server (rutas, webhook, cron, panel) y el browser (la campanita
 * lee `user_notifications` directo de Supabase con el token de Clerk).
 *
 * Regla de oro: la base guarda el HECHO (`kind` + `data`); el texto lo arma
 * `lib/avisos/textos.ts`. Cambiar la copy no requiere migración.
 *
 * ⚠️ Los campos de `data` van en snake_case porque viven en jsonb y algunos los
 * escribe SQL directo (reaper, devoluciones). No renombrar sin migrar.
 */

/* -------------------------------------------------------------------------- */
/*  Avisos al CLIENTE que se GUARDAN (campanita)                               */
/* -------------------------------------------------------------------------- */

/** Bolsa de créditos a la que vuelve una devolución. */
export type RefundBucket = "generation" | "analysis";

/** Campos que agrega SQL al devolver (`refund_credits_with_notice` / reaper). */
type RefundFields = {
  /** Créditos devueltos (0 = no hubo devolución: ilimitado o nada que devolver). */
  refunded?: number;
  bucket?: RefundBucket;
  /** Saldo de GENERACIÓN después de devolver. */
  saldo?: number | null;
  /** Saldo de ANÁLISIS después de devolver. */
  saldo_analisis?: number | null;
};

/** Referencias opcionales a la tanda (para el botón y para el panel). */
type BatchRef = {
  generation_id?: string | null;
  version_id?: string | null;
  /** Nombre del producto (projects.name). */
  product?: string | null;
};

/**
 * kind → payload de cada aviso guardado.
 *
 * Dedupe (ver NOTICE_KEYS): toda tanda COBRADA termina con exactamente un aviso
 * `gen:<generation_id>` — es la marca server-side de "la ruta terminó" que usa
 * el reaper de tandas colgadas.
 */
export type NoticePayloads = {
  /** «Ya podés generar de nuevo.» — lo crea ai_mark_up para cada watcher. */
  ai_restored: { down_since?: string | null; source?: string | null };
  /** «Tus {k} fotos de {producto} ya están en la Fábrica.» (tanda OK; si el cliente la vio, se marca leído). */
  batch_ready: BatchRef & { k: number };
  /** «Salieron {k} de {n} imágenes. Ya te devolvimos {n−k} créditos por las que faltaron.» */
  batch_partial: BatchRef & RefundFields & { k: number; n: number };
  /** «No pudimos terminar tus imágenes. Fue un problema nuestro, no de tus fotos. Ya te devolvimos {n} créditos: quedaste con {saldo}.» */
  batch_failed: BatchRef & RefundFields;
  /** «Tu tanda de {producto} no terminó por un problema nuestro. Ya te devolvimos {n} créditos.» (reaper) */
  batch_timeout: BatchRef & RefundFields;
  /** «No pudimos terminar la imagen. Fue un problema nuestro. Ya te devolvimos el crédito: quedaste con {saldo}.» */
  regen_failed: BatchRef & RefundFields;
  /** «No pudimos terminar el análisis. Fue un problema nuestro. Ya te devolvimos el análisis.» */
  analysis_failed: RefundFields & { analysis_id?: string | null };
  /** «… Tu devolución de {n} créditos está en proceso: te avisamos acá cuando entre.» */
  refund_pending: BatchRef & { amount: number; bucket: RefundBucket };
  /** «Ya entró tu devolución de {n} créditos.» */
  refund_landed: RefundFields;
  /** «No pudimos usar estas fotos porque no cumplen las reglas de contenido. … no se devuelven.» */
  input_blocked: BatchRef;
  /** «Te quedan {n} créditos: alcanzan para {n} imágenes.» [Recargar] — n entre 1 y 4, una vez por compra. */
  credits_low: { n: number };
  /** «Entraron tus {n} créditos del {pack}.» */
  purchase_credited: { n: number; pack?: string | null; analysis?: number | null };
  /** «Recibimos tu pago y estamos terminando de acreditarlo. Tus créditos llegan en menos de 24 h; no lo vuelvas a pagar.» */
  payment_unmatched: { pack?: string | null };
};

export type NoticeKind = keyof NoticePayloads;

export const NOTICE_KINDS = [
  "ai_restored",
  "batch_ready",
  "batch_partial",
  "batch_failed",
  "batch_timeout",
  "regen_failed",
  "analysis_failed",
  "refund_pending",
  "refund_landed",
  "input_blocked",
  "credits_low",
  "purchase_credited",
  "payment_unmatched",
] as const satisfies readonly NoticeKind[];

/**
 * Avisos que se crean JUNTO con una devolución (refundWithNotice) y lo que
 * manda la ruta en cada uno. `refunded`, `bucket` y el saldo los agrega SQL.
 */
export type RefundNoticeData = {
  batch_failed: BatchRef;
  batch_partial: BatchRef & { k: number; n: number };
  batch_timeout: BatchRef;
  regen_failed: BatchRef;
  analysis_failed: { analysis_id?: string | null };
  refund_landed: Record<string, never>;
};

export type RefundNoticeKind = keyof RefundNoticeData;

/**
 * Avisos que CONFIRMAN una devolución hecha: si existe uno con la llave de la
 * tanda, la plata ya volvió (los escribe SQL en la misma transacción que el
 * grant). Lo usa el reintento de devoluciones para no devolver dos veces.
 */
export const REFUND_CONFIRMED_KINDS: readonly NoticeKind[] = [
  "batch_failed",
  "batch_partial",
  "batch_timeout",
  "regen_failed",
  "analysis_failed",
  "refund_landed",
];

/* -------------------------------------------------------------------------- */
/*  Mensajes al cliente que NO se guardan (pantalla, banner, overlay)          */
/* -------------------------------------------------------------------------- */

type Empty = Record<string, never>;

export type MessagePayloads = {
  /** Banner global con la IA caída (lo prende service_status.ok = false). */
  ai_down: Empty;
  /** Falló el descuento de créditos (antes, la ruta decía "sin créditos"). */
  charge_failed: Empty;
  /** Fotos ilegibles detectadas ANTES de cobrar. */
  photos_unreadable: Empty;
  /** Se cortó la red con la tanda en curso. */
  batch_in_progress: Empty;
  /** Overlay de "Creando…". No mostrar a ilimitados (no se les reserva nada). */
  generation_reserved: { n: number };
  /** Pago demorado (más de 90 s), Whop ya cobró. */
  payment_delayed_paid: Empty;
  /** Pago demorado, todavía sin confirmar. */
  payment_delayed_unconfirmed: Empty;
  /** Pago cobrado y sin acreditar (sabemos quién pagó). */
  payment_unmatched: Empty;
  /** El checkout no abrió. */
  checkout_failed: Empty;
  /** Falló el chequeo de acceso: pantalla de error, NUNCA mandar a /comprar ni /plan. */
  access_check_failed: Empty;
  /** La base no responde. */
  db_down: Empty;
};

export type MessageKind = keyof MessagePayloads;

/* -------------------------------------------------------------------------- */
/*  Alertas a PAOLO                                                            */
/* -------------------------------------------------------------------------- */

/** U = mail ya + panel (re-mail a las 6 h y al resolverse) · M = panel + resumen diario · B = solo panel. */
export type AlertSeverity = "U" | "M" | "B";

/** Causa de la IA caída (service_status.reason). */
export type AiCause = "billing" | "invalid_key" | "missing_key" | "model_not_found";

/** Contexto común. Cualquier dato extra entra por el índice (se muestra escapado). */
type AlertBase = { [extra: string]: unknown };

type AlertGeneration = AlertBase & {
  generation_id?: string | null;
  version_id?: string | null;
  product?: string | null;
  /** Créditos cobrados / devueltos / imágenes entregadas. */
  charged?: number | null;
  refunded?: number | null;
  delivered?: number | null;
  requested?: number | null;
  /** Causa interna (ej. 'billing', 'upload_failed', 'IMAGE_SAFETY'). Nunca va al cliente. */
  cause?: string | null;
  /** Texto crudo del proveedor. Solo para Paolo (va escapado al mail). */
  raw?: string | null;
  paying?: boolean | null;
};

type AlertPayment = AlertBase & {
  whop_payment_id?: string | null;
  plan_id?: string | null;
  pack?: string | null;
  amount_usd?: number | null;
  customer_email?: string | null;
  cause?: string | null;
  raw?: string | null;
};

export type AdminAlertDetails = {
  /** La IA está caída (dedupe 'ai_down'). Lo abre markAiDown, lo cierra markAiUp. */
  ai_down: AlertBase & { cause: AiCause; model?: string | null; status?: number | null; message?: string | null };
  batch_failed: AlertGeneration;
  batch_partial: AlertGeneration;
  /** Tanda colgada (reaper). needs_review = no se pudo devolver solo. */
  batch_timeout: AlertGeneration & { needs_review?: boolean };
  regen_failed: AlertGeneration;
  analysis_failed: AlertGeneration & { analysis_id?: string | null };
  /** Imagen generada (pagada a Google) que no se pudo guardar ni reintentando. */
  image_lost: AlertGeneration & { stage?: "storage" | "signed_url" | "insert" | "postprocess" | null };
  /**
   * Falló una devolución. El reintento (retryFailedRefunds) lee de acá:
   * amount + bucket + notice_key (la llave del aviso de la tanda, 'gen:<id>').
   * ⚠️ dedupeKey ÚNICA por devolución (ej. 'refund_failed:gen:<id>'): si dos
   * devoluciones compartieran llave, se devolvería una sola.
   */
  refund_failed: AlertBase & {
    amount: number;
    bucket: RefundBucket;
    notice_key: string;
    generation_id?: string | null;
    error?: string | null;
  };
  /** Falló el descuento de créditos por algo que no es falta de saldo. */
  charge_failed: AlertBase & { route?: string | null; error?: string | null };
  /** Google bloqueó la ENTRADA (promptFeedback.blockReason): contador, sin devolución. */
  input_blocked: AlertGeneration & { block_reason?: string | null };
  /**
   * Un cliente pasó el tope de devoluciones por bloqueo de la SALIDA (más de 3
   * en 24 h): ese intento ya no se devolvió. Dedupe por usuario.
   */
  output_block_capped: AlertGeneration & { route?: string | null; block_reason?: string | null };
  /** El chequeo de acceso no respondió (puede rebotar a un pagador). */
  access_check_failed: AlertBase & { route?: string | null; error?: string | null };
  /** La base no responde. Sale por mail directo (no pasa por la base). */
  db_down: AlertBase & { where?: string | null; error?: string | null };
  checkout_failed: AlertPayment & { status?: number | null };
  webhook_secret_missing: AlertBase;
  webhook_bad_signature: AlertBase & { reason?: string | null };
  webhook_bad_payload: AlertPayment;
  /** Whop cobró y la acreditación falló. */
  payment_credit_failed: AlertPayment;
  /** Pago estacionado en whop_unmatched_payments. */
  payment_unmatched: AlertPayment;
  /** El cruce con Whop encontró ventas cobradas sin procesar. */
  payment_unreconciled: AlertPayment & { count?: number | null };
  payment_disputed: AlertPayment & { event?: string | null };
  payment_failed: AlertPayment & { method?: string | null };
  pass_paid_twice: AlertPayment;
  purchase_email_failed: AlertPayment & { result?: string | null };
  purchase_credited: AlertPayment & { credits?: number | null };
  credits_low: AlertBase & { balance?: number | null };
};

export type AdminAlertKind = keyof AdminAlertDetails;

/* -------------------------------------------------------------------------- */
/*  Llaves de dedupe (protocolo)                                               */
/* -------------------------------------------------------------------------- */

/**
 * Llaves de dedupe de los avisos al cliente. Usarlas SIEMPRE desde acá: el
 * reaper y el reintento de devoluciones dependen de este formato.
 */
export const NOTICE_KEYS = {
  /** El ÚNICO aviso de resultado de una tanda cobrada (lista/parcial/fallida/bloqueada/devolución pendiente). */
  batch: (generationId: string) => `gen:${generationId}`,
  /** Una regeneración (cobra 1 sobre la tanda madre): llave única por pedido. */
  regen: (generationId: string, requestId: string) => `regen:${generationId}:${requestId}`,
  /** Un análisis: llave única por pedido. */
  analysis: (requestId: string) => `ana:${requestId}`,
  /** El aviso de que entró una devolución que había fallado. */
  refundLanded: (alertDedupeKey: string) => `refund_landed:${alertDedupeKey}`,
  /** Créditos bajos: uno por compra (id de la fila 'purchase' del ledger). */
  creditsLow: (purchaseLedgerId: string) => `credits_low:${purchaseLedgerId}`,
  /** Compra acreditada / pago estacionado: uno por pago de Whop. */
  purchase: (whopPaymentId: string) => `purchase:${whopPaymentId}`,
  paymentUnmatched: (whopPaymentId: string) => `payment_unmatched:${whopPaymentId}`,
} as const;

/* -------------------------------------------------------------------------- */
/*  Filas (lo que devuelve la base)                                            */
/* -------------------------------------------------------------------------- */

/**
 * Columnas que lee la campanita. RLS ya filtra por usuario; igual conviene
 * `.eq("user_id", userId)` para que use el índice.
 */
export const USER_NOTIFICATION_COLUMNS = "id, kind, data, read_at, created_at";

export type UserNotificationRow = {
  id: string;
  kind: string;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

/**
 * Columnas de `service_status` visibles para el cliente. ⚠️ Pedir SOLO estas
 * (con `.eq("id", "ai")`): `select("*")` da permission denied (42501), porque
 * `reason` y `next_probe_at` no están concedidas.
 */
export const SERVICE_STATUS_PUBLIC_COLUMNS = "ok, since";

export type ServiceStatusPublic = { ok: boolean; since: string };

/** Fila de `admin_alerts` (solo server / panel). */
export type AdminAlertRow = {
  id: string;
  kind: string;
  severity: AlertSeverity;
  dedupe_key: string;
  details: Record<string, unknown>;
  user_id: string | null;
  occurrences: number;
  first_seen: string;
  last_seen: string;
  last_emailed_at: string | null;
  resolved_at: string | null;
};
