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
 * Union de errores tipados que devolvemos al caller. NUNCA van tal cual al
 * cliente: las rutas responden con los textos de lib/avisos/textos.ts y el
 * detalle crudo queda para Paolo (admin_alerts).
 *
 * `billing` ≠ `rate_limit`: la cuenta de Google de Vendí se quedó SIN SALDO
 * (prepago agotado, billing deshabilitado). No se arregla solo esperando: es
 * caída de la IA (`aiOutageCause`), igual que key mala y modelo inexistente.
 */
export type GeminiError =
  | { kind: "missing_key" }
  | { kind: "invalid_key" }
  | { kind: "rate_limit"; retryAfterSec?: number }
  | { kind: "billing"; message?: string }
  /** 404: el modelo no existe o lo retiraron. Es caída de la IA (no se arregla solo). */
  | { kind: "model_not_found"; model?: string; message?: string }
  /**
   * Bloqueo de contenido. `stage`:
   *  - "input"  → Google bloqueó la ENTRADA (`promptFeedback.blockReason`): la
   *    foto o el pedido del cliente. NO se devuelve el crédito, solo aviso.
   *  - "output" → bloqueó la SALIDA (finishReason IMAGE_SAFETY, etc.): la culpa
   *    no es clara, se devuelve.
   *  - sin stage → error HTTP con texto de safety: Google no cobra, se devuelve.
   */
  | { kind: "content_blocked"; reason?: string; stage?: "input" | "output" }
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
  /**
   * `false`: un 404 (modelo inexistente) NO marca la IA como caída. Para el que
   * tiene un modelo de respaldo y lo va a probar (v2: GA → preview); ese caller
   * reporta él mismo si el respaldo también da 404 (`reportAiOutage`). Sin saldo
   * y key mala marcan siempre. Default true.
   */
  reportModelNotFound?: boolean;
};

/**
 * Llama a `models/{model}:generateContent` y devuelve el response tipado o un
 * error tipado. No lanza nunca: la UI desestructura `result.ok`.
 */
