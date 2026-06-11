/**
 * Motor de generación SERVER-SIDE (modelo de créditos).
 *
 * Versión server del browser `image-generator.ts`. Diferencias:
 *  - Usa la API key PROPIA de Vendí (`process.env.GOOGLE_API_KEY`), no la del
 *    usuario. El usuario ya no pega ninguna key (pivote BYOK → créditos).
 *  - Convierte imágenes a base64 con Buffer (no FileReader, que es del browser).
 *  - Enforce de aspect ratio con `sharp` (no Canvas, que es del browser).
 *  - Devuelve Buffers JPEG listos para subir a Storage desde el server.
 *
 * Corre SOLO en el server (API route). Nunca importar desde un componente
 * cliente — expondría la lógica + asume `process.env`.
 *
 * NOTA (Fase 4): hay duplicación intencional con `image-generator.ts` y
 * `art-director.ts` (SYSTEM_PROMPT, armado de prompt). Cuando el path server
 * reemplace al browser, se borra el browser y se consolida acá.
 */

import sharp from "sharp";
import {
  callGemini,
  GEMINI_IMAGE_MODEL,
  GEMINI_REASONING_MODEL,
  type GeminiContent,
  type GeminiError,
  type GeminiPart,
  type GeminiResponse,
} from "@/lib/ai/gemini-client";
import { OUTPUT_RATIOS, type OutputRatio } from "@/lib/constants";
import { enrichedPromptSchema, type BrandContext } from "@/lib/validations/generations";

/* -------------------------------------------------------------------------- */
/*  Tipos                                                                       */
/* -------------------------------------------------------------------------- */

export type GenerateOnServerInput = {
  productImages: string[];   // URLs http(s) de Storage
  referenceImages: string[]; // URLs http(s) de Storage (puede venir vacío)
  ratio: OutputRatio;
  variations: number;
  userPrompt?: string;
  styleFragment?: string;
  brand?: BrandContext;
};

export type GeneratedImageBuffer = {
  buffer: Buffer;
  contentType: "image/jpeg";
};

export type GenerateOnServerResult =
  | {
      ok: true;
      images: GeneratedImageBuffer[];
      failures: GeminiError[];
      finalPrompt: string;
    }
  | { ok: false; error: GeminiError };

/* -------------------------------------------------------------------------- */
/*  Entry point                                                                 */
/* -------------------------------------------------------------------------- */

