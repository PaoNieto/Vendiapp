import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { adminClientOrNull, errorText, num, rpcArray, rpcObject, runAfter, str, type AdminClient } from "./db";
import {
  formatAgo,
  formatLima,
  formatValue,
  sendAdminMail,
  type AdminMail,
  type MailRow,
} from "./mail";
import { AI_CAUSE_LABELS, adminAlertLabel, SEVERITY_LABELS } from "./textos";
import type { AdminAlertDetails, AdminAlertKind, AlertSeverity } from "./types";

/**
 * ALERTAS A PAOLO.
 *
 *  - U = mail en el momento + panel; otro mail a las 6 h si sigue abierta (al
 *        repetirse, o con `remindOpenUrgentAlerts`) y otro al resolverse sola.
 *  - M = panel + resumen diario de las 8:00 (Lima).
 *  - B = solo panel.
 *
 * Dedupe por `dedupeKey`: si la alerta abierta se repite, sube `occurrences`
 * (la RPC `admin_alert_raise` lo hace atómico entre instancias). La decisión de
 * mandar mail y su "reserva" también viven en la RPC: entre N instancias sale
 * UN mail. Frenos: anti idas y vueltas (30 min por llave) y tope global de
 * urgentes por hora (JonSnow #7).
 *
 * El mail se manda DESPUÉS de responder (`after()`): una alerta nunca demora
 * ni rompe la ruta que la dispara. Si la BASE no responde, mail directo con
 * freno en memoria: 1 por tipo cada 10 min (por instancia).
 *
 * Severidad de los urgentes del cobro (regla de la spec): U solo por secret
 * faltante, acreditación fallida o el cruce con Whop. Firma inválida suelta = B
 * (cualquiera le manda basura al webhook).
 *
 * NADA acá tira.
 */

export type AlertAdminInput<K extends AdminAlertKind> = {
  kind: K;
  severity: AlertSeverity;
  /** Llave de dedupe. Misma llave = mismo problema (sube occurrences). */
  dedupeKey: string;
  details?: AdminAlertDetails[K];
  /** Cliente afectado (id de Clerk), si hay. */
  userId?: string | null;
  /**
   * Escalada por ráfaga: con `atOccurrences` repeticiones dentro de
   * `withinMinutes` desde la primera, pasa a U (ej. chequeo de acceso: 5 en 10).
   */
  escalate?: { atOccurrences: number; withinMinutes: number };
};

export type AlertAdminResult = {
  /** Quedó guardada en admin_alerts. */
  stored: boolean;
  id: string | null;
  occurrences: number | null;
  /** Se reservó un mail para esta alerta (sale en after()). */
  emailed: boolean;
};

/** Tope global de mails urgentes por hora (además del anti idas y vueltas). */
const MAIL_CAP_PER_HOUR = 12;

export async function alertAdmin<K extends AdminAlertKind>(
  input: AlertAdminInput<K>,
): Promise<AlertAdminResult> {
  const failed: AlertAdminResult = { stored: false, id: null, occurrences: null, emailed: false };
  if (!input.dedupeKey) {
    console.error("[avisos] alertAdmin sin dedupeKey:", input.kind);
    return failed;
  }
  const details = sanitizeDetails(input.details);

  const admin = adminClientOrNull();
  if (!admin) {
    directMail(input.kind, input.severity, details, input.userId ?? null, "sin cliente admin de Supabase");
    return failed;
  }

  try {
    const { data, error } = await admin.rpc("admin_alert_raise", {
      p_kind: input.kind,
      p_severity: input.severity,
      p_dedupe_key: input.dedupeKey,
      p_details: details,
      p_user_id: input.userId ?? null,
      p_escalate_at: input.escalate?.atOccurrences ?? null,
      p_escalate_within_minutes: input.escalate?.withinMinutes ?? null,
      p_mail_cap_per_hour: MAIL_CAP_PER_HOUR,
    });
    if (error) {
      console.error(`[avisos] admin_alert_raise falló (${input.kind}):`, error.message);
      directMail(input.kind, input.severity, details, input.userId ?? null, error.message);
      return failed;
    }
    const row = rpcObject(data);
    const emailed = row?.should_email === true;
    if (row && emailed) {
      runAfter(() => emailAlert(admin, row));
    }
    return {
      stored: true,
      id: str(row?.id),
      occurrences: num(row?.occurrences),
      emailed,
    };
  } catch (err) {
    console.error(`[avisos] admin_alert_raise tiró (${input.kind}):`, errorText(err));
    directMail(input.kind, input.severity, details, input.userId ?? null, errorText(err));
    return failed;
  }
}

