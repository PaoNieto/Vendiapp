/**
 * El Director — sintetizador de prompt enriquecido.
 *
 * Recibe las fotos del producto + referencias visuales + ratio + (opcional)
 * brief libre del usuario, y devuelve un JSON estructurado con la receta
 * fotografica + un `final_prompt` en ingles listo para mandar a Banano.
 *
 * Stack: Gemini Pro (BYOK — la API key vive en `useNegocio()` del cliente,
 * NO env vars). Antes usaba Claude via Anthropic SDK, se migro a Gemini para
 * unificar proveedor (una sola key del usuario para todo).
 *
 * Falla con throw — el caller (Banano = image-generator) tiene try/catch
 * que cae al fallback local (`buildPromptFromBrief`) si el Director rompe.
 */

import {
  callGemini,
  GEMINI_REASONING_MODEL,
  type GeminiContent,
  type GeminiPart,
} from "@/lib/ai/gemini-client";
import {
  enrichedPromptSchema,
  type EnrichedPrompt,
} from "@/lib/validations/generations";

const SYSTEM_PROMPT = `Sos el Director de Arte de Vendi, un servicio que genera imagenes de producto para ecommerce y publicidad PYME.

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
- final_prompt SIEMPRE en ingles (mejor performance del modelo de imagen).
- final_prompt debe describir: objeto principal, escena, iluminacion, mood, paleta, angulo.
- NO incluyas marcas registradas ajenas.
- PRESERVA siempre la identidad del producto del usuario: forma, color, etiqueta, proporciones.
- Si las referencias visuales chocan con el producto, priorizas el producto y adaptas el estilo.
- Las referencias contribuyen mood/luz/paleta — NUNCA reemplazan al producto.
- NO devuelvas texto fuera del JSON. NO uses code fences (sin \`\`\`).`;

export async function generateEnrichedPrompt(input: {
  apiKey: string;
  productImages: string[];
  referenceImages: string[];
  ratio: string;
  userPrompt?: string;
}): Promise<EnrichedPrompt> {
  if (!input.apiKey || input.apiKey.trim().length === 0) {
    throw new Error("Falta API key — configurala en Mi Negocio.");
  }

  // 1. Convertimos las URLs/dataURLs a `inlineData` base64 que Gemini espera.
  //    Mismo patron que image-generator.ts — duplicado intencional para no
  //    acoplar artefactos del flujo principal.
  const [productParts, referenceParts] = await Promise.all([
    imagesToParts(input.productImages),
    imagesToParts(input.referenceImages),
  ]);

  // 2. Mensaje de usuario en texto: contexto crudo + instruccion final.
  //    Las imagenes van como `inlineData` parts ANTES del texto para que
  //    Gemini las trate como input visual primario.
  const userMessage = `Producto del usuario: ${input.productImages.length} foto(s) (las primeras imagenes adjuntas).
Referencias visuales: ${input.referenceImages.length} imagen(es) (despues del producto).
Ratio de salida: ${input.ratio}
${input.userPrompt ? `\nInstrucciones extra del usuario:\n${input.userPrompt}` : ""}

Devolve SOLO el JSON estructurado, sin texto adicional ni markdown.`;

  const contents: GeminiContent[] = [
    {
      role: "user",
      parts: [
        ...productParts,
        ...referenceParts,
        { text: userMessage },
      ],
    },
  ];

  // 3. Llamada con responseMimeType JSON para forzar shape estricto. Temp
  //    baja porque queremos sintesis consistente, no creatividad random.
  const result = await callGemini({
    apiKey: input.apiKey,
    model: GEMINI_REASONING_MODEL,
    contents,
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.6,
    },
    timeoutMs: 45_000,
  });

  if (!result.ok) {
    throw new Error(
      `Director fallo: ${result.error.kind}` +
        ("message" in result.error ? ` - ${result.error.message}` : ""),
    );
  }

  // 4. Extraemos el texto del primer candidato.
  const parts = result.response.candidates?.[0]?.content?.parts ?? [];
  const textPart = parts.find((p) => "text" in p && typeof p.text === "string");
  if (!textPart || !("text" in textPart) || !textPart.text) {
    throw new Error("El Director no devolvio texto.");
  }

  // 5. Parseamos JSON. Por contrato con responseMimeType viene puro, pero
  //    defendemos por si el modelo se sale del schema.
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(stripCodeFences(textPart.text));
  } catch {
    throw new Error("Respuesta del Director no parseable como JSON.");
  }

  // 6. Validamos con Zod — si Gemini se sale del shape esperado, error explicito.
  return enrichedPromptSchema.parse(parsedJson);
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Convierte un array de URLs/dataURLs a `GeminiPart[]` con `inlineData` base64.
 * Funciona en el browser via `fetch` + `FileReader` (las URLs del store pueden
 * ser http(s), blob:, o data:).
 */
async function imagesToParts(urls: string[]): Promise<GeminiPart[]> {
  const out: GeminiPart[] = [];
  for (const url of urls) {
    const { mime, data } = await urlToBase64(url);
    out.push({ inlineData: { mimeType: mime, data } });
  }
  return out;
}

async function urlToBase64(
  url: string,
): Promise<{ mime: string; data: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} al leer imagen`);
  }
  const blob = await res.blob();
  const mime = blob.type || "image/png";
  const data = await blobToBase64(blob);
  return { mime, data };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Formato inesperado al leer la imagen."));
        return;
      }
      const idx = result.indexOf("base64,");
      resolve(idx >= 0 ? result.slice(idx + "base64,".length) : result);
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Defensa por si Gemini ignora `responseMimeType` y envuelve el JSON con
 * code fences \`\`\`json ... \`\`\`. Por contrato no deberia pasar pero pasa.
 */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}