export async function generateOnServer(
  input: GenerateOnServerInput,
): Promise<GenerateOnServerResult> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    return {
      ok: false,
      error: {
        kind: "missing_key",
      },
    };
  }

  const { productImages, referenceImages, ratio, userPrompt, styleFragment, brand } =
    input;
  const variations = Math.max(1, input.variations);

  // 1. Imágenes (producto + refs) → inlineData base64 (server-safe).
  let productParts: GeminiPart[];
  let referenceParts: GeminiPart[];
  try {
    [productParts, referenceParts] = await Promise.all([
      urlsToParts(productImages),
      urlsToParts(referenceImages),
    ]);
  } catch (err) {
    return {
      ok: false,
      error: {
        kind: "unknown",
        message:
          err instanceof Error
            ? `No pudimos leer las imágenes: ${err.message}`
            : "No pudimos leer las imágenes.",
      },
    };
  }

  // 2. El Director (best-effort). Si falla, fallback a userPrompt/genérico.
  let basePrompt: string;
  try {
    basePrompt = await enrichPromptServer({
      apiKey,
      productImages,
      referenceImages,
      ratio,
      userPrompt,
      brand,
    });
  } catch {
    basePrompt =
      userPrompt && userPrompt.trim().length > 0
        ? userPrompt
        : `Generate a professional commercial product photo, ${ratio} aspect ratio.`;
  }

  // 3. Armado del prompt final (mismo patrón que el browser).
  const stylePart =
    styleFragment && styleFragment.trim().length > 0
      ? `\n\nStyle direction: ${styleFragment.trim()}`
      : "";
  const productCount = productImages.length;
  const refCount = referenceImages.length;
  // El prompt se adapta a si hay o no referencias de estilo. Sin refs, no
  // mencionamos imagenes inexistentes (confunde al modelo): solo describimos el
  // producto y blindamos su identidad.
  const rolePrefix =
    refCount > 0
      ? `The first ${productCount} image(s) show the PRODUCT — preserve EXACTLY: same shape, same color, same label, same proportions. The remaining ${refCount} image(s) are STYLE references only — extract aesthetic (lighting, mood, palette, composition) but DO NOT copy their content or their products.`
      : `The ${productCount} attached image(s) show the PRODUCT — preserve EXACTLY: same shape, same color, same label, same proportions. Recreate it as a polished commercial photograph; do not alter the product itself.`;
  const ratioInstruction = buildRatioInstruction(ratio);
  const identityGuard =
    refCount > 0
      ? `\n\nPRESERVE EXACTLY THE PRODUCT SHOWN IN THE FIRST REFERENCE IMAGE: same shape, same colors, same packaging, same label text, same proportions. THE STYLE REFERENCES CONTRIBUTE AESTHETIC ONLY — THEY MUST NEVER REPLACE OR ALTER THE PRODUCT ITSELF.`
      : `\n\nPRESERVE EXACTLY THE PRODUCT SHOWN IN THE ATTACHED IMAGE(S): same shape, same colors, same packaging, same label text, same proportions. Only the scene, lighting and styling may change — THE PRODUCT ITSELF MUST NEVER BE REPLACED OR ALTERED.`;

  const finalPrompt = `${rolePrefix}

${basePrompt}${stylePart}

${ratioInstruction}

Produce one photorealistic, studio-grade commercial image.${identityGuard}`;

  // 4. contents iguales en todas las llamadas.
  const contents: GeminiContent[] = [
    {
      role: "user",
      parts: [...productParts, ...referenceParts, { text: finalPrompt }],
    },
  ];

  // 5. N llamadas en paralelo, Promise.allSettled.
  const calls = Array.from({ length: variations }, async () => {
    const result = await callGemini({
      apiKey,
      model: GEMINI_IMAGE_MODEL,
      contents,
      generationConfig: { responseModalities: ["IMAGE"] },
    });
    if (!result.ok) throw result.error;
    return extractImageBase64(result.response);
  });

  const settled = await Promise.allSettled(calls);

  const rawImages: { mime: string; data: string }[] = [];
  const failures: GeminiError[] = [];
  for (const item of settled) {
    if (item.status === "fulfilled") rawImages.push(item.value);
    else failures.push(normalizeError(item.reason));
  }

  if (rawImages.length === 0) {
    return {
      ok: false,
      error: failures[0] ?? { kind: "unknown", message: "Sin imágenes." },
    };
  }

  // 6. Enforce de aspect ratio con sharp → JPEG. Degradación graceful: si
  //    sharp falla en una, la salteamos (no rompe la tanda).
  const images: GeneratedImageBuffer[] = [];
  for (const raw of rawImages) {
    try {
      const input = Buffer.from(raw.data, "base64");
      const out = await enforceRatioServer(input, ratio);
      images.push({ buffer: out, contentType: "image/jpeg" });
    } catch {
      // Si el enforce falla, intentamos al menos re-encodear a JPEG plano.
      try {
        const input = Buffer.from(raw.data, "base64");
        const jpeg = await sharp(input).jpeg({ quality: 92 }).toBuffer();
        images.push({ buffer: jpeg, contentType: "image/jpeg" });
      } catch {
        // imagen perdida — la contamos como fallo silencioso.
        failures.push({ kind: "unknown", message: "Post-proceso falló." });
      }
    }
  }

  if (images.length === 0) {
    return {
      ok: false,
      error: { kind: "unknown", message: "Todas las imágenes fallaron en post-proceso." },
    };
  }

  return { ok: true, images, failures, finalPrompt };
}

