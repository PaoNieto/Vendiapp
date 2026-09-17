import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

/**
 * Transporte SMTP de Vendí — Gmail de Google Workspace (soporte@vendilatam.com).
 *
 * SOLO server-side ("server-only" rompe el build si alguien lo importa desde el
 * browser: la contraseña de aplicación da acceso a mandar correo como Vendí).
 *
 * ⚠️ REGLA DURA: un mail que no sale JAMÁS puede romper una acreditación de
 * créditos. Por eso NADA acá tira excepción hacia afuera: si faltan las env
 * vars, `getTransporter()` devuelve `null` y el que llama no manda nada.
 *
 * Env vars (las 3 tienen que estar, o no se manda nada):
 *  - SMTP_USER      → la cuenta real del dominio (soporte@vendilatam.com).
 *  - SMTP_PASSWORD  → CONTRASEÑA DE APLICACIÓN de Google (16 letras), NO la
 *                     contraseña de la cuenta.
 *  - MAIL_FROM      → remitente visible, ej. `Vendí <soporte@vendilatam.com>`.
 *
 * Gmail SMTP: smtp.gmail.com:465 con SSL directo (`secure: true`). Se elige 465
 * sobre 587/STARTTLS porque la conexión nace cifrada, sin el salto de upgrade.
 *
 * ⏱️ Los timeouts son CORTOS a propósito: este transporte se usa dentro de
 * `after()` del webhook de Whop, que corre adentro del presupuesto de la
 * función serverless. Un socket colgado se comería la invocación entera.
 */

/** Config de correo leída del entorno. `null` = correo apagado. */
type MailConfig = {
  user: string;
  password: string;
  from: string;
};

/** Host SMTP de Google Workspace. */
const SMTP_HOST = "smtp.gmail.com";
/** 465 = SSL directo (secure: true). El 587 sería STARTTLS. */
const SMTP_PORT = 465;

/** Timeouts duros (ms). Mejor no mandar que colgar la invocación. */
const CONNECTION_TIMEOUT_MS = 5000;
const GREETING_TIMEOUT_MS = 5000;
const SOCKET_TIMEOUT_MS = 8000;

/**
 * Lee la config del entorno. Devuelve `null` (sin tirar) si falta cualquiera de
 * las 3 variables: sin config no hay correo, y eso NO es un error fatal.
 */
export function readMailConfig(): MailConfig | null {
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD?.trim();
  const from = process.env.MAIL_FROM?.trim() || user;

  if (!user || !password || !from) return null;
  return { user, password, from };
}

/**
 * Transporter cacheado a nivel módulo: en serverless el módulo sobrevive entre
 * invocaciones tibias, así que reusamos la conexión en vez de renegociar TLS en
 * cada mail.
 */
let cached: Transporter | null = null;

/**
 * Devuelve el transporter listo para usar, o `null` si el correo no está
 * configurado. NUNCA tira.
 */
export function getTransporter(): Transporter | null {
  if (cached) return cached;

  const config = readMailConfig();
  if (!config) return null;

  try {
    cached = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: true,
      auth: { user: config.user, pass: config.password },
      connectionTimeout: CONNECTION_TIMEOUT_MS,
      greetingTimeout: GREETING_TIMEOUT_MS,
      socketTimeout: SOCKET_TIMEOUT_MS,
    });
    return cached;
  } catch (err) {
    console.error("[email] No se pudo crear el transporte SMTP:", err);
    return null;
  }
}

/** Remitente visible (`MAIL_FROM`, o `SMTP_USER` como fallback). */
export function getMailFrom(): string | null {
  return readMailConfig()?.from ?? null;
}

/** URL base de la app para los links de los mails. */
export function getAppUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL?.trim();
  // Fallback al dominio de producción: un link roto en un mail es peor que un
  // link a la home correcta.
  return (url || "https://vendilatam.com").replace(/\/+$/, "");
}
