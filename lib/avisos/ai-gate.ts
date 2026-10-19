import "server-only";
import { syncAiBreaker } from "@/lib/ai/gemini-client";
import { alertAdmin, resolveAlert } from "./alert";
import { adminClientOrNull, errorText, num, rpcObject, str } from "./db";
import type { AiCause } from "./types";

/**
 * ESTADO GLOBAL DE LA IA (fila 'ai' de `service_status`).
 *
 * Para qué: cortar ANTES de cobrar. Si Google se quedó sin saldo, la key no
 * sirve o el modelo no existe, cada intento sería descontar + fallar +
 * devolver. Con el corte, la ruta responde 503 sin tocar créditos y el cliente
 * ve el banner «Ahora no podemos generar…».
 *
 * Piezas:
 *  - aiGate()      → lee la fila (cache de 15 s por instancia). Con la IA caída
 *                    deja pasar UNA prueba cuando venció next_probe_at (claim
 *                    atómico `ai_claim_probe`, UPDATE … RETURNING): esa prueba
 *                    es una llamada de texto barata, no la tanda de un cliente.
 *  - markAiDown()  → la pasa a caída y abre la alerta U 'ai_down' (dedupe:
 *                    las siguientes suben occurrences).
 *  - markAiUp()    → atómico: solo el que la pasa de caída a ok avisa «Ya podés
 *                    generar de nuevo» a cada watcher, los borra y resuelve la
 *                    alerta (mail de "resuelta"). Barato si ya estaba ok.
 *  - watchAiOutage → anota a quién avisarle cuando vuelva (el que vio el banner
 *                    o el que recibió el 503).
 *
 * Qué cuenta como caída (AiCause): sin saldo ('billing': 402, o 429/403 con
 * texto de prepago), key inválida o faltante, modelo inexistente (404). NO los
 * transitorios (rate limit, 5xx, red): esos se arreglan solos.
 *
 * Fail-open: si no se puede leer la fila y no hay nada en cache, se deja pasar
 * (un problema interno nuestro no puede apagar la IA). Si la base no responde
 * pero la cache decía caída, se respeta la cache.
 *
 * NADA acá tira.
 */

const CACHE_TTL_MS = 15_000;
const AI_ALERT_KEY = "ai_down";

/**
 * Modelos baratos para la prueba de saldo/key (solo importa el HTTP 200). El
 * alias `-latest` sobrevive a los retiros de modelos; si alguno da 404 se pasa
 * al siguiente.
 */
const PROBE_TEXT_MODELS = ["gemini-flash-lite-latest", "gemini-2.5-flash"] as const;

const GEMINI_API_ROOT = "https://generativelanguage.googleapis.com/v1beta";

export type AiStatus = {
  ok: boolean;
  since: string | null;
  cause: AiCause | null;
  /** Modelo que falló (solo para model_not_found). */
  model: string | null;
  nextProbeAt: string | null;
};

export type AiGateResult =
  | { open: true; probed: boolean }
  | { open: false; since: string | null; cause: AiCause | null };

export type AiUpSource = "gemini_ok" | "probe" | "admin" | "cron";

export type ProbeResult =
  | { ok: true; model?: string }
  | {
      ok: false;
      /** null = la prueba no fue concluyente (red, 5xx): no cambia nada. */
      cause: AiCause | null;
      model?: string | null;
      status?: number | null;
      message?: string | null;
    };

let cache: { status: AiStatus; at: number } | null = null;

const AI_CAUSES: readonly AiCause[] = ["billing", "invalid_key", "missing_key", "model_not_found"];

/** reason = '<causa>' o '<causa>:<modelo>'. */
function encodeReason(cause: AiCause, model?: string | null): string {
  return model ? `${cause}:${model}` : cause;
}

function parseReason(reason: string | null): { cause: AiCause | null; model: string | null } {
  if (!reason) return { cause: null, model: null };
  const idx = reason.indexOf(":");
  const rawCause = idx === -1 ? reason : reason.slice(0, idx);
  const model = idx === -1 ? null : reason.slice(idx + 1) || null;
  const cause = (AI_CAUSES as readonly string[]).includes(rawCause) ? (rawCause as AiCause) : null;
  return { cause, model };
}

/** Último fallo de lectura: no se reintenta la base por 15 s (se usa lo que haya). */
let readFailedAt = 0;