/* -------------------------------------------------------------------------- */
/*  El Director (server-side)                                                   */
/* -------------------------------------------------------------------------- */

const DIRECTOR_SYSTEM_PROMPT = `Sos el Director de Arte de Vendi, un servicio que genera imagenes de producto para ecommerce y publicidad PYME.

Tu trabajo: mirar las fotos del producto del usuario, las imagenes de referencia visual que mostro, el ratio de salida y (opcionalmente) instrucciones extras, y devolver un brief enriquecido en JSON estricto.

Devolves SIEMPRE un JSON con esta forma exacta:
{
  "scene_description": "descripcion detallada de la escena que queres crear",
  "lighting": "tipo de iluminacion (calida/fria, direccion, intensidad)",
  "composition": "regla de tercios, simetria, profundidad, framing",
  "mood": "emocion o sensacion principal",
  "props": ["array", "de", "props", "relevantes"],
  "color_palette": ["#hex1", "#hex2", "#hex3"],
  "camera_angle": "angulo/perspectiva (eye-level, low-angle, top-down, etc.)",
  "final_prompt": "prompt final consolidado, 80-150 palabras, en INGLES, listo para Gemini Nano Banana"
}

Reglas duras:
- final_prompt SIEMPRE en ingles.
- final_prompt debe describir: objeto principal, escena, iluminacion, mood, paleta, angulo.
- NO incluyas marcas registradas ajenas.
- PRESERVA siempre la identidad del producto del usuario: forma, color, etiqueta, proporciones.
- Si las referencias visuales chocan con el producto, priorizas el producto y adaptas el estilo.
- Las referencias contribuyen mood/luz/paleta — NUNCA reemplazan al producto.
- Si te dan CONTEXTO DE MARCA (nombre, rubro, descripcion), usalo para que la escena, el mood y la paleta sean COHERENTES con esa identidad. NO inventes logos ni texto de marca dentro de la imagen.
- NO devuelvas texto fuera del JSON. NO uses code fences.`;

async function enrichPromptServer(input: {
  apiKey: string;
  productImages: string[];
  referenceImages: string[];
  ratio: string;
  userPrompt?: string;
  brand?: BrandContext;
}): Promise<string> {
  const [productParts, referenceParts] = await Promise.all([
    urlsToParts(input.productImages),
    urlsToParts(input.referenceImages),
  ]);

  const userMessage = `${buildBrandBlock(input.brand)}Producto del usuario: ${input.productImages.length} foto(s) (las primeras imagenes adjuntas).
Referencias visuales: ${input.referenceImages.length} imagen(es) (despues del producto).
Ratio de salida: ${input.ratio}
${input.userPrompt ? `\nInstrucciones extra del usuario:\n${input.userPrompt}` : ""}

Devolve SOLO el JSON estructurado, sin texto adicional ni markdown.`;

  const contents: GeminiContent[] = [
    {
      role: "user",
      parts: [...productParts, ...referenceParts, { text: userMessage }],
    },
  ];

  const result = await callGemini({
    apiKey: input.apiKey,
    model: GEMINI_REASONING_MODEL,
    contents,
    systemInstruction: { parts: [{ text: DIRECTOR_SYSTEM_PROMPT }] },
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.6,
    },
    timeoutMs: 45_000,
  });

  if (!result.ok) {
    throw new Error(`Director falló: ${result.error.kind}`);
  }

  const parts = result.response.candidates?.[0]?.content?.parts ?? [];
  const textPart = parts.find((p) => "text" in p && typeof p.text === "string");
  if (!textPart || !("text" in textPart) || !textPart.text) {
    throw new Error("El Director no devolvió texto.");
  }

  const parsed = enrichedPromptSchema.parse(JSON.parse(stripCodeFences(textPart.text)));
  return parsed.final_prompt;
}

/* -------------------------------------------------------------------------- */
/*  Helpers server-side                                                         */
/* -------------------------------------------------------------------------- */

