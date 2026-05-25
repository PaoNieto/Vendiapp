/**
 * Image analyzer — Gemini Vision (`gemini-2.5-flash`).
 *
 * Recibe una imagen (dataURL del uploader) + el ratio elegido, y le pide a
 * Gemini un análisis estructurado en JSON con 4 campos:
 *  - composition  (2-3 párrafos)
 *  - lighting     (2-3 párrafos)
 *  - why_it_sells (4 párrafos analíticos)
 *  - identified_styles (2-4 estilos curados con razón)
 *
 * Usamos `responseMimeType: "application/json"` para forzar a Gemini a
 * devolver JSON puro sin code fences ni texto extra. Igual validamos con Zod
 * porque el modelo a veces se sale del schema y preferimos un error explícito
 * a renderizar basura.
 *
 * Los `identified_styles[*].id` quedan acotados al union `CuratedStyleId` —
 * si Gemini inventa un id que no existe en `CURATED_STYLES`, Zod corta y
 * devolvemos `unknown`. La UI ya pinta sólo los 9 ids canónicos.
 */

import { z } from "zod";

import {
  callGemini,
  GEMINI_TEXT_MODEL,
  type GeminiContent,
  type GeminiResponse,
} from "@/lib/ai/gemini-client";
import type { GenerationError } from "@/lib/ai/image-generator";
import type { OutputRatio } from "@/lib/constants";
import type { CuratedStyleId } from "@/app/(app)/referencias/page";

/* -------------------------------------------------------------------------- */
/*  Tipos públicos                                                              */
/* -------------------------------------------------------------------------- */

export type AnalyzeImageInput = {
  apiKey: string;
  /** dataURL completo: `data:image/png;base64,<payload>`. */
  imageDataUrl: string;
  ratio: OutputRatio;
};

export type AnalyzeImageResult =
  | {
      ok: true;
      analysis: {
        composition: string;
        lighting: string;
        why_it_sells: string;
        identified_styles: { id: CuratedStyleId; reason: string }[];
      };
    }
  | { ok: false; error: GenerationError };

/* -------------------------------------------------------------------------- */
/*  Schema Zod del JSON que esperamos de Gemini                                  */
/* -------------------------------------------------------------------------- */

const CURATED_STYLE_IDS = [
  "mineral",
  "calido",
  "editorial",
  "mostaza",
  "nocturno",
  "pastel",
  "mint",
  "mono",
  "champagne",
] as const satisfies ReadonlyArray<CuratedStyleId>;

const analysisSchema = z.object({
  composition: z.string().min(20),
  lighting: z.string().min(20),
  why_it_sells: z.string().min(40),
  // Pedimos entre 2 y 4 en el prompt. Aceptamos hasta 9 (los 9 IDs canónicos)
  // por si Gemini se entusiasma — la UI ya pinta sólo los que vienen.
  // El mínimo lo dejamos en 1 para no rebotar análisis donde Gemini sólo
  // detecte un estilo dominante muy fuerte (caso edge, pero válido).
  identified_styles: z
    .array(
      z.object({
        id: z.enum(CURATED_STYLE_IDS),
        reason: z.string().min(4),
      }),
    )
    .min(1)
    .max(9),
});

/* -------------------------------------------------------------------------- */
/*  Prompt                                                                      */
/* -------------------------------------------------------------------------- */

const STYLES_LIST = CURATED_STYLE_IDS.join("|");