/** Lee la fila 'ai' (cache 15 s). null = no se pudo leer y no hay cache. */
async function readStatus(force = false): Promise<AiStatus | null> {
  const now = Date.now();
  if (!force && cache && now - cache.at < CACHE_TTL_MS) return cache.status;
  if (!force && now - readFailedAt < CACHE_TTL_MS) return cache?.status ?? null;

  const admin = adminClientOrNull();
  if (!admin) return cache?.status ?? null;
  try {
    const { data, error } = await admin
      .from("service_status")
      .select("ok, since, reason, next_probe_at")
      .eq("id", "ai")
      .maybeSingle();
    if (error) {
      readFailedAt = now;
      console.error("[avisos] No se pudo leer service_status:", error.message);
      return cache?.status ?? null;
    }
    // Sin fila (0028 sin aplicar o borrada): se trata como ok.
    const parsed = parseReason(str(data?.reason));
    const status: AiStatus = {
      ok: data ? data.ok !== false : true,
      since: str(data?.since),
      cause: parsed.cause,
      model: parsed.model,
      nextProbeAt: str(data?.next_probe_at),
    };
    cache = { status, at: now };
    // El corte local de gemini-client obedece a la fila (Hawkeye).
    syncAiBreaker(status.ok, CACHE_TTL_MS);
    return status;
  } catch (err) {
    readFailedAt = now;
    console.error("[avisos] service_status tiró:", errorText(err));
    return cache?.status ?? null;
  }
}

/** Estado actual de la IA (para el panel y el semáforo). */
export async function getAiStatus(opts: { fresh?: boolean } = {}): Promise<AiStatus | null> {
  return readStatus(opts.fresh === true);
}

/**
 * El portero de la IA: llamalo ANTES de reservar cupo o descontar créditos.
 *
 *   const gate = await aiGate({ watchUserId: userId });
 *   if (!gate.open) → 503 { error: "ai_unavailable", message: messageText("ai_down", {}), refunded: 0 }
 *
 * `watchUserId`: si está caída, anota al usuario para avisarle cuando vuelva.
 * `allowProbe: false`: solo lee, nunca prueba (para lecturas muy frecuentes).
 */
export async function aiGate(
  opts: { watchUserId?: string | null; allowProbe?: boolean } = {},
): Promise<AiGateResult> {
  try {
    const status = await readStatus();
    if (!status || status.ok) return { open: true, probed: false };

    const now = Date.now();
    const due = !status.nextProbeAt || Date.parse(status.nextProbeAt) <= now;
    if (opts.allowProbe !== false && due) {
      const claimed = await claimProbe();
      if (claimed) {
        const probe = await probeAi({ cause: status.cause, model: status.model });
        if (probe.ok) {
          await markAiUp("probe");
          return { open: true, probed: true };
        }
        if (probe.cause) {
          await markAiDown(probe.cause, {
            model: probe.model ?? status.model,
            status: probe.status ?? null,
            message: probe.message ?? null,
          });
        }
      }
    }

    if (opts.watchUserId) await watchAiOutage(opts.watchUserId);
    return { open: false, since: status.since, cause: status.cause };
  } catch (err) {
    console.error("[avisos] aiGate tiró (dejo pasar):", errorText(err));
    return { open: true, probed: false };
  }
}

/** Reclama la prueba (una sola instancia gana). */
async function claimProbe(): Promise<boolean> {
  // Sea cual sea el resultado, esta instancia no vuelve a intentar enseguida.
  if (cache) {
    cache = {
      status: { ...cache.status, nextProbeAt: new Date(Date.now() + 120_000).toISOString() },
      at: cache.at,
    };
  }
  const admin = adminClientOrNull();
  if (!admin) return false;
  try {
    const { data, error } = await admin.rpc("ai_claim_probe");
    if (error) {
      console.error("[avisos] ai_claim_probe falló:", error.message);
      return false;
    }
    return data === true;
  } catch (err) {
    console.error("[avisos] ai_claim_probe tiró:", errorText(err));
    return false;
  }
}

/**
 * La IA está caída. Llamalo cuando Gemini devuelve una causa de caída
 * (billing / invalid_key / missing_key / model_not_found). Abre o repite la
 * alerta U 'ai_down'. NUNCA tira.
 */
