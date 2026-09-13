/**
 * Cliente Gemini compartido — modelo de CRÉDITOS (server-side).
 *
 * Llama a la REST API oficial de Google Generative Language sin SDK. La key es
 * la PROPIA de Vendí (`process.env.GOOGLE_API_KEY`), se pasa como query param a
 * cada request (`?key=...`) y NUNCA llega al browser: los callers
 * (`generate-server.ts`, `image-analyzer.ts`) corren server-side.
 *
 * Endpoint base:
 *   https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}
 *
 * Por qué REST y no un SDK:
 *   - Control total sobre body y headers — necesario para
 *     `responseMimeType: "application/json"` en el analyzer y para mandar
 *     `inlineData` base64 sin sorpresas de serialización.
 *   - Cero acoplamiento a una versión del SDK: si Google cambia algo,
 *     pinchamos UNA función.
 *
 * Los errores se devuelven tipados (no se lanzan) para que el caller pueda
 * desestructurar `result.ok` vs `result.error` sin try/catch.
 */

/* -------------------------------------------------------------------------- */
/*  Constantes de modelo                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Modelo de RAZONAMIENTO. Lo usa El Director (`generate-server.ts`) para
 * sintetizar el prompt enriquecido en JSON — tarea que requiere análisis
 * profundo y síntesis multimodal con responseMimeType JSON. (El analyzer/
 * Oráculo usa su propio `gemini-2.5-flash`.)
 *
 * Si Google libera un sucesor (3.5 Pro, etc.), cambia este string y listo.
 * Doc: https://ai.google.dev/gemini-api/docs/models/gemini
 */
export const GEMINI_REASONING_MODEL = "gemini-3.1-pro-preview";

/**
 * Modelo de IMAGEN — Nano Banana 2. Genera imagenes a partir de prompts +
 * referencias multimodales. Devuelve UNA imagen por llamada como `inlineData`
 * base64 dentro del primer candidato.
 *
 * Si el string exacto de Nano Banana 2 en tu cuenta de AI Studio difiere,
 * cambialo aca. Doc: https://ai.google.dev/gemini-api/docs/image-generation
 */
export const GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image-preview";

const GEMINI_API_ROOT = "https://generativelanguage.googleapis.com";

/**
 * Versión de la REST API. Default `v1beta` (lo que usa todo v1). La v2 del
 * pipeline puede pedir `v1` como plan B si Google deja de aceptar `imageConfig`
 * en v1beta: los ejemplos nuevos de la guía de imagen usan `/v1/` con
 * `responseFormat.image`.
 */
export type GeminiApiVersion = "v1beta" | "v1";

/* -------------------------------------------------------------------------- */
/*  Tipos públicos                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Una parte de un mensaje multimodal. Replicamos el shape oficial al pie de la
 * letra para poder pegar JSON directo al endpoint sin transformaciones.
 *
 *   { text }                          → un bloque de texto
 *   { inlineData: { mimeType, data }} → un bloque binario (imagen/audio) base64
 *
 * La doc completa: https://ai.google.dev/api/generate-content#Part
 */
export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

/**
 * Un "content" es una secuencia de parts con un role. Para `generateContent`
 * (one-shot) usamos role `"user"` siempre. Si en el futuro hacemos multi-turn
 * (chat) este tipo ya cubre el role `"model"`.
 */
export type GeminiContent = {
  role?: "user" | "model";
  parts: GeminiPart[];
};

/** Body del request a `generateContent`. */
export type GeminiRequest = {
  contents: GeminiContent[];
  generationConfig?: Record<string, unknown>;
  safetySettings?: Array<Record<string, unknown>>;
  systemInstruction?: GeminiContent;
};

/** Shape mínimo del response que nos interesa para parsear. */
export type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: GeminiPart[]; role?: string };
    finishReason?: string;
    safetyRatings?: Array<{ category: string; probability: string }>;
  }>;
  promptFeedback?: { blockReason?: string; safetyRatings?: unknown[] };
};

/**
 * Union de errores tipados que devolvemos al caller. Las rutas los traducen a
 * copy en castellano (`message` de la respuesta; ver `formatBillingError` en
 * lib/generations/format.ts para `billing`).
 *
 * `billing` ≠ `rate_limit`: la cuenta de Google de Vendí se quedó SIN SALDO
 * (prepago agotado, billing deshabilitado). No se arregla solo esperando, así
 * que no se reintenta y al usuario no se le dice "probá más tarde".
 */
export type GeminiError =
  | { kind: "missing_key" }
  | { kind: "invalid_key" }
  | { kind: "rate_limit"; retryAfterSec?: number }
  | { kind: "billing"; message?: string }
  | { kind: "content_blocked"; reason?: string }
  | { kind: "network" }
  | { kind: "unknown"; message: string };

export type GeminiCallResult =
  | { ok: true; response: GeminiResponse }
  | { ok: false; error: GeminiError };

