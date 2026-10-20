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
  pickBatchError,
  reportAiOutage,
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
  /**
   * Prompt ESTRICTO del usuario (regeneración por imagen). Cuando viene
   * no-vacío, es AUTORITATIVO: se saltea El Director y el texto del usuario pasa
   * a ser la especificación que manda. Se MANTIENEN el producto, las referencias
   * de escena y el estilo elegido; el texto del usuario se cumple al pie de la
   * letra y GANA sobre estilo/referencias solo donde haya conflicto. La identidad
   * del producto se sigue blindando. El objetivo es cumplir su especificación al
   * ~99.9% sin que el modelo la reinterprete ni alucine.
   */
  strictPrompt?: string;
  /**
   * Fotos del producto YA bajadas (`prepareProductParts`). La ruta las baja
   * ANTES de cobrar: si alguna no se puede leer, corta sin descontar nada. Si no
   * vienen, se bajan acá (comportamiento de antes).
   */
  productParts?: GeminiPart[];
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
    const error: GeminiError = { kind: "missing_key" };
    await reportAiOutage(error);
    return { ok: false, error };
  }

  const { productImages, referenceImages, ratio, userPrompt, styleFragment, brand } =
    input;
  const variations = Math.max(1, input.variations);

  // Modo ESTRICTO: si el usuario mandó un prompt propio, es AUTORITATIVO. Se
  // saltea El Director, pero se MANTIENEN el producto, las referencias de escena
  // y el estilo elegido: el texto del usuario se cumple al pie de la letra y gana
  // sobre estilo/referencias solo donde haya conflicto. La identidad del producto
  // queda blindada siempre.
  const strictPrompt = input.strictPrompt?.trim();
  const isStrict = !!strictPrompt && strictPrompt.length > 0;

  // 1. Imágenes → inlineData base64 (server-safe). Producto + referencias en
  //    AMBOS modos (en estricto las refs quedan disponibles para que el prompt
  //    del usuario las dirija).
  // Las fotos del PRODUCTO son obligatorias: sin ellas no hay nada que
  // fotografiar y abortar es lo correcto. Las REFERENCIAS son opcionales por
  // diseño (una versión puede generar con estilo solo, o sin nada), así que una
  // referencia ilegible se saltea en vez de tumbar la tanda entera — que es lo
  // que hacía antes, con un `Promise.all` que moría en el primer error.
  //
  // No es teórico: las URLs firmadas que guardamos duran un año, y basta que el
  // usuario borre un archivo del bucket para dejar una versión imposible de
  // generar, con un mensaje genérico que no dice cuál imagen es la del problema.
  // Dos pasos más abajo, el post-proceso con sharp ya usa este mismo criterio:
  // si una imagen falla, la saltea y sigue.
  let productParts: GeminiPart[];
  if (input.productParts && input.productParts.length > 0) {
    productParts = input.productParts;
  } else {
    try {
      productParts = await urlsToParts(productImages);
    } catch (err) {
      return {
        ok: false,
        error: {
          kind: "unknown",
          message:
            err instanceof Error
              ? `No pudimos leer las fotos del producto: ${err.message}`
              : "No pudimos leer las fotos del producto.",
        },
      };
    }
  }
  const referenceParts = await urlsToPartsBestEffort(referenceImages);

  // 2. El Director (best-effort). Si falla, fallback a userPrompt/genérico.
  //    En modo ESTRICTO no corre: el texto del usuario ES el prompt base.
  let basePrompt: string;
  if (isStrict) {
    basePrompt = strictPrompt!;
  } else {
    try {
      basePrompt = await enrichPromptServer({
        apiKey,
        productParts,
        productImages,
        referenceImages,
        ratio,
        userPrompt,
        brand,
      });
    } catch (err) {
      // Sin saldo en Google: las N llamadas de imagen van a fallar igual. Se
      // corta acá (la ruta devuelve y avisa) en vez de mandarlas.
      //
      // Solo `billing`, como en producción. Cualquier otra falla del Director
      // sigue con el prompt de respaldo: el Director usa OTRO modelo
      // (GEMINI_REASONING_MODEL) que las imágenes, así que un 404 o un 403 suyo
      // no prueba que la generación vaya a fallar. Si la key de verdad está
      // mala, las llamadas de imagen fallan solas y `pickBatchError` le pasa la
      // caída a la ruta (que devuelve y avisa igual).
      const cause = err instanceof Error ? (err.cause as GeminiError | undefined) : undefined;
      if (cause?.kind === "billing") {
        return { ok: false, error: cause };
      }
      if (cause?.kind === "model_not_found") {
        // El Director no marca la IA como caída por esto (`reportModelNotFound:
        // false` abajo): queda este rastro para que se cambie el modelo.
        console.error(
          "[director] modelo inexistente, sigue con el prompt de respaldo:",
          cause.model ?? GEMINI_REASONING_MODEL,
        );
      }
      basePrompt =
        userPrompt && userPrompt.trim().length > 0
          ? userPrompt
          : `Generate a professional commercial product photo, ${ratio} aspect ratio.`;
    }
  }

  // 3. Armado del prompt final (mismo patrón que el browser). En estricto se
  //    MANTIENE el estilo elegido (el texto del usuario gana solo en conflicto).
  const stylePart =
    styleFragment && styleFragment.trim().length > 0
      ? `\n\nStyle direction: ${styleFragment.trim()}`
      : "";
  const productCount = productImages.length;
  // Contamos las referencias que REALMENTE viajan, no las que pidió la versión:
  // si alguna se salteó por ilegible, decirle a Gemini que hay 3 cuando le
  // mandamos 2 le hace buscar una imagen que no existe.
  const refCount = referenceParts.length;
  // El prompt se adapta a si hay o no referencias. Sin refs, no mencionamos
  // imagenes inexistentes (confunde al modelo): solo describimos el producto y
  // blindamos su identidad. En estricto las refs son "de escena" (el usuario
  // dirige cómo usarlas); en normal son "solo estilo" (no se copia su contenido).
  const rolePrefix = isStrict
    ? refCount > 0
      ? `The first ${productCount} image(s) are the USER'S PRODUCT — preserve its identity EXACTLY: same shape, same color, same label and label text, same proportions. The remaining ${refCount} image(s) are SCENE references: use them for scene, setting and context as the user specification directs — you MAY use and combine their content with the product.`
      : `The ${productCount} attached image(s) are the USER'S PRODUCT — preserve its identity EXACTLY: same shape, same color, same label and label text, same proportions.`
    : refCount > 0
      ? `The first ${productCount} image(s) show the PRODUCT — preserve EXACTLY: same shape, same color, same label, same proportions. The remaining ${refCount} image(s) are STYLE references only — extract aesthetic (lighting, mood, palette, composition) but DO NOT copy their content or their products.`
      : `The ${productCount} attached image(s) show the PRODUCT — preserve EXACTLY: same shape, same color, same label, same proportions. Recreate it as a polished commercial photograph; do not alter the product itself.`;
  const ratioInstruction = buildRatioInstruction(ratio);
  const identityGuard = isStrict
    ? `\n\nHARD CONSTRAINT (never override): the USER'S PRODUCT shown in the product image(s) must keep its exact identity — same shape, same colors, same packaging, same label text, same proportions. The specification, the style and the references may restage, recombine or recontextualize the product, but must NEVER replace, redraw or distort the product itself.`
    : refCount > 0
      ? `\n\nPRESERVE EXACTLY THE PRODUCT SHOWN IN THE FIRST REFERENCE IMAGE: same shape, same colors, same packaging, same label text, same proportions. THE STYLE REFERENCES CONTRIBUTE AESTHETIC ONLY — THEY MUST NEVER REPLACE OR ALTER THE PRODUCT ITSELF.`
      : `\n\nPRESERVE EXACTLY THE PRODUCT SHOWN IN THE ATTACHED IMAGE(S): same shape, same colors, same packaging, same label text, same proportions. Only the scene, lighting and styling may change — THE PRODUCT ITSELF MUST NEVER BE REPLACED OR ALTERED.`;

  // En estricto, el texto del usuario es una ESPECIFICACIÓN autoritativa: hay
  // que cumplirla al pie de la letra, sin reinterpretar ni agregar cosas que no
  // pidió (anti-alucinación), completando solo detalles menores no especificados.
  const finalPrompt = isStrict
    ? `${rolePrefix}${stylePart}

USER SPECIFICATION — AUTHORITATIVE. Follow it EXACTLY and completely; it takes absolute priority over the style direction and the references wherever they conflict with it. Do NOT reinterpret, soften, or add elements, objects, text, or brands that were not requested. Only fill in unspecified minor details with neutral, sensible choices:

${basePrompt}

${ratioInstruction}

Produce one photorealistic, studio-grade commercial image that satisfies the user specification above as literally as possible, honoring the chosen style and the scene references where they do not conflict with it.${identityGuard}`
    : `${rolePrefix}

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
      // En estricto bajamos la temperatura: menos "creatividad" = más apego
      // literal a la especificación del usuario y menos alucinación.
      generationConfig: {
        responseModalities: ["IMAGE"],
        ...(isStrict ? { temperature: 0.2 } : {}),
      },
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
    // No solo `failures[0]`: una caída de la IA o un bloqueo de la entrada en
    // TODAS definen qué se le dice al cliente y si se devuelve (Hawkeye).
    return { ok: false, error: pickBatchError(failures) };
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
        // La imagen ya está pagada: si el modelo la mandó en JPEG, sirve tal
        // cual (sin el recorte exacto) antes que tirarla. Si no, la contamos
        // como fallo (la ruta la devuelve como no entregada).
        if (/^image\/jpe?g$/i.test(raw.mime)) {
          images.push({ buffer: Buffer.from(raw.data, "base64"), contentType: "image/jpeg" });
        } else {
          failures.push({ kind: "unknown", message: "Post-proceso falló." });
        }
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
  /** Las mismas fotos ya bajadas para la generación (no se bajan dos veces). */
  productParts: GeminiPart[];
  productImages: string[];
  referenceImages: string[];
  ratio: string;
  userPrompt?: string;
  brand?: BrandContext;
}): Promise<string> {
  // El producto llega YA bajado (las mismas partes de la generación: si no se
  // podía leer, generateOnServer cortó antes de llamar acá), así que no se baja
  // dos veces. Las referencias van best-effort, igual que en la generación.
  // Antes una referencia rota tiraba el Director entero y se perdía la
  // dirección de arte sin que nadie se enterara.
  const productParts = input.productParts;
  const referenceParts = await urlsToPartsBestEffort(input.referenceImages);

  const userMessage = `${buildBrandBlock(input.brand)}Producto del usuario: ${input.productImages.length} foto(s) (las primeras imagenes adjuntas).