export async function markAiDown(
  cause: AiCause,
  info: { model?: string | null; status?: number | null; message?: string | null } = {},
): Promise<{ changed: boolean }> {
  const model = cause === "model_not_found" ? info.model ?? null : null;
  const prev = cache?.status;
  // La cache cae YA: esta instancia corta sin esperar a la base. Si ya estaba
  // caída, se conservan `since` y la próxima prueba (no se pospone).
  cache = {
    status: {
      ok: false,
      since: prev && !prev.ok ? prev.since : new Date().toISOString(),
      cause,
      model,
      nextProbeAt:
        prev && !prev.ok ? prev.nextProbeAt : new Date(Date.now() + 120_000).toISOString(),
    },
    at: Date.now(),
  };
  syncAiBreaker(false, CACHE_TTL_MS);

  let changed = false;
  const admin = adminClientOrNull();
  if (admin) {
    try {
      const { data, error } = await admin.rpc("ai_mark_down", {
        p_reason: encodeReason(cause, model),
      });
      if (error) console.error("[avisos] ai_mark_down falló:", error.message);
      else changed = rpcObject(data)?.changed === true;
    } catch (err) {
      console.error("[avisos] ai_mark_down tiró:", errorText(err));
    }
  }

  await alertAdmin({
    kind: "ai_down",
    severity: "U",
    dedupeKey: AI_ALERT_KEY,
    details: {
      cause,
      model: info.model ?? null,
      status: info.status ?? null,
      message: info.message ? info.message.slice(0, 300) : null,
    },
  });

  return { changed };
}

/**
 * La IA respondió bien. Barato si ya estaba ok (mira la cache de 15 s): se
 * puede llamar después de cada respuesta OK de Gemini. Si la fila estaba
 * caída, la pasa a ok de forma atómica, avisa a los watchers y resuelve la
 * alerta. NUNCA tira.
 */
export async function markAiUp(
  source: AiUpSource = "gemini_ok",
  opts: { model?: string | null } = {},
): Promise<{ changed: boolean; notified: number }> {
  try {
    const status = await readStatus();
    if (status?.ok) return { changed: false, notified: 0 };
    // Sin poder leer la fila, una respuesta OK cualquiera no dispara la RPC (se
    // llama después de CADA respuesta OK de Gemini).
    if (!status && source === "gemini_ok") return { changed: false, notified: 0 };
    // Caída por modelo inexistente: que responda OTRO modelo (ej. el análisis)
    // no prueba que el caído volvió. Sin esto, la fila iría y vendría.
    if (
      source === "gemini_ok" &&
      status?.cause === "model_not_found" &&
      status.model &&
      opts.model &&
      opts.model !== status.model
    ) {
      return { changed: false, notified: 0 };
    }

    const admin = adminClientOrNull();
    if (!admin) return { changed: false, notified: 0 };
    const { data, error } = await admin.rpc("ai_mark_up", { p_source: source });
    if (error) {
      console.error("[avisos] ai_mark_up falló:", error.message);
      return { changed: false, notified: 0 };
    }
    const row = rpcObject(data);
    const changed = row?.changed === true;
    const notified = num(row?.notified) ?? 0;

    cache = {
      status: { ok: true, since: new Date().toISOString(), cause: null, model: null, nextProbeAt: null },
      at: Date.now(),
    };
    syncAiBreaker(true);

    if (changed) {
      await resolveAlert(AI_ALERT_KEY, { resolution: { source, notified } });
    }
    return { changed, notified };
  } catch (err) {
    console.error("[avisos] markAiUp tiró:", errorText(err));
    return { changed: false, notified: 0 };
  }
}

/** Anota al usuario para avisarle cuando vuelva la IA. NUNCA tira. */
export async function watchAiOutage(userId: string): Promise<void> {
  if (!userId) return;
  const admin = adminClientOrNull();
  if (!admin) return;
  try {
    const { error } = await admin
      .from("ai_outage_watchers")
      .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
    if (error) console.error("[avisos] No se pudo anotar al watcher:", error.message);
  } catch (err) {
    console.error("[avisos] watchAiOutage tiró:", errorText(err));
  }
}

/**
 * Prueba AHORA si la IA volvió, sin esperar a next_probe_at: para el botón
 * [Ya recargué] del panel y para el cron. Si volvió, markAiUp; si sigue caída
 * con causa clara, markAiDown. NUNCA tira.
 */
export async function recheckAi(source: "admin" | "cron"): Promise<ProbeResult> {
  const status = await readStatus(true);
  const probe = await probeAi({ cause: status?.cause ?? null, model: status?.model ?? null });
  if (probe.ok) {
    await markAiUp(source);
  } else if (probe.cause) {
    await markAiDown(probe.cause, {
      model: probe.model ?? status?.model ?? null,
      status: probe.status ?? null,
      message: probe.message ?? null,
    });
  }
  return probe;
}

