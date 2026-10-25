/**
 * TEXTOS de los avisos. ISOMÓRFICO: lo usa el server (el `message` de las
 * rutas, el panel) y el browser (la campanita arma el texto desde kind + data).
 *
 * Reglas (spec de avisos, aprobadas por Paolo):
 *  - Tratamiento de vos, en pasado, contando la CONSECUENCIA (qué pasó con su
 *    plata), no la causa.
 *  - Al cliente NUNCA se le nombra a Google, Gemini, Whop ni "sin saldo", ni se
 *    le pasan códigos o textos crudos de error.
 *  - No se promete lo que no pasó: si `refunded` no es > 0, no se dice «te
 *    devolvimos» (ilimitados, o devolución que no ocurrió).
 *
 * Los textos son los EXACTOS de la spec. La única licencia: singular cuando el
 * número es 1 («1 crédito», «Salió 1 de 5»), porque «1 créditos» es un error.
 *
 * `data` viene de jsonb (puede faltar un campo o venir con otro tipo): todo se
 * lee con getters defensivos y el texto degrada sin romperse.
 */
import type {
  AdminAlertKind,
  AlertSeverity,
  MessageKind,
  MessagePayloads,
  NoticeKind,
  NoticePayloads,
} from "./types";
import { NOTICE_KINDS } from "./types";

/** Botón de un aviso. El href sale del kind (nunca de una columna). */
export type NoticeAction = { label: string; href: string };

export type RenderedNotice = { text: string; action: NoticeAction | null };

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

type Loose = Record<string, unknown>;

function asLoose(data: unknown): Loose {
  return data && typeof data === "object" && !Array.isArray(data) ? (data as Loose) : {};
}