/** fetch de URL http(s) → inlineData base64. Server-safe (Buffer, no FileReader). */
async function urlsToParts(urls: string[]): Promise<GeminiPart[]> {
  const out: GeminiPart[] = [];
  for (const url of urls) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} al leer imagen`);
    const arrayBuffer = await res.arrayBuffer();
    const mime = res.headers.get("content-type") || "image/png";
    const data = Buffer.from(arrayBuffer).toString("base64");
    out.push({ inlineData: { mimeType: mime, data } });
  }
  return out;
}

function extractImageBase64(response: GeminiResponse): { mime: string; data: string } {
  const candidate = response.candidates?.[0];
  if (!candidate) {
    throw { kind: "unknown", message: "Gemini no devolvió candidatos." } as GeminiError;
  }
  if (
    candidate.finishReason === "SAFETY" ||
    candidate.finishReason === "PROHIBITED_CONTENT" ||
    candidate.finishReason === "BLOCKLIST" ||
    candidate.finishReason === "SPII" ||
    candidate.finishReason === "IMAGE_SAFETY"
  ) {
    throw { kind: "content_blocked", reason: candidate.finishReason } as GeminiError;
  }
  const parts = candidate.content?.parts ?? [];
  for (const part of parts) {
    if ("inlineData" in part && part.inlineData?.data) {
      return {
        mime: part.inlineData.mimeType ?? "image/png",
        data: part.inlineData.data,
      };
    }
  }
  throw { kind: "unknown", message: "Gemini no devolvió imagen." } as GeminiError;
}

function normalizeError(err: unknown): GeminiError {
  if (err && typeof err === "object" && "kind" in err) {
    return err as GeminiError;
  }
  if (err instanceof Error) {
    return { kind: "unknown", message: err.message };
  }
  return { kind: "unknown", message: String(err) };
}

function buildRatioInstruction(ratio: string): string {
  const label = OUTPUT_RATIOS.find((r) => r.value === ratio)?.label ?? ratio;
  return `Aspect ratio: ${ratio} (${label}). Frame the composition to match this aspect ratio exactly.`;
}

/**
 * Arma el bloque de contexto de marca que se antepone al mensaje del Director.
 * Devuelve "" si no hay datos de marca útiles, para no ensuciar el prompt.
 */
function buildBrandBlock(brand?: BrandContext): string {
  if (!brand) return "";
  const name = brand.name?.trim();
  const industry = brand.industry?.trim();
  const description = brand.description?.trim();
  if (!name && !industry && !description) return "";

  const parts: string[] = ["Contexto de marca del usuario:"];
  if (name) parts.push(`- Nombre: ${name}`);
  if (industry) parts.push(`- Rubro: ${industry}`);
  if (description) parts.push(`- Descripcion: ${description}`);
  parts.push(
    "Usa este contexto para que la escena, el mood y la paleta sean coherentes con la identidad de la marca (sin inventar logos ni texto de marca en la imagen).",
  );
  return parts.join("\n") + "\n\n";
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

/* -------------------------------------------------------------------------- */
/*  Aspect ratio enforce (sharp, server-side)                                   */
/* -------------------------------------------------------------------------- */

const RATIO_TARGETS: Record<OutputRatio, { w: number; h: number }> = {
  "1:1": { w: 1024, h: 1024 },
  "4:5": { w: 1024, h: 1280 },
  "9:16": { w: 1080, h: 1920 },
  "16:9": { w: 1920, h: 1080 },
};

/**
 * Cover-crop a las dimensiones exactas del ratio con sharp (equivalente server
 * del Canvas browser). `fit: "cover"` escala para llenar y recorta el exceso
 * centrado. Salida JPEG 92%.
 */
async function enforceRatioServer(input: Buffer, ratio: OutputRatio): Promise<Buffer> {
  const target = RATIO_TARGETS[ratio];
  if (!target) {
    return sharp(input).jpeg({ quality: 92 }).toBuffer();
  }
  return sharp(input)
    .resize(target.w, target.h, { fit: "cover", position: "centre" })
    .jpeg({ quality: 92 })
    .toBuffer();
}
