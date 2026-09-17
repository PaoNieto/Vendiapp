/**
 * Llamada a Gemini con salida JSON ESTRUCTURADA (schema), para las notas y el
 * Director de la v2.
 *
 * Qué forma de pedirlo — verificado EN VIVO el 2026-09-10 contra
 * gemini-3.1-pro-preview en v1beta (la spec suponía otra cosa):
 *   - `responseFormat.text.mimeType: "application/json"` → 400 INVALID_ARGUMENT
 *     ("Invalid value at generation_config.response_format.text.mime_type
 *     (TextResponseFormat.MimeType)"). El campo es un ENUM, no un MIME.
 *   - `responseFormat.text.mimeType: "APPLICATION_JSON"` + `schema` → 200. Es la
 *     forma que recomienda la guía actual, así que es la primaria.
 *   - `responseMimeType: "application/json"` + `responseJsonSchema` → 200 también.
 *     Queda de plan B: si Google vuelve a mover `responseFormat`, un 400 de
 *     formato cae acá una vez y el proceso recuerda la forma que anduvo.
 *   - En los dos casos la respuesta es UN part de texto con el JSON (a veces
 *     pretty-printed, sin code fences) + un `thoughtSignature` en el mismo part.
 *   - `thinkingLevel` "low" y "medium" y `mediaResolution: MEDIA_RESOLUTION_HIGH`
 *     (global) conviven sin error con cualquiera de las dos formas.
 *
 * Nunca se manda `temperature` (Gemini 3 pide dejarla en 1.0; la consistencia la
 * da el cache) ni `thinkingBudget` (mezclarlo con `thinkingLevel` es 400).
 */

import {
  callGemini,
  type GeminiError,
  type GeminiPart,
  type GeminiResponse,
} from "@/lib/ai/gemini-client";
import type { CallGeminiFn, V2Logger } from "@/lib/ai/v2/types";

export type JsonMode = "responseFormat" | "responseJsonSchema";
export type ThinkingLevel = "low" | "medium" | "high";
export type MediaResolution =
  | "MEDIA_RESOLUTION_LOW"
  | "MEDIA_RESOLUTION_MEDIUM"
  | "MEDIA_RESOLUTION_HIGH";

/** Errores de la v2: los de Gemini + "respondió pero no es JSON válido". */
export type V2CallError = GeminiError | { kind: "bad_json"; message: string };

export type UsageInfo = {
  promptTokens?: number;
  outputTokens?: number;
  thoughtsTokens?: number;
};

export type JsonCallOptions = {
  apiKey: string;
  model: string;
  systemInstruction: string;
  parts: GeminiPart[];
  schema: Record<string, unknown>;
  thinkingLevel: ThinkingLevel;
  /** Solo cuando hay imágenes. El Director no las recibe y no lo manda. */
  mediaResolution?: MediaResolution;
  timeoutMs: number;
  call?: CallGeminiFn;
  log?: V2Logger;
  /** Para los logs: "product_brief", "reference_brief", "director". */
  label: string;
};

export type JsonCallResult =
  | { ok: true; json: unknown; mode: JsonMode; usage: UsageInfo | null }
  | { ok: false; error: V2CallError; mode: JsonMode };

// Recuerdo por proceso de la forma que anduvo: si `responseFormat` da 400 una
// vez, las siguientes llamadas de esta instancia van directo al plan B en vez de
// pagar un round-trip fallido (~1.3s medido) en cada nota.
let preferredMode: JsonMode = "responseFormat";

function buildGenerationConfig(
  mode: JsonMode,
  schema: Record<string, unknown>,
  thinkingLevel: ThinkingLevel,
  mediaResolution?: MediaResolution,
): Record<string, unknown> {
  const common = {
    thinkingConfig: { thinkingLevel },
    ...(mediaResolution ? { mediaResolution } : {}),
  };
  return mode === "responseFormat"
    ? { responseFormat: { text: { mimeType: "APPLICATION_JSON", schema } }, ...common }
    : { responseMimeType: "application/json", responseJsonSchema: schema, ...common };
}