/**
 * Cierra la alerta abierta de esa llave. Si era U y a Paolo le había llegado el
 * mail de apertura, le avisa que se resolvió (salvo `notify: false`, ej. cuando
 * la cierra él mismo desde el panel). NUNCA tira.
 */
export async function resolveAlert(
  dedupeKey: string,
  opts: { resolution?: Record<string, unknown>; notify?: boolean } = {},
): Promise<{ resolved: boolean }> {
  const admin = adminClientOrNull();
  if (!admin || !dedupeKey) return { resolved: false };
  try {
    const { data, error } = await admin.rpc("admin_alert_resolve", {
      p_dedupe_key: dedupeKey,
      p_resolution: opts.resolution ? sanitizeDetails(opts.resolution) : null,
    });
    if (error) {
      console.error(`[avisos] admin_alert_resolve falló (${dedupeKey}):`, error.message);
      return { resolved: false };
    }
    const row = rpcObject(data);
    if (!row) return { resolved: false };
    if (row.should_email === true && opts.notify !== false) {
      runAfter(async () => {
        await sendAdminMail(resolvedMail(row));
      });
    }
    return { resolved: true };
  } catch (err) {
    console.error(`[avisos] admin_alert_resolve tiró (${dedupeKey}):`, errorText(err));
    return { resolved: false };
  }
}

/**
 * Recordatorio de las U que siguen abiertas: las que no tienen mail (frenadas
 * por el tope) o cuyo último mail tiene más de 6 h. Pensado para el cron y para
 * cuando Paolo abre el panel. Devuelve cuántas reservó. NUNCA tira.
 */
export async function remindOpenUrgentAlerts(limit = 10): Promise<number> {
  const admin = adminClientOrNull();
  if (!admin) return 0;
  try {
    const { data, error } = await admin.rpc("admin_alert_claim_reminders", {
      p_limit: limit,
      p_mail_cap_per_hour: MAIL_CAP_PER_HOUR,
    });
    if (error) {
      console.error("[avisos] admin_alert_claim_reminders falló:", error.message);
      return 0;
    }
    const rows = rpcArray(data);
    for (const row of rows) {
      runAfter(() => emailAlert(admin, { ...row, is_new: false }, { restoreOnFailure: false }));
    }
    return rows.length;
  } catch (err) {
    console.error("[avisos] admin_alert_claim_reminders tiró:", errorText(err));
    return 0;
  }
}

/* -------------------------------------------------------------------------- */
/*  Mails                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Manda el mail de una alerta U ya reservada. Si no sale, libera la reserva
 * (vuelve last_emailed_at al valor anterior) para que el próximo raise lo
 * reintente.
 */
async function emailAlert(
  admin: AdminClient,
  row: Record<string, unknown>,
  opts: { restoreOnFailure?: boolean } = {},
): Promise<void> {
  const userId = str(row.user_id);
  const email = await lookupUserEmail(userId);
  const result = await sendAdminMail(alertMail(row, email));
  if (result === "sent" || opts.restoreOnFailure === false) return;

  const id = str(row.id);
  const emailedAt = str(row.emailed_at);
  if (!id || !emailedAt) return;
  try {
    await admin
      .from("admin_alerts")
      .update({ last_emailed_at: str(row.prev_emailed_at) })
      .eq("id", id)
      .eq("last_emailed_at", emailedAt);
  } catch (err) {
    console.error("[avisos] No se pudo liberar la reserva del mail:", errorText(err));
  }
}

function detailRows(details: unknown): MailRow[] {
  if (!details || typeof details !== "object" || Array.isArray(details)) return [];
  return Object.entries(details as Record<string, unknown>)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .slice(0, 25)
    .map(([key, value]) => ({ label: key.replace(/_/g, " "), value: formatValue(value) }));
}

function clientRow(userId: string | null, email: string | null): MailRow[] {
  if (!userId) return [];
  return [{ label: "Cliente", value: email ? `${email} · ${userId}` : userId }];
}

function alertLead(row: Record<string, unknown>): string {
  const kind = str(row.kind) ?? "";
  const details = (row.details ?? {}) as Record<string, unknown>;
  if (kind === "ai_down") {
    const cause = str(details.cause);
    const label = cause ? AI_CAUSE_LABELS[cause] ?? cause : null;
    return label
      ? `${label}. Mientras dure, la app corta antes de cobrar y el cliente ve el banner.`
      : "Mientras dure, la app corta antes de cobrar y el cliente ve el banner.";
  }
  const occurrences = num(row.occurrences) ?? 1;
  const firstSeen = str(row.first_seen);
  return occurrences > 1
    ? `Se repitió ${occurrences} veces desde ${formatLima(firstSeen)} (${formatAgo(firstSeen)}).`
    : `Pasó el ${formatLima(firstSeen)}.`;
}

