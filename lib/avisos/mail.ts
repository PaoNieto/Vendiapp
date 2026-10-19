import "server-only";
import { getAppUrl, getMailFrom, getTransporter } from "@/lib/email/transport";
import { errorText } from "./db";

/**
 * Mails a PAOLO (alertas urgentes, "resuelta", recordatorio y resumen diario).
 *
 * Diseño = el de `lib/email/credits-granted.ts` ("Nube baja": barra de marca →
 * hero con la nube → tarjetas aparte → botón pill → pie con filete), con la
 * misma REGLA DE OUTLOOK: todo bloque con degradado lleva PRIMERO su sólido
 * (`bgcolor` + `background-color`).
 *
 * 🔒 Todo lo que entra al HTML pasa por `escapeHtml` (JonSnow #8): los detalles
 * de una alerta pueden traer texto que escribió un atacante (nombre de
 * producto, nombre del comprador en Whop, utm). El único href es el del panel,
 * armado acá con la URL de la app, nunca leído de una alerta.
 *
 * NUNCA tira: devuelve sent | skipped | failed.
 */

export type MailResult = "sent" | "skipped" | "failed";

export type MailRow = { label: string; value: string };
export type MailItem = { title: string; meta?: string; body?: string };
export type MailCard = {
  heading?: string;
  rows?: MailRow[];
  items?: MailItem[];
  /** Texto si la tarjeta no tiene filas ni items. */
  empty?: string;
};

export type AdminMail = {
  subject: string;
  /** Pastilla de la barra de marca (ej. "Urgente"). */
  badge: string;
  /** Color de la pastilla. */
  tone: "urgent" | "ok" | "info";
  eyebrow: string;
  title: string;
  lead: string;
  cards: MailCard[];
  /** Botón al panel. Default: "Abrir el panel". */
  ctaLabel?: string;
};

/* -------------------------------------------------------------------------- */
/*  Envío                                                                      */
/* -------------------------------------------------------------------------- */