/**
 * Un 400 "genérico" (callGemini ya separa key inválida y safety en otros kinds).
 * Verificado en vivo: un schema que la API no acepta responde
 * `400 "Request contains an invalid argument."` SIN nombrar el campo, así que no
 * alcanza con buscar "response_format" en el mensaje. Reintentar con la otra
 * forma es gratis (los 400 no se cobran) y es la única manera de saber si el
 * problema era la forma o el schema.
 */
function isFormatRejection(err: GeminiError): boolean {
  return err.kind === "unknown" && /^HTTP 400/.test(err.message);
}

const BLOCK_REASONS = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "IMAGE_SAFETY"]);

/**
 * Texto de la respuesta, sin los parts de pensamiento. Con thinking, Gemini 3
 * devuelve el JSON en un part de texto que además trae `thoughtSignature`; si
 * alguna vez vinieran parts `thought: true`, no son la respuesta.
 */
export function extractResponseText(response: GeminiResponse): {
  text: string;
  finishReason?: string;
} {
  const candidate = response.candidates?.[0];
  const parts = (candidate?.content?.parts ?? []) as Array<GeminiPart & { thought?: boolean }>;
  const text = parts
    .filter((p) => "text" in p && typeof p.text === "string" && p.thought !== true)
    .map((p) => ("text" in p ? p.text : ""))
    .join("");
  return { text, finishReason: candidate?.finishReason };
}

function readUsage(response: GeminiResponse): UsageInfo | null {
  const u = (response as { usageMetadata?: Record<string, unknown> }).usageMetadata;
  if (!u) return null;
  const n = (k: string) => (typeof u[k] === "number" ? (u[k] as number) : undefined);
  return {
    promptTokens: n("promptTokenCount"),
    outputTokens: n("candidatesTokenCount"),
    thoughtsTokens: n("thoughtsTokenCount"),
  };
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

async function callOnce(opts: JsonCallOptions, mode: JsonMode) {
  const call = opts.call ?? callGemini;
  return call({
    apiKey: opts.apiKey,
    model: opts.model,
    systemInstruction: { parts: [{ text: opts.systemInstruction }] },
    contents: [{ role: "user", parts: opts.parts }],
    generationConfig: buildGenerationConfig(mode, opts.schema, opts.thinkingLevel, opts.mediaResolution),
    timeoutMs: opts.timeoutMs,
  });
}

export async function callGeminiJson(opts: JsonCallOptions): Promise<JsonCallResult> {
  let mode = preferredMode;
  let result = await callOnce(opts, mode);

  if (!result.ok && isFormatRejection(result.error)) {
    const other: JsonMode = mode === "responseFormat" ? "responseJsonSchema" : "responseFormat";
    opts.log?.("json_mode_fallback", { label: opts.label, from: mode, to: other, error: result.error });
    result = await callOnce(opts, other);
    if (result.ok) preferredMode = other;
    mode = other;
  }

  if (!result.ok) return { ok: false, error: result.error, mode };

  const { text, finishReason } = extractResponseText(result.response);
  if (finishReason && BLOCK_REASONS.has(finishReason)) {
    return { ok: false, error: { kind: "content_blocked", reason: finishReason }, mode };
  }
  if (!text) {
    return { ok: false, error: { kind: "bad_json", message: `sin texto (finishReason ${finishReason ?? "?"})` }, mode };
  }
  try {
    const json: unknown = JSON.parse(stripCodeFences(text));
    return { ok: true, json, mode, usage: readUsage(result.response) };
  } catch {
    return {
      ok: false,
      error: {
        kind: "bad_json",
        message: `JSON no parseable (finishReason ${finishReason ?? "?"}, ${text.length} chars)`,
      },
      mode,
    };
  }
}