/* -------------------------------------------------------------------------- */
/*  callGemini                                                                  */
/* -------------------------------------------------------------------------- */

export type CallGeminiOptions = {
  apiKey: string;
  /** Nombre del modelo. Usá `GEMINI_REASONING_MODEL` o `GEMINI_IMAGE_MODEL`. */
  model: string;
  contents: GeminiContent[];
  generationConfig?: Record<string, unknown>;
  safetySettings?: Array<Record<string, unknown>>;
  systemInstruction?: GeminiContent;
  /**
   * Timeout en ms — corta requests colgados. Default 60s porque la generación
   * de imagen puede tardar 10-30s y queremos margen.
   */
  timeoutMs?: number;
  /** Versión de la REST API. Default `v1beta`: omitirlo deja todo como estaba. */
  apiVersion?: GeminiApiVersion;
};

/**
 * Llama a `models/{model}:generateContent` y devuelve el response tipado o un
 * error tipado. No lanza nunca: la UI desestructura `result.ok`.
 */
export async function callGemini(
  opts: CallGeminiOptions,
): Promise<GeminiCallResult> {
  if (!opts.apiKey || opts.apiKey.trim().length === 0) {
    return { ok: false, error: { kind: "missing_key" } };
  }

  const url = `${GEMINI_API_ROOT}/${opts.apiVersion ?? "v1beta"}/models/${encodeURIComponent(
    opts.model,
  )}:generateContent?key=${encodeURIComponent(opts.apiKey)}`;

  const body: GeminiRequest = {
    contents: opts.contents,
    ...(opts.generationConfig
      ? { generationConfig: opts.generationConfig }
      : {}),
    ...(opts.safetySettings ? { safetySettings: opts.safetySettings } : {}),
    ...(opts.systemInstruction
      ? { systemInstruction: opts.systemInstruction }
      : {}),
  };

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? 60_000,
  );

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    // AbortError o cualquier error de fetch → tratamos como red. El TypeError
    // de "Failed to fetch" también cae acá.
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, error: { kind: "network" } };
    }
    return { ok: false, error: { kind: "network" } };
  }
  clearTimeout(timer);

  // Mapeo de status → GeminiError. El body de error de Gemini siempre viene
  // como JSON con `{ error: { code, message, status, details? } }`.
  if (!res.ok) {
    const errorPayload = await safeReadErrorPayload(res);
    const error = mapHttpStatusToError(res.status, errorPayload);
    if (error.kind === "billing") noteBillingExhausted(res.status, opts.model, error.message);
    return { ok: false, error };
  }
  // Una respuesta OK prueba que hay saldo: si alguien recargó, el corte se
  // levanta ya y no espera a que venza.
  billingExhaustedUntil = 0;

  let parsed: GeminiResponse;
  try {
    parsed = (await res.json()) as GeminiResponse;
  } catch {
    return {
      ok: false,
      error: { kind: "unknown", message: "Respuesta de Gemini no parseable." },
    };
  }

  // Aún con HTTP 200, Gemini puede haber bloqueado el prompt completo. Lo
  // chequeamos acá para que los callers no tengan que duplicar el guard.
  const promptBlock = parsed.promptFeedback?.blockReason;
  if (promptBlock) {
    return {
      ok: false,
      error: { kind: "content_blocked", reason: promptBlock },
    };
  }

  return { ok: true, response: parsed };
}

/* -------------------------------------------------------------------------- */
/*  Helpers internos                                                            */
/* -------------------------------------------------------------------------- */

type GeminiErrorPayload = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: unknown[];
  };
};

async function safeReadErrorPayload(res: Response): Promise<GeminiErrorPayload> {
  try {
    return (await res.json()) as GeminiErrorPayload;
  } catch {
    return {};
  }
}

function mapHttpStatusToError(
  status: number,
  payload: GeminiErrorPayload,
): GeminiError {
  const message = payload.error?.message ?? `HTTP ${status}`;

  if (status === 400) {
    // 400 puede ser muchas cosas; las más comunes para el usuario:
    //  - API_KEY_INVALID (a veces Google devuelve 400 en vez de 401)
    //  - prompt blocked (SAFETY) — Gemini suele devolver 200 con bloqueo, pero
    //    ocasionalmente devuelve 400 con detalle de safety.
    if (
      payload.error?.status === "INVALID_ARGUMENT" &&
      /api[_ ]?key/i.test(message)
    ) {
      return { kind: "invalid_key" };
    }
    if (/safety|blocked|prohibited/i.test(message)) {
      return { kind: "content_blocked", reason: message };
    }
    return { kind: "unknown", message: `HTTP 400: ${message}` };
  }

  // Saldo agotado / billing apagado: Google lo manda como 429 RESOURCE_EXHAUSTED
  // ("Your prepayment credits are depleted", verificado en vivo 2026-09-10) o
  // como 403 (BILLING_DISABLED). Va ANTES que invalid_key y rate_limit.
  if ((status === 429 || status === 403) && isBillingExhaustion(payload)) {
    return { kind: "billing", message: message.slice(0, 300) };
  }

  if (status === 401 || status === 403) {
    return { kind: "invalid_key" };
  }

  if (status === 429) {
    return {
      kind: "rate_limit",
      retryAfterSec: extractRetryAfterSec(payload),
    };
  }

  if (status >= 500) {
    return { kind: "network" };
  }

  return { kind: "unknown", message: `HTTP ${status}: ${message}` };
}

