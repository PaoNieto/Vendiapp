import "server-only";

/**
 * Cliente HTTP mínimo contra la API de Whop — el riel de cobro de Vendí.
 *
 * SOLO server-side ("server-only" hace fallar el build si se importa desde el
 * browser: la API key de Whop da acceso total a la cuenta y NUNCA debe salir
 * del server).
 *
 * A mano por REST, sin SDK, por la misma razón que Gemini: menos superficie,
 * cero dependencia nueva, y control total del timeout (el webhook y el checkout
 * corren dentro de requests con presupuesto de segundos).
 *
 * Vendí es single-seller: cobra con SU PROPIA cuenta (`WHOP_ACCOUNT_ID`,
 * biz_...) usando SU PROPIA API key de cuenta. No hay OAuth ni multi-tenant.
 */

/** Base de la API de Whop. Documentada en docs.whop.com/api-reference. */
export const WHOP_API_BASE = "https://api.whop.com/api/v1";

/**
 * Versión de la API que pedimos, pineada a propósito.
 *
 * ⚠️ NO ES OPCIONAL. Whop versiona por fecha: si NO mandás `Api-Version-Date`,
 * la request se sirve con las formas originales `2025-01-01`, donde
 * `POST /checkout_configurations` EXIGE un objeto `plan` inline y NO acepta
 * `plan_id`. O sea: sin este header, cada compra crearía un PLAN NUEVO en la
 * cuenta de Whop en vez de cobrar el plan que ya existe.
 *
 * Esta fecha es la última versión publicada al 2026-09-04 y es exactamente la
 * que documenta `account_id` + `plan_id` de nivel superior y `purchase_url` en
 * la respuesta. Subirla es una decisión deliberada: leer el changelog de
 * /developer/api/versioning antes de tocarla.
 */
export const WHOP_API_VERSION_DATE = "2026-09-02-2";

/** Timeout por request. El checkout corre dentro de un POST del usuario. */
const DEFAULT_TIMEOUT_MS = 8000;

/** Error tipado de una llamada HTTP a Whop (status + cuerpo, para loguear). */
export class WhopApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string, message?: string) {
    super(message ?? `Whop respondió ${status}`);
    this.name = "WhopApiError";
    this.status = status;
    this.body = body;
  }
}

/**
 * API key de cuenta de Whop (secreta, server-side).
 * Se crea en whop.com/dashboard/developer > Account API Keys.
 */
export function getWhopApiKey(): string {
  const key = process.env.WHOP_API_KEY;
  if (!key) {
    throw new Error("Falta WHOP_API_KEY en el entorno.");
  }
  return key;
}

/**
 * Id de la cuenta de Whop de Vendí (`biz_...`). Es la cuenta que recibe la
 * plata; va como `account_id` en la checkout configuration.
 */
export function getWhopAccountId(): string {
  const accountId = process.env.WHOP_ACCOUNT_ID;
  if (!accountId) {
    throw new Error("Falta WHOP_ACCOUNT_ID en el entorno.");
  }
  return accountId;
}

/**
 * POST/GET tipado contra la API de Whop, con timeout duro y errores tipados.
 *
 * - `path` es relativo a WHOP_API_BASE y empieza con "/".
 * - `idempotencyKey` (opcional) hace la request segura de reintentar: Whop
 *   devuelve la respuesta original en vez de crear un recurso nuevo.
 * - Cualquier status >= 400 tira `WhopApiError` con el cuerpo crudo, para que
 *   el caller lo loguee sin adivinar.
 *
 * El timeout se implementa con AbortController + setTimeout (no
 * `AbortSignal.timeout`) para no depender de la versión del runtime.
 */
export async function whopFetch<T>(
  path: string,
  init: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    body?: unknown;
    idempotencyKey?: string;
    timeoutMs?: number;
  } = {},
): Promise<T> {
  const {
    method = "GET",
    body,
    idempotencyKey,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = init;

  // Los headers se arman ANTES de crear el timer: getWhopApiKey() puede tirar
  // (env faltante) y no queremos dejar un setTimeout colgado por 8s.
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getWhopApiKey()}`,
    "Api-Version-Date": WHOP_API_VERSION_DATE,
    Accept: "application/json",
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${WHOP_API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      // Nunca cachear una llamada de cobro.
      cache: "no-store",
    });

    const text = await res.text();
    if (!res.ok) {
      throw new WhopApiError(res.status, text);
    }
    return (text ? JSON.parse(text) : null) as T;
  } finally {
    clearTimeout(timer);
  }
}