export async function callGemini(
  opts: CallGeminiOptions,
): Promise<GeminiCallResult> {
  if (!opts.apiKey || opts.apiKey.trim().length === 0) {
    const error: GeminiError = { kind: "missing_key" };
    await reportAiOutage(error, { model: opts.model });
    return { ok: false, error };
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
    const error = mapHttpStatusToError(res.status, errorPayload, opts.model);
    if (error.kind !== "model_not_found" || opts.reportModelNotFound !== false) {
      await reportAiOutage(error, { model: opts.model, status: res.status });
    }
    return { ok: false, error };
  }
  // Una respuesta OK prueba saldo, key y modelo: el corte local se levanta ya y
  // la fila de service_status vuelve a ok si estaba caída.
  noteAiOk(opts.model);

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
  // Es un bloqueo de la ENTRADA (la foto o el pedido del cliente).
  const promptBlock = parsed.promptFeedback?.blockReason;
  if (promptBlock) {
    return {
      ok: false,
      error: { kind: "content_blocked", reason: promptBlock, stage: "input" },
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
  model?: string,
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

  // Saldo agotado / billing apagado. Hoy Google lo manda como 402 (docs de
  // billing y de errores, 2026-10); antes como 429 RESOURCE_EXHAUSTED ("Your
  // prepayment credits are depleted", verificado en vivo 2026-09-10) o 403
  // (BILLING_DISABLED). Va ANTES que invalid_key y rate_limit.
  if (status === 402) {
    return { kind: "billing", message: message.slice(0, 300) };
  }
  if ((status === 429 || status === 403) && isBillingExhaustion(payload)) {
    return { kind: "billing", message: message.slice(0, 300) };
  }

  // Modelo inexistente o retirado: un 404 de generateContent solo puede ser eso.
  if (status === 404) {
    return { kind: "model_not_found", model, message: message.slice(0, 300) };
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

/* -------------------------------------------------------------------------- */
/*  IA caída (sin saldo, key mala, modelo inexistente)                          */
/* -------------------------------------------------------------------------- */

/** Causas que son CAÍDA de la IA: no se arreglan solas reintentando. */
export type AiOutageCause = "billing" | "invalid_key" | "missing_key" | "model_not_found";

/**
 * ¿Este error es una caída de la IA? Los transitorios (rate limit, red, 5xx) y
 * los bloqueos de contenido NO: se arreglan solos o dependen del pedido.
 */
export function aiOutageCause(error: GeminiError | null | undefined): AiOutageCause | null {
  if (!error) return null;
  switch (error.kind) {
    case "billing":
    case "invalid_key":
    case "missing_key":
    case "model_not_found":
      return error.kind;
    default:
      return null;
  }
}

/**
 * ¿Google bloqueó la ENTRADA (la foto o el pedido del cliente)? Es el único
 * fallo en el que NO se devuelve el crédito (regla de Paolo): solo aviso.
 */
export function isInputBlocked(error: GeminiError | null | undefined): boolean {
  return !!error && error.kind === "content_blocked" && error.stage === "input";
}

/**
 * De varios fallos de una tanda, el que define qué se le dice al cliente:
 *  1. una caída de la IA (afecta a todos);
 *  2. bloqueo de la entrada, SOLO si fallaron todas por eso (misma entrada);
 *  3. el primero.
 * Si alguna falló por otra cosa, el bloqueo no es "solo de la foto": se trata
 * como falla nuestra (se devuelve).
 */
export function pickBatchError(failures: GeminiError[]): GeminiError {
  const outage = failures.find((f) => aiOutageCause(f) !== null);
  if (outage) return outage;
  if (failures.length > 0 && failures.every(isInputBlocked)) return failures[0];
  const notInput = failures.find((f) => !isInputBlocked(f));
  return notInput ?? failures[0] ?? { kind: "unknown", message: "Sin imágenes." };
}

/**
 * Corte local de ESTA instancia. La fuente de verdad es la fila 'ai' de
 * `service_status` (lib/avisos/ai-gate.ts): las rutas preguntan `aiGate()`
 * ANTES de cobrar. Este corte es el atajo sincrónico para el medio de una tanda
 * (pipeline v2) y OBEDECE a la fila: ai-gate lo sincroniza con `syncAiBreaker()`
 * cada vez que la lee, y lo levanta cuando la IA vuelve.
 */
export const BILLING_BREAKER_MS = 120_000;
let aiDownUntil = 0;

/**
 * Anota una caída de la IA: prende el corte local y, la primera vez (por
 * instancia y por apertura del corte), marca la fila como caída y abre la
 * alerta U a Paolo (`markAiDown`). Si `error` no es una caída, no hace nada.
 * NUNCA tira.
 */
export async function reportAiOutage(
  error: GeminiError | null | undefined,
  info: { model?: string | null; status?: number | null } = {},
): Promise<void> {
  const cause = aiOutageCause(error);
  if (!cause || !error) return;
  const now = Date.now();
  const wasOpen = aiDownUntil > now;
  aiDownUntil = now + BILLING_BREAKER_MS;
  if (wasOpen) return;

  const message =
    error.kind === "billing" || error.kind === "model_not_found" ? error.message ?? null : null;
  const model =
    error.kind === "model_not_found" ? error.model ?? info.model ?? null : info.model ?? null;
  // Una línea por apertura del corte (no una por imagen). Sin la key.
  console.error(
    "[gemini] ai_down",
    JSON.stringify({ cause, status: info.status ?? null, model, message: (message ?? "").slice(0, 300) }),
  );
  try {
    const gate = await loadAiGate();
    await gate?.markAiDown(cause, { model, status: info.status ?? null, message });
  } catch (err) {
    console.error("[gemini] markAiDown falló:", err instanceof Error ? err.message : err);
  }
}

/** Respuesta OK de Gemini: levanta el corte local y avisa a ai-gate (barato si ya estaba ok). */
function noteAiOk(model: string): void {
  aiDownUntil = 0;
  void loadAiGate()
    .then((gate) => gate?.markAiUp("gemini_ok", { model }))
    .catch(() => {});
}

/**
 * Lo llama lib/avisos/ai-gate.ts al leer la fila: ok → se levanta el corte
 * local; caída → se sostiene mientras dure la cache de la fila.
 */
export function syncAiBreaker(ok: boolean, holdMs = 15_000): void {
  if (ok) {
    aiDownUntil = 0;
    return;
  }
  aiDownUntil = Math.max(aiDownUntil, Date.now() + holdMs);
}

/**
 * import dinámico: este cliente lo usan también scripts fuera de Next
 * (scripts/v2-dry-run.ts), donde lib/avisos (server-only) no carga. Ahí la
 * promesa da null y queda solo el corte local.
 */
type AiGateModule = typeof import("@/lib/avisos/ai-gate");
let aiGatePromise: Promise<AiGateModule | null> | null = null;
function loadAiGate(): Promise<AiGateModule | null> {
  if (!aiGatePromise) {
    aiGatePromise = import("@/lib/avisos/ai-gate").catch(() => null);
  }
  return aiGatePromise;
}

/** ¿Esta instancia tiene la IA cortada (caída vista hace < 2 min, o la fila dice caída)? */
export function isGeminiBillingExhausted(now: number = Date.now()): boolean {
  return aiDownUntil > now;
}

/** Alias con el nombre correcto (la caída ya no es solo falta de saldo). */
export const isAiDownLocally = isGeminiBillingExhausted;

/** Solo pruebas offline: vuelve el corte a cerrado. */
export function resetGeminiBillingState(): void {
  aiDownUntil = 0;
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