/* -------------------------------------------------------------------------- */
/*  Saldo agotado (billing)                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Frases de Google que significan "la cuenta no tiene saldo / billing apagado".
 * Ojo con el falso positivo: el rate limit NORMAL de cuota dice "You exceeded
 * your current quota, please check your plan and billing details" — nombra
 * "billing" pero es un límite por minuto/día que se arregla solo. Por eso no se
 * busca la palabra suelta, sino frases que solo aparecen cuando falta plata.
 */
const BILLING_PATTERNS: RegExp[] = [
  /\bprepay(?:ment|ed)\b/i,
  /\bcredits?\s+(?:are\s+|is\s+|have\s+been\s+|has\s+been\s+)?(?:depleted|exhausted|used\s+up|insufficient)\b/i,
  /\binsufficient\s+(?:funds|balance|credits?)\b/i,
  /\brequires?\s+billing\b/i,
  /\bbilling\s+(?:account\s+)?(?:is\s+|has\s+been\s+)?(?:disabled|suspended|closed|inactive|not\s+(?:enabled|active|set\s*up))\b/i,
  /\b(?:enable|set\s*up|link)\s+(?:a\s+)?billing\b/i,
  /\bBILLING_DISABLED\b/,
];

function isBillingExhaustion(payload: GeminiErrorPayload): boolean {
  const reasons = (Array.isArray(payload.error?.details) ? payload.error.details : [])
    .map((d) => (d && typeof d === "object" ? (d as Record<string, unknown>)["reason"] : null))
    .filter((r): r is string => typeof r === "string");
  const haystack = [payload.error?.message ?? "", ...reasons].join(" ");
  return BILLING_PATTERNS.some((re) => re.test(haystack));
}

/**
 * Corte por instancia: después de un `billing`, durante 2 minutos las rutas
 * pueden cortar ANTES de descontar créditos o reservar cupo de notas
 * (`isGeminiBillingExhausted`). Se levanta solo al vencer o con la primera
 * respuesta OK de Gemini (alguien recargó). Es un atajo, no la fuente de verdad:
 * sin corte, la llamada real igual devuelve `billing`.
 */
export const BILLING_BREAKER_MS = 120_000;
let billingExhaustedUntil = 0;

function noteBillingExhausted(status: number, model: string, message: string | undefined): void {
  const now = Date.now();
  const wasOpen = billingExhaustedUntil > now;
  billingExhaustedUntil = now + BILLING_BREAKER_MS;
  // Una línea por apertura del corte (no una por imagen de la tanda): es la que
  // hay que buscar en los logs de Vercel. Sin la key: solo status, modelo y el
  // texto de Google.
  if (!wasOpen) {
    console.error(
      "[gemini] billing_exhausted",
      JSON.stringify({ status, model, message: (message ?? "").slice(0, 300) }),
    );
  }
}

/** ¿Esta instancia vio hace menos de 2 min que la cuenta de Google no tiene saldo? */
export function isGeminiBillingExhausted(now: number = Date.now()): boolean {
  return billingExhaustedUntil > now;
}

/** Solo pruebas offline: vuelve el corte a cerrado. */
export function resetGeminiBillingState(): void {
  billingExhaustedUntil = 0;
}

/**
 * Algunas respuestas 429 incluyen `retryDelay` adentro de `error.details`.
 * Lo extraemos best-effort. Si no está, undefined y la UI usa copy genérica.
 */
function extractRetryAfterSec(payload: GeminiErrorPayload): number | undefined {
  const details = payload.error?.details;
  if (!Array.isArray(details)) return undefined;
  for (const d of details) {
    if (!d || typeof d !== "object") continue;
    const raw = (d as Record<string, unknown>)["retryDelay"];
    if (typeof raw === "string") {
      const match = /^(\d+)s/.exec(raw);
      if (match) return Number.parseInt(match[1], 10);
    }
    if (raw && typeof raw === "object") {
      const seconds = (raw as Record<string, unknown>)["seconds"];
      if (typeof seconds === "string") {
        const n = Number.parseInt(seconds, 10);
        if (!Number.isNaN(n)) return n;
      }
      if (typeof seconds === "number") return seconds;
    }
  }
  return undefined;
}