function alertMail(row: Record<string, unknown>, email: string | null): AdminMail {
  const kind = str(row.kind) ?? "alerta";
  const label = adminAlertLabel(kind);
  const isNew = row.is_new !== false;
  return {
    subject: `[Vendí · Urgente] ${label}${isNew ? "" : " (sigue abierta)"}`,
    badge: SEVERITY_LABELS.U,
    tone: "urgent",
    eyebrow: isNew ? "Alerta nueva" : "Sigue abierta",
    title: label,
    lead: alertLead(row),
    cards: [
      {
        heading: "Detalle",
        rows: [
          ...clientRow(str(row.user_id), email),
          ...detailRows(row.details),
          { label: "Veces", value: String(num(row.occurrences) ?? 1) },
          { label: "Desde", value: formatLima(str(row.first_seen)) },
          { label: "Llave", value: str(row.dedupe_key) ?? "—" },
        ],
      },
    ],
  };
}

function resolvedMail(row: Record<string, unknown>): AdminMail {
  const label = adminAlertLabel(str(row.kind) ?? "alerta");
  const firstSeen = str(row.first_seen);
  return {
    subject: `[Vendí · Resuelta] ${label}`,
    badge: "Resuelta",
    tone: "ok",
    eyebrow: "Se resolvió",
    title: label,
    lead: `Estuvo abierta desde el ${formatLima(firstSeen)} y se repitió ${num(row.occurrences) ?? 1} ${num(row.occurrences) === 1 ? "vez" : "veces"}.`,
    cards: [
      {
        heading: "Detalle",
        rows: [
          ...detailRows(row.details),
          { label: "Resuelta", value: formatLima(str(row.resolved_at)) },
          { label: "Llave", value: str(row.dedupe_key) ?? "—" },
        ],
      },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/*  La base no responde → mail directo con freno                               */
/* -------------------------------------------------------------------------- */

const DIRECT_MAIL_EVERY_MS = 10 * 60_000;
const lastDirectMail = new Map<string, number>();

function directMail(
  kind: AdminAlertKind,
  severity: AlertSeverity,
  details: Record<string, unknown>,
  userId: string | null,
  reason: string,
): void {
  // B es "solo panel": sin base no hay panel, y no amerita mail.
  if (severity === "B") return;
  const now = Date.now();
  const last = lastDirectMail.get(kind) ?? 0;
  if (now - last < DIRECT_MAIL_EVERY_MS) return;
  lastDirectMail.set(kind, now);

  const label = adminAlertLabel(kind);
  runAfter(async () => {
    const email = await lookupUserEmail(userId);
    await sendAdminMail({
      subject: `[Vendí · ${SEVERITY_LABELS[severity]}] ${label} (la base no respondió)`,
      badge: SEVERITY_LABELS[severity],
      tone: "urgent",
      eyebrow: "La base no respondió",
      title: label,
      lead: "No pude guardar esta alerta en la base, así que te la mando directo: el panel no la va a mostrar. Si se repite, te llega como mucho un mail de este tipo cada 10 minutos.",
      cards: [
        {
          heading: "Detalle",
          rows: [
            ...clientRow(userId, email),
            ...detailRows(details),
            { label: "Error de la base", value: formatValue(reason, 300) },
          ],
        },
      ],
    });
  });
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Detalles acotados antes de guardarlos: sin undefined, strings ≤ 1000 y
 * objetos aplanados a JSON ≤ 1000 (un raw_event entero no entra al panel).
 */
function sanitizeDetails(details: unknown): Record<string, unknown> {
  if (!details || typeof details !== "object" || Array.isArray(details)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details as Record<string, unknown>).slice(0, 40)) {
    if (value === undefined) continue;
    if (typeof value === "string") out[key] = value.slice(0, 1000);
    else if (value === null || typeof value === "number" || typeof value === "boolean") out[key] = value;
    else out[key] = formatValue(value, 1000);
  }
  return out;
}

/** Email del cliente en Clerk (para el mail a Paolo). Best-effort, con timeout. */
async function lookupUserEmail(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const client = await clerkClient();
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), 3000);
    });
    const user = await Promise.race([client.users.getUser(userId), timeout]);
    return user?.primaryEmailAddress?.emailAddress ?? null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