/**
 * La prueba en sí. Barata:
 *  - modelo inexistente → `GET models/{modelo}` (no factura);
 *  - el resto → un generateContent de texto mínimo con un modelo flash (lo
 *    que importa es el HTTP 200: prueba saldo y key).
 *
 * Va por fetch directo y NO por `callGemini`: así no toca el corte local de
 * lib/ai/gemini-client.ts y no hay import circular cuando ese cliente llame a
 * markAiDown/markAiUp.
 */
export async function probeAi(
  hint: { cause?: AiCause | null; model?: string | null } = {},
): Promise<ProbeResult> {
  const apiKey = process.env.GOOGLE_API_KEY?.trim() ?? "";
  if (!apiKey) return { ok: false, cause: "missing_key" };

  try {
    if (hint.cause === "model_not_found" && hint.model) {
      return await probeModelExists(apiKey, hint.model);
    }

    for (const model of PROBE_TEXT_MODELS) {
      const url = `${GEMINI_API_ROOT}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "ok" }] }],
            generationConfig: { maxOutputTokens: 16 },
          }),
          signal: AbortSignal.timeout(15_000),
          cache: "no-store",
        });
      } catch (err) {
        return { ok: false, cause: null, model, message: `red: ${errorText(err)}` };
      }
      if (res.ok) return { ok: true, model };

      const message = await readGoogleError(res);
      // El modelo de prueba no existe más: probamos con el siguiente.
      if (res.status === 404) continue;
      if (res.status === 402) return { ok: false, cause: "billing", model, status: 402, message };
      if ((res.status === 429 || res.status === 403) && BILLING_RE.test(message)) {
        return { ok: false, cause: "billing", model, status: res.status, message };
      }
      // Rate limit normal = la API responde y cobra: volvió.
      if (res.status === 429) return { ok: true, model };
      if (res.status === 401 || res.status === 403 || (res.status === 400 && /api[_ ]?key/i.test(message))) {
        return { ok: false, cause: "invalid_key", model, status: res.status, message };
      }
      // 5xx u otro: no concluyente.
      return { ok: false, cause: null, model, status: res.status, message };
    }
    return { ok: false, cause: null, message: "Ningún modelo de prueba respondió (404)." };
  } catch (err) {
    return { ok: false, cause: null, message: errorText(err) };
  }
}

/**
 * Frases de Google que significan "sin saldo / billing apagado" (mismo criterio
 * que lib/ai/gemini-client.ts: NO la palabra "billing" suelta, porque el rate
 * limit normal dice "check your plan and billing details").
 */
const BILLING_RE =
  /\bprepay(?:ment|ed)\b|\bcredits?\s+(?:are\s+|is\s+|have\s+been\s+|has\s+been\s+)?(?:depleted|exhausted|used\s+up|insufficient)\b|\binsufficient\s+(?:funds|balance|credits?)\b|\brequires?\s+billing\b|\bbilling\s+(?:account\s+)?(?:is\s+|has\s+been\s+)?(?:disabled|suspended|closed|inactive|not\s+(?:enabled|active|set\s*up))\b|\bBILLING_DISABLED\b/i;

/** Texto de error de Google (message + reasons), recortado. */
async function readGoogleError(res: Response): Promise<string> {
  try {
    const payload = (await res.json()) as {
      error?: { message?: string; status?: string; details?: Array<{ reason?: unknown }> };
    };
    const reasons = (payload.error?.details ?? [])
      .map((d) => (typeof d?.reason === "string" ? d.reason : ""))
      .filter(Boolean);
    return [payload.error?.message ?? `HTTP ${res.status}`, payload.error?.status ?? "", ...reasons]
      .join(" ")
      .trim()
      .slice(0, 300);
  } catch {
    return `HTTP ${res.status}`;
  }
}

async function probeModelExists(apiKey: string, model: string): Promise<ProbeResult> {
  const url = `${GEMINI_API_ROOT}/models/${encodeURIComponent(model)}?key=${encodeURIComponent(apiKey)}`;
  try {
    const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(10_000), cache: "no-store" });
    if (res.ok) return { ok: true, model };
    if (res.status === 404) return { ok: false, cause: "model_not_found", model, status: 404 };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, cause: "invalid_key", model, status: res.status };
    }
    return { ok: false, cause: null, model, status: res.status };
  } catch (err) {
    return { ok: false, cause: null, model, message: errorText(err) };
  }
}