Referencias visuales: ${referenceParts.length} imagen(es) (despues del producto).
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
    // Un 404 del modelo del Director NO es caída de la IA: la tanda sigue con
    // el prompt de respaldo y las imágenes usan otro modelo. Si se marcara, la
    // prueba de ai-gate (que revisa ESTE modelo) nunca la levantaría y se
    // frenarían todas las tandas. Sin saldo y key mala se marcan igual.
    reportModelNotFound: false,
  });

  if (!result.ok) {
    // `cause` lleva el error tipado: el caller distingue "sin saldo" (corta la
    // tanda) de cualquier otra falla (sigue con el prompt de respaldo).
    throw new Error(`Director falló: ${result.error.kind}`, { cause: result.error });
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

/**
 * Igual que `urlsToParts` pero TOLERANTE: la imagen que no se pueda leer se
 * saltea y devolvemos las que sí. Para las REFERENCIAS, que son opcionales:
 * perder una inspiración es molesto, perder la tanda entera es un bug.
 */
async function urlsToPartsBestEffort(urls: string[]): Promise<GeminiPart[]> {
  const out: GeminiPart[] = [];
  for (const url of urls) {
    try {
      const [part] = await urlsToParts([url]);
      if (part) out.push(part);
    } catch (err) {
      // Sin throw: dejamos rastro en los logs de la función y seguimos.
      console.error(
        "Referencia ilegible, se saltea:",
        err instanceof Error ? err.message : err,
      );
    }
  }
  return out;
}

/** finishReason que son bloqueo de contenido sobre la SALIDA (cortan siempre, como antes). */
const OUTPUT_BLOCK_REASONS = new Set([
  "SAFETY",
  "PROHIBITED_CONTENT",
  "BLOCKLIST",
  "SPII",
  "IMAGE_SAFETY",
]);

/**
 * Bloqueos de la SALIDA que antes caían como "no devolvió imagen". Solo cuentan
 * como bloqueo si de verdad no vino imagen: si vino, se entrega igual que antes.
 */
const OUTPUT_BLOCK_REASONS_IF_NO_IMAGE = new Set([
  "RECITATION",
  "IMAGE_PROHIBITED_CONTENT",
  "IMAGE_RECITATION",
]);

/**
 * Baja las fotos del PRODUCTO (obligatorias) para mandarlas a Gemini. La ruta
 * la llama ANTES de cobrar: si alguna no se puede leer, corta con «No pudimos
 * usar estas fotos… No se te descontó nada» sin tocar créditos.
 */
export async function prepareProductParts(
  urls: string[],
): Promise<{ ok: true; parts: GeminiPart[] } | { ok: false; error: string }> {
  try {
    const parts = await urlsToParts(urls);
    return parts.length > 0 ? { ok: true, parts } : { ok: false, error: "sin fotos" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function extractImageBase64(response: GeminiResponse): { mime: string; data: string } {
  const candidate = response.candidates?.[0];
  if (!candidate) {
    throw { kind: "unknown", message: "Gemini no devolvió candidatos." } as GeminiError;
  }
  // Bloqueo de la SALIDA: la culpa no es clara (pudo ser la foto o el modelo),
  // así que se devuelve (cuánto, lo decide la ruta). El de la ENTRADA
  // (promptFeedback) lo separa callGemini.
  if (candidate.finishReason && OUTPUT_BLOCK_REASONS.has(candidate.finishReason)) {
    throw {
      kind: "content_blocked",
      reason: candidate.finishReason,
      stage: "output",
    } satisfies GeminiError;
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
  if (candidate.finishReason && OUTPUT_BLOCK_REASONS_IF_NO_IMAGE.has(candidate.finishReason)) {
    throw {
      kind: "content_blocked",
      reason: candidate.finishReason,
      stage: "output",
    } satisfies GeminiError;
  }
  // Sin imagen y sin bloqueo (NO_IMAGE, IMAGE_OTHER, texto en vez de imagen):
  // se devuelve igual; el finishReason queda para Paolo.
  throw {
    kind: "unknown",
    message: `Gemini no devolvió imagen (finishReason ${candidate.finishReason ?? "?"}).`,
  } satisfies GeminiError;
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

// Exportados (sin cambiar lógica) para que el pipeline v2 (lib/ai/v2/) reuse el
// MISMO post-proceso en vez de importar sharp por segunda vez.
export const RATIO_TARGETS: Record<OutputRatio, { w: number; h: number }> = {
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
export async function enforceRatioServer(input: Buffer, ratio: OutputRatio): Promise<Buffer> {
  const target = RATIO_TARGETS[ratio];
  if (!target) {
    return sharp(input).jpeg({ quality: 92 }).toBuffer();
  }
  return sharp(input)
    .resize(target.w, target.h, { fit: "cover", position: "centre" })
    .jpeg({ quality: 92 })
    .toBuffer();
}