function buildAnalysisPrompt(ratio: OutputRatio): string {
  return `Sos un analista experto en imágenes comerciales para e-commerce y ads.
Analizá la imagen adjunta (formato ${ratio}). Devolvé SOLO un JSON válido
con esta estructura exacta:

{
  "composition": "2-3 párrafos sobre regla de tercios, foco, jerarquía visual, líneas y aire negativo",
  "lighting": "2-3 párrafos sobre la luz: dirección, hora del día, mood que genera, calidad de las sombras",
  "why_it_sells": "4 párrafos analíticos sobre POR QUÉ esta imagen funciona comercialmente: canal óptimo, emoción que activa, patrones de imágenes que venden que reproduce, errores comunes que evita",
  "identified_styles": [
    { "id": "<uno de: ${STYLES_LIST}>", "reason": "1 frase corta del por qué este estilo está presente" }
  ]
}

Reglas estrictas:
- Identificá entre 2 y 4 estilos (no más, no menos).
- NO inventes IDs de estilo — usá exactamente uno de los 9 listados.
- NO incluyas texto fuera del JSON.
- NO uses markdown ni code fences.
- Escribí en castellano natural, tono editorial, sin clichés.
- Los párrafos van separados por doble salto de línea ("\\n\\n") dentro del string.`;
}

/* -------------------------------------------------------------------------- */
/*  Entry point                                                                 */
/* -------------------------------------------------------------------------- */

export async function analyzeImage(
  input: AnalyzeImageInput,
): Promise<AnalyzeImageResult> {
  if (!input.apiKey || input.apiKey.trim().length === 0) {
    return { ok: false, error: { kind: "missing_key" } };
  }

  // 1. Partimos el dataURL en (mime, data) para mandarlo como `inlineData`.
  const parsed = parseDataUrl(input.imageDataUrl);
  if (!parsed) {
    return {
      ok: false,
      error: {
        kind: "unknown",
        message: "La imagen no está en formato dataURL base64.",
      },
    };
  }

  const contents: GeminiContent[] = [
    {
      role: "user",
      parts: [
        { inlineData: { mimeType: parsed.mime, data: parsed.data } },
        { text: buildAnalysisPrompt(input.ratio) },
      ],
    },
  ];

  // 2. Llamamos. Le pedimos JSON estructurado directamente — Gemini 2.5+ lo
  //    respeta y devuelve un string JSON puro en el primer `text` part.
  const result = await callGemini({
    apiKey: input.apiKey,
    model: GEMINI_TEXT_MODEL,
    contents,
    generationConfig: {
      responseMimeType: "application/json",
      // temperature baja para análisis: queremos consistencia, no creatividad.
      temperature: 0.4,
    },
    timeoutMs: 45_000,
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  // 3. Extraemos el texto del primer candidato. Gemini Vision con
  //    `responseMimeType: application/json` mete TODO el JSON en un solo
  //    `text` part del candidato.
  const text = extractFirstText(result.response);
  if (!text) {
    return {
      ok: false,
      error: {
        kind: "unknown",
        message: "Gemini no devolvió texto en el análisis.",
      },
    };
  }

  // 4. Parseamos. Si Gemini se sale del schema, devolvemos error explícito.
  //    `JSON.parse` rara vez falla con `responseMimeType: application/json`
  //    pero defendemos igual — un caracter raro y se cae todo.
  let json: unknown;
  try {
    json = JSON.parse(stripCodeFences(text));
  } catch {
    return {
      ok: false,
      error: {
        kind: "unknown",
        message: "Respuesta de Gemini no parseable como JSON.",
      },
    };
  }

  const validated = analysisSchema.safeParse(json);
  if (!validated.success) {
    return {
      ok: false,
      error: {
        kind: "unknown",
        message: "Respuesta de Gemini no coincide con el schema esperado.",
      },
    };
  }

  return { ok: true, analysis: validated.data };
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Parsea `data:image/<mime>;base64,<payload>` en sus partes.
 * Devuelve null si la URL no tiene este shape (ej. blob: o http:).
 */
function parseDataUrl(
  dataUrl: string,
): { mime: string; data: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { mime: match[1], data: match[2] };
}

function extractFirstText(response: GeminiResponse): string | null {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if ("text" in part && typeof part.text === "string" && part.text) {
      return part.text;
    }
  }
  return null;
}

/**
 * Defensa por si Gemini ignora `responseMimeType` y envuelve el JSON con
 * code fences ```json ... ```. Por contrato no debería pasar — pero pasa.
 */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");
  return stripped.trim();
}