/** Destinatarios de ADMIN_ALERT_EMAIL (acepta varios separados por coma). */
export function adminAlertRecipients(): string[] {
  return (process.env.ADMIN_ALERT_EMAIL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
}

let warnedNoConfig = false;

export async function sendAdminMail(mail: AdminMail): Promise<MailResult> {
  const to = adminAlertRecipients();
  const transporter = getTransporter();
  const from = getMailFrom();
  if (to.length === 0 || !transporter || !from) {
    if (!warnedNoConfig) {
      warnedNoConfig = true;
      console.warn(
        "[avisos] Mail a Paolo apagado: falta ADMIN_ALERT_EMAIL o SMTP_USER/SMTP_PASSWORD/MAIL_FROM.",
      );
    }
    return "skipped";
  }
  try {
    await transporter.sendMail({
      from,
      to: to.join(", "),
      subject: mail.subject,
      text: buildText(mail),
      html: buildHtml(mail),
    });
    return "sent";
  } catch (err) {
    console.error("[avisos] Falló el mail a Paolo:", errorText(err));
    return "failed";
  }
}

/** URL del panel. Fija: nunca sale de los datos de una alerta. */
export function adminPanelUrl(): string {
  return `${getAppUrl()}/admin/avisos`;
}

/* -------------------------------------------------------------------------- */
/*  Formato                                                                    */
/* -------------------------------------------------------------------------- */

/** Escapa texto para meterlo en HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Valor de un detalle como texto corto (objetos → JSON), máx. `max` caracteres. */
export function formatValue(value: unknown, max = 500): string {
  let out: string;
  if (value === null || value === undefined) out = "—";
  else if (typeof value === "string") out = value;
  else if (typeof value === "number" || typeof value === "boolean") out = String(value);
  else {
    try {
      out = JSON.stringify(value);
    } catch {
      out = String(value);
    }
  }
  return out.length > max ? `${out.slice(0, max)}…` : out;
}

/** Fecha/hora de Lima, legible ("16/10/2026 08:00"). */
export function formatLima(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** "hace 3 h" / "hace 12 min" / "hace 2 d". */
export function formatAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const min = Math.max(0, Math.round((now - t) / 60_000));
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

/* -------------------------------------------------------------------------- */
/*  Texto plano                                                                */
/* -------------------------------------------------------------------------- */

function buildText(mail: AdminMail): string {
  const lines: string[] = [`VENDÍ — ${mail.badge}`, "", mail.eyebrow.toUpperCase(), "", mail.title, "", mail.lead];
  for (const card of mail.cards) {
    lines.push("");
    if (card.heading) lines.push(`--- ${card.heading.toUpperCase()} ---`);
    const rows = card.rows ?? [];
    const items = card.items ?? [];
    for (const row of rows) lines.push(`${row.label}: ${row.value}`);
    for (const item of items) {
      lines.push(`• ${item.title}${item.meta ? ` (${item.meta})` : ""}`);
      if (item.body) lines.push(`  ${item.body}`);
    }
    if (rows.length === 0 && items.length === 0 && card.empty) lines.push(card.empty);
  }
  lines.push("", `${mail.ctaLabel ?? "Abrir el panel"}: ${adminPanelUrl()}`);
  return lines.join("\n");
}

/* -------------------------------------------------------------------------- */
/*  HTML "Nube baja"                                                           */
/* -------------------------------------------------------------------------- */

const BG = "#070707";
const CARD = "#16241a";
const CREAM = "#f0f4e7";
const GOLD = "#c9a640";
const GOLD_HI = "#e0c161";
const GOLD_DEEP = "#a8842c";
const GOLD_FG = "#0c1610";
const SAGE_STRONG = "#aecb9f";
const CLAY = "#e08a6d";
/** rgba(22,36,26,.70) pre-compuesto sobre #070707 (base sólida de las tarjetas). */
const STEP_BG = "#121b14";

const SERIF = "'Fraunces',Georgia,'Times New Roman',serif";
const SANS = "'Hanken Grotesk',Arial,Helvetica,sans-serif";

function toneColor(tone: AdminMail["tone"]): string {
  if (tone === "urgent") return CLAY;
  if (tone === "ok") return SAGE_STRONG;
  return GOLD;
}

function cardHtml(card: MailCard): string {
  const rows = card.rows ?? [];
  const items = card.items ?? [];

  const heading = card.heading
    ? `<p style="margin: 0 0 12px 0; font-family: ${SANS}; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(240,244,231,.40);">${escapeHtml(card.heading)}</p>`
    : "";

  const rowsHtml = rows
    .map(
      (row) => `
                    <tr>
                      <td valign="top" width="38%" style="padding: 6px 12px 6px 0; font-family: ${SANS}; font-size: 13px; line-height: 1.5; color: rgba(240,244,231,.52);">${escapeHtml(row.label)}</td>
                      <td valign="top" style="padding: 6px 0; font-family: ${SANS}; font-size: 13.5px; line-height: 1.5; color: ${CREAM}; word-break: break-word;">${escapeHtml(row.value)}</td>
                    </tr>`,
    )
    .join("");

  const itemsHtml = items
    .map(
      (item) => `
                    <tr>
                      <td colspan="2" style="padding: 9px 0; border-top: 1px solid rgba(240,244,231,.08); font-family: ${SANS};">
                        <span style="display: block; color: ${CREAM}; font-weight: 600; font-size: 14px; line-height: 1.45;">${escapeHtml(item.title)}</span>
                        ${item.meta ? `<span style="display: block; color: rgba(240,244,231,.52); font-size: 12.5px; line-height: 1.5;">${escapeHtml(item.meta)}</span>` : ""}
                        ${item.body ? `<span style="display: block; color: rgba(240,244,231,.72); font-size: 13px; line-height: 1.5; padding-top: 2px; word-break: break-word;">${escapeHtml(item.body)}</span>` : ""}
                      </td>
                    </tr>`,
    )
    .join("");

  const emptyHtml =
    rows.length === 0 && items.length === 0 && card.empty
      ? `
                    <tr>
                      <td colspan="2" style="padding: 4px 0; font-family: ${SANS}; font-size: 13.5px; line-height: 1.6; color: rgba(240,244,231,.72);">${escapeHtml(card.empty)}</td>
                    </tr>`
      : "";

  return `
          <tr>
            <td style="padding: 0 0 14px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${STEP_BG}" style="width: 100%; background-color: rgba(22,36,26,.7); border: 1px solid rgba(240,244,231,.12); border-radius: 20px;">
                <tr>
                  <td style="padding: 18px 20px;">
                    ${heading}
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rowsHtml}${itemsHtml}${emptyHtml}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`;
}

function buildHtml(mail: AdminMail): string {
  const badgeColor = toneColor(mail.tone);
  const panelUrl = escapeHtml(adminPanelUrl());
  const cta = escapeHtml(mail.ctaLabel ?? "Abrir el panel");
  const cards = mail.cards.map(cardHtml).join("");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>${escapeHtml(mail.subject)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=Hanken+Grotesk:wght@400;500;600;700&display=swap">
</head>
<body bgcolor="${BG}" style="margin: 0; padding: 0; background-color: ${BG};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BG}" style="background-color: ${BG};">
    <tr>
      <td align="center" style="padding: 36px 14px 60px 14px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 600px;">

          <!-- ── BARRA DE MARCA ── -->
          <tr>
            <td style="padding: 0 6px 20px 6px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" style="font-family: ${SERIF}; font-size: 23px; font-weight: normal; letter-spacing: -0.02em; color: ${CREAM};">
                    Vend<span style="font-style: italic; color: ${GOLD};">í</span>
                  </td>
                  <td align="right" style="font-family: ${SANS}; font-size: 12px; font-weight: 600; color: ${badgeColor};">
                    <span style="color: ${badgeColor};">&#9679;</span>&nbsp;${escapeHtml(mail.badge)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── HERO · "nube baja" (sólido primero para Outlook) ── -->
          <tr>
            <td style="padding: 0 0 14px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${CARD}" style="width: 100%; background-color: ${CARD}; background-image: radial-gradient(ellipse 65% 90% at 92% 4%, rgba(201,166,64,.30) 0%, rgba(22,36,26,0) 60%), radial-gradient(ellipse 100% 90% at 20% 100%, rgba(143,168,132,.26) 0%, rgba(22,36,26,0) 62%); border: 1px solid rgba(201,166,64,.24); border-radius: 28px;">
                <tr>
                  <td style="padding: 28px 26px;">
                    <p style="margin: 0 0 12px 0; font-family: ${SANS}; font-size: 12px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(240,244,231,.40);">
                      ${escapeHtml(mail.eyebrow)}
                    </p>
                    <h1 style="margin: 0; font-family: ${SERIF}; font-weight: normal; font-size: 28px; line-height: 1.18; letter-spacing: -0.02em; color: ${CREAM};">
                      ${escapeHtml(mail.title)}
                    </h1>
                    <p style="margin: 12px 0 0 0; font-family: ${SANS}; font-size: 15px; line-height: 1.6; color: rgba(240,244,231,.72);">
                      ${escapeHtml(mail.lead)}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
${cards}
          <!-- ── BOTÓN AL PANEL (sólido primero: si no, en Outlook queda invisible) ── -->
          <tr>
            <td style="padding: 6px 0 0 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" bgcolor="${GOLD}" style="background-color: ${GOLD}; background-image: linear-gradient(135deg, ${GOLD_HI}, ${GOLD_DEEP}); border-radius: 999px;">
                    <a href="${panelUrl}" style="display: inline-block; padding: 14px 28px; font-family: ${SANS}; font-size: 15px; font-weight: bold; letter-spacing: -0.01em; color: ${GOLD_FG}; text-decoration: none;">
                      ${cta}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── PIE CON FILETE ── -->
          <tr>
            <td style="padding: 30px 8px 0 8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-top: 1px solid rgba(240,244,231,.12); padding: 20px 0 0 0; font-family: ${SANS}; font-size: 12px; line-height: 1.7; color: rgba(240,244,231,.34);">
                    Alerta interna de <span style="font-family: ${SERIF}; color: rgba(240,244,231,.72); font-weight: 600;">Vend<span style="font-style: italic; color: ${GOLD};">í</span></span>. Solo para el equipo: el cliente nunca ve estos detalles.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