/** Entero ≥ 0 o null. */
function int(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/** String no vacío (recortado, máx. 80) o null. */
function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t.slice(0, 80) : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** «1 crédito» / «5 créditos». */
function creditos(n: number): string {
  return n === 1 ? "1 crédito" : `${n} créditos`;
}

/** « de {producto}» o "". */
function deProducto(d: Loose): string {
  const product = text(d.product);
  return product ? ` de ${product}` : "";
}

/* -------------------------------------------------------------------------- */
/*  Textos fijos                                                               */
/* -------------------------------------------------------------------------- */

/** Banner global con la IA caída. */
export const AI_DOWN_BANNER =
  "Ahora no podemos generar ni analizar imágenes por un problema nuestro. Mientras dure, no se descuentan créditos. Podés seguir cargando tus productos y te avisamos acá cuando vuelva.";

const INPUT_BLOCKED_TEXT =
  "No pudimos usar estas fotos porque no cumplen las reglas de contenido. Probá con otras fotos o cambiá la descripción. Los créditos de este intento no se devuelven.";

const PAYMENT_UNMATCHED_TEXT =
  "Recibimos tu pago y estamos terminando de acreditarlo. Tus créditos llegan en menos de 24 h; no lo vuelvas a pagar.";

/* -------------------------------------------------------------------------- */
/*  Avisos guardados (campanita)                                               */
/* -------------------------------------------------------------------------- */

const NOTICE_BUILDERS: { [K in NoticeKind]: (d: Loose) => string } = {
  ai_restored: () => "Ya podés generar de nuevo.",

  batch_ready: (d) => {
    const k = int(d.k);
    if (k === 1) return `Tu foto${deProducto(d)} ya está en la Fábrica.`;
    if (k !== null && k > 1) return `Tus ${k} fotos${deProducto(d)} ya están en la Fábrica.`;
    return `Tus fotos${deProducto(d)} ya están en la Fábrica.`;
  },

  batch_partial: (d) => {
    const k = int(d.k);
    const n = int(d.n);
    const refunded = int(d.refunded) ?? 0;
    const salieron =
      k !== null && n !== null
        ? k === 1
          ? `Salió 1 de ${n} imágenes.`
          : `Salieron ${k} de ${n} imágenes.`
        : "No salieron todas las imágenes.";
    if (refunded <= 0) return salieron;
    const devolvimos =
      refunded === 1
        ? "Ya te devolvimos 1 crédito por la que faltó."
        : `Ya te devolvimos ${refunded} créditos por las que faltaron.`;
    return `${salieron} ${devolvimos}`;
  },

  batch_failed: (d) => {
    const base = "No pudimos terminar tus imágenes. Fue un problema nuestro, no de tus fotos.";
    const refunded = int(d.refunded) ?? 0;
    if (refunded <= 0) return base;
    const saldo = int(d.saldo);
    return saldo !== null
      ? `${base} Ya te devolvimos ${creditos(refunded)}: quedaste con ${saldo}.`
      : `${base} Ya te devolvimos ${creditos(refunded)}.`;
  },

  batch_timeout: (d) => {
    const base = `Tu tanda${deProducto(d)} no terminó por un problema nuestro.`;
    const refunded = int(d.refunded) ?? 0;
    return refunded > 0 ? `${base} Ya te devolvimos ${creditos(refunded)}.` : base;
  },

  regen_failed: (d) => {
    const base = "No pudimos terminar la imagen. Fue un problema nuestro.";
    const refunded = int(d.refunded) ?? 0;
    if (refunded <= 0) return base;
    const saldo = int(d.saldo);
    const loQue = refunded === 1 ? "el crédito" : creditos(refunded);
    return saldo !== null
      ? `${base} Ya te devolvimos ${loQue}: quedaste con ${saldo}.`
      : `${base} Ya te devolvimos ${loQue}.`;
  },

  analysis_failed: (d) => {
    const base = "No pudimos terminar el análisis. Fue un problema nuestro.";
    return (int(d.refunded) ?? 0) > 0 ? `${base} Ya te devolvimos el análisis.` : base;
  },

  refund_pending: (d) => {
    const base = "No pudimos terminar por un problema nuestro.";
    if (d.bucket === "analysis") {
      return `${base} Tu devolución del análisis está en proceso: te avisamos acá cuando entre.`;
    }
    const amount = int(d.amount);
    return amount !== null && amount > 0
      ? `${base} Tu devolución de ${creditos(amount)} está en proceso: te avisamos acá cuando entre.`
      : `${base} Tu devolución está en proceso: te avisamos acá cuando entre.`;
  },

  refund_landed: (d) => {
    if (d.bucket === "analysis") return "Ya entró tu devolución del análisis.";
    const refunded = int(d.refunded);
    return refunded !== null && refunded > 0
      ? `Ya entró tu devolución de ${creditos(refunded)}.`
      : "Ya entró tu devolución.";
  },

  input_blocked: () => INPUT_BLOCKED_TEXT,

  credits_low: (d) => {
    const n = int(d.n) ?? 0;
    if (n === 1) return "Te queda 1 crédito: alcanza para 1 imagen.";
    return `Te quedan ${n} créditos: alcanzan para ${n} imágenes.`;
  },

  purchase_credited: (d) => {
    const n = int(d.n);
    const pack = text(d.pack);
    if (n === null) return pack ? `Entraron tus créditos del ${pack}.` : "Entraron tus créditos.";
    return pack ? `Entraron tus ${creditos(n)} del ${pack}.` : `Entraron tus ${creditos(n)}.`;
  },

  payment_unmatched: () => PAYMENT_UNMATCHED_TEXT,
};

function fabricaHref(d: Loose): string {
  const versionId = typeof d.version_id === "string" ? d.version_id : "";
  return UUID_RE.test(versionId) ? `/fabrica/${versionId}` : "/fabrica";
}

const NOTICE_ACTIONS: Partial<{ [K in NoticeKind]: (d: Loose) => NoticeAction }> = {
  credits_low: () => ({ label: "Recargar", href: "/upgrade" }),
  batch_ready: (d) => ({ label: "Ver en la Fábrica", href: fabricaHref(d) }),
  batch_partial: (d) => ({ label: "Ver en la Fábrica", href: fabricaHref(d) }),
};

/** Texto de un aviso guardado, con payload tipado (server). */
export function noticeText<K extends NoticeKind>(kind: K, data: NoticePayloads[K]): string {
  return NOTICE_BUILDERS[kind](asLoose(data));
}

/** Botón del aviso, si tiene. */
export function noticeAction<K extends NoticeKind>(
  kind: K,
  data: NoticePayloads[K],
): NoticeAction | null {
  const build = NOTICE_ACTIONS[kind];
  return build ? build(asLoose(data)) : null;
}

export function isNoticeKind(kind: unknown): kind is NoticeKind {
  return typeof kind === "string" && (NOTICE_KINDS as readonly string[]).includes(kind);
}

/**
 * Para la CAMPANITA: arma texto + botón desde una fila cruda de
 * `user_notifications`. Kind desconocido → null (no se muestra: puede ser un
 * aviso nuevo que este bundle todavía no conoce).
 */
export function renderNotice(row: { kind: string; data: unknown }): RenderedNotice | null {
  if (!isNoticeKind(row.kind)) return null;
  const d = asLoose(row.data);
  const action = NOTICE_ACTIONS[row.kind];
  return { text: NOTICE_BUILDERS[row.kind](d), action: action ? action(d) : null };
}

/* -------------------------------------------------------------------------- */
/*  Mensajes que no se guardan (pantalla, banner, overlay)                     */
/* -------------------------------------------------------------------------- */

const MESSAGE_BUILDERS: { [K in MessageKind]: (d: Loose) => string } = {
  ai_down: () => AI_DOWN_BANNER,
  charge_failed: () =>
    "No pudimos empezar por un problema nuestro. No se te descontó nada. Probá de nuevo en un minuto.",
  photos_unreadable: () => "No pudimos usar estas fotos. Probá con otras. No se te descontó nada.",
  batch_in_progress: () => "Tu tanda sigue en curso: no la lances otra vez.",
  generation_reserved: (d) => {
    const n = int(d.n) ?? 0;
    if (n === 1) {
      return "Reservamos 1 crédito. Si la imagen no sale por un problema nuestro, te lo devolvemos solo.";
    }
    return `Reservamos ${n} créditos. Si alguna imagen no sale por un problema nuestro, te los devolvemos solos.`;
  },
  payment_delayed_paid: () =>
    "Ya recibimos tu pago y tus créditos vienen en camino. No lo vuelvas a pagar: te avisamos acá cuando entren.",
  payment_delayed_unconfirmed: () =>
    "Tu pago todavía se está confirmando. No lo vuelvas a pagar: te avisamos acá apenas se confirme.",
  payment_unmatched: () => PAYMENT_UNMATCHED_TEXT,
  checkout_failed: () => "No pudimos abrir el pago. No se hizo ningún cargo. Probá de nuevo en un minuto.",
  access_check_failed: () =>
    "No pudimos verificar tu cuenta. Si ya pagaste, no vuelvas a pagar: probá de nuevo en un minuto.",
  db_down: () => "Tenemos un problema técnico de nuestro lado. Probá de nuevo en unos minutos.",
};

/** Texto de un mensaje de pantalla (no se guarda). */
export function messageText<K extends MessageKind>(kind: K, data: MessagePayloads[K]): string {
  return MESSAGE_BUILDERS[kind](asLoose(data));
}

/* -------------------------------------------------------------------------- */
/*  Etiquetas para Paolo (panel y mails)                                       */
/* -------------------------------------------------------------------------- */

export const ADMIN_ALERT_LABELS: Record<AdminAlertKind, string> = {
  ai_down: "La IA está caída",
  batch_failed: "Falló una tanda después de cobrar",
  batch_partial: "Tanda incompleta",
  batch_timeout: "Tanda colgada",
  regen_failed: "Falló una regeneración",
  analysis_failed: "Falló un análisis",
  image_lost: "Se perdió una imagen ya pagada",
  refund_failed: "Falló una devolución",
  charge_failed: "Falló el descuento de créditos",
  input_blocked: "Fotos bloqueadas por reglas de contenido",
  output_block_capped: "Tope de devoluciones por bloqueo de la salida",
  access_check_failed: "Falló el chequeo de acceso",
  db_down: "La base no responde",
  checkout_failed: "No se pudo abrir el checkout",
  webhook_secret_missing: "Falta el secret del webhook de Whop",
  webhook_bad_signature: "Firma inválida en el webhook de Whop",
  webhook_bad_payload: "Webhook de Whop con datos rotos",
  payment_credit_failed: "Whop cobró y no se acreditó",
  payment_unmatched: "Pago estacionado sin acreditar",
  payment_unreconciled: "El cruce con Whop encontró ventas sin procesar",
  payment_disputed: "Contracargo o reembolso",
  payment_failed: "Pago rechazado o vencido",
  pass_paid_twice: "Pase Fundador pagado dos veces",
  purchase_email_failed: "No salió el mail de compra",
  purchase_credited: "Venta acreditada",
  credits_low: "Cliente con pocos créditos",
};

/** Etiqueta de un kind cualquiera (los desconocidos se muestran tal cual). */
export function adminAlertLabel(kind: string): string {
  return (ADMIN_ALERT_LABELS as Record<string, string>)[kind] ?? kind;
}

export const SEVERITY_LABELS: Record<AlertSeverity, string> = {
  U: "Urgente",
  M: "Media",
  B: "Baja",
};

/** Causa de la IA caída, en castellano, para Paolo (nunca para el cliente). */
export const AI_CAUSE_LABELS: Record<string, string> = {
  billing: "Google sin saldo (prepago agotado o billing apagado): recargá en AI Studio",
  invalid_key: "La API key de Google es inválida o fue revocada",
  missing_key: "Falta GOOGLE_API_KEY en el entorno",
  model_not_found: "El modelo no existe o fue retirado (404)",
};
