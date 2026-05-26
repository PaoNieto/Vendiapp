/**
 * Image generator — BYOK Gemini (Nano Banana / `gemini-2.5-flash-image`).
 *
 * Llama al modelo de imagen N veces en paralelo (`variations_default`) con las
 * mismas inputs (producto + referencias + prompt) y combina los resultados.
 * Cada llamada devuelve UNA imagen por candidato; si necesitás 5, hacés 5
 * fetches en paralelo y consolidás con `Promise.allSettled` para que un único
 * fallo no tire toda la tanda.
 *
 * La key vive en el cliente (`useNegocio()` → localStorage). Este módulo NO
 * tiene acceso a ENV vars del server — se ejecuta en el browser.
 *
 * Limitaciones conocidas:
 * - La API de Gemini Image actual devuelve **1 imagen por llamada**. Si en el
 *   futuro acepta `candidateCount > 1`, podríamos hacer 1 call con N candidatos
 *   y ahorrar latencia.
 * - El ratio (1:1, 4:5, 9:16, 16:9) NO es un parámetro estructurado de
 *   `generateContent` — lo pasamos textual dentro del prompt. La doc oficial
 *   recomienda este enfoque mientras no exista soporte first-class.
 * - No comprimimos imágenes antes de mandar — pasamos el base64 tal cual el
 *   uploader nos lo dio. Si el usuario sube fotos >5MB esto puede ser lento.
 *   TODO: re-encode a JPEG 85% antes de mandar para bajar payload.
 */

import {
  callGemini,
  GEMINI_IMAGE_MODEL,
  type GeminiContent,
  type GeminiError,
  type GeminiPart,
  type GeminiResponse,
} from "@/lib/ai/gemini-client";
import { OUTPUT_RATIOS, type OutputRatio } from "@/lib/constants";
import { buildPromptFromBrief } from "@/lib/recorrido/build-prompt";
import type { Product } from "@/lib/products/store";
import type { Version } from "@/lib/versions/store";

export type GenerateImagesInput = {
  apiKey: string;
  product: Product;
  version: Version;
  /**
   * Fragmento de estilo (en ingles) inyectado al prompt. Viene del catalogo
   * `lib/styles.ts` segun lo que el usuario eligio en la estacion Estilo.
   * Opcional: si no hay estilo elegido, no se inyecta nada.
   */
  styleFragment?: string;
};

/**
 * Misma forma que `GeminiError`. Lo re-exportamos como `GenerationError` para
 * que la UI no tenga que importar del cliente de bajo nivel — todo lo que
 * necesita el caller vive acá.
 */
export type GenerationError = GeminiError;

export type GenerateImagesResult =
  | {
      ok: true;
      images: string[];
      /**
       * Errores parciales: variaciones que fallaron mientras OTRAS exitosas
       * llegaron a `images`. La UI puede mostrar "te traje 3 de 5, fallaron 2"
       * con el detalle. Vacio cuando todas las variaciones salieron OK.
       */
      failures: GenerationError[];
      /**
       * Prompt final que se le mando a Nano Banana (en ingles, con role split
       * + style fragment + identity guard ya consolidados). El caller lo
       * persiste como `strict_prompt` de cada imagen para que el modo estricto
       * post-gen tenga base editable. Tambien sirve para trazabilidad.
       */
      finalPrompt: string;
    }
  | { ok: false; error: GenerationError };

/* -------------------------------------------------------------------------- */
/*  Entry point                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Construye prompt + inputs, dispara N llamadas y devuelve dataURLs base64
 * listas para guardar en el store (`attachImages`).
 *
 * Política de errores:
 *  - Si TODAS las variaciones fallan → devolvemos el primer error.
 *  - Si al menos una sale OK → devolvemos `ok: true` con las que llegaron.
 *    Mejor UX: "te traje 3 de 5" que "fallé todo, volvé a intentar".
 */
export async function generateImages(
  input: GenerateImagesInput,
): Promise<GenerateImagesResult> {
  if (!input.apiKey || input.apiKey.trim().length === 0) {
    return { ok: false, error: { kind: "missing_key" } };
  }

  const { apiKey, product, version, styleFragment } = input;
  const variations = Math.max(1, version.variations_default);

  // 1. Normalizamos las imágenes (producto + refs) a `GeminiPart[]` base64.
  //    Cada URL del store puede ser: dataURI (base64 listo), objectURL
  //    (blob:), o URL remota. `fetch()` resuelve los tres en navegadores
  //    modernos, así que no hace falta rama-ear por scheme.
  let productParts: GeminiPart[];
  let referenceParts: GeminiPart[];
  try {
    [productParts, referenceParts] = await Promise.all([
      imagesToParts(product.product_images),
      imagesToParts(version.reference_images),
    ]);
  } catch (err) {
    // Lectura local de imágenes falló — no es error de Gemini, es del browser.
    return {
      ok: false,
      error: {
        kind: "unknown",
        message:
          err instanceof Error
            ? `No pudimos leer tus imágenes: ${err.message}`
            : "No pudimos leer tus imágenes.",
      },
    };
  }

  // 2. Prompt final con instrucción de ratio embebida. Gemini Image todavía
  //    no acepta ratio como parámetro estructurado del request.
  const basePrompt =
    version.user_prompt.trim().length > 0
      ? version.user_prompt
      : buildPromptFromBrief(version);
  const ratioInstruction = buildRatioInstruction(version.output_ratio);

  // Fragmento de estilo opcional. Se inyecta DESPUES del basePrompt y ANTES
  // del identity guard para que el modelo lea: "quiero esto (brief) en este
  // estilo (style fragment), respetando estas reglas (identity + role split)".
  const stylePart =
    styleFragment && styleFragment.trim().length > 0
      ? `\n\nStyle direction: ${styleFragment.trim()}`
      : "";

  // Role split EXPLICITO al principio: cual imagen es PRODUCTO (preservar)
  // y cuales son SOLO referencia de estetica (no copiar contenido).
  // Patron tomado de purrtraits — sin esto, Nano Banana mezcla contenidos.
  const productCount = product.product_images?.length ?? 0;
  const refCount = version.reference_images?.length ?? 0;
  const rolePrefix = `The first ${productCount} image(s) show the PRODUCT — preserve EXACTLY: same shape, same color, same label, same proportions. The remaining ${refCount} image(s) are STYLE references only — extract aesthetic (lighting, mood, palette, composition) but DO NOT copy their content or their products.`;

  // Identity guard al FINAL en mayusculas para maxima prioridad al modelo.
  // Las reglas que aparecen ultimas tienden a pesar mas en Nano Banana.
  const identityGuard = `\n\nPRESERVE EXACTLY THE PRODUCT SHOWN IN THE FIRST REFERENCE IMAGE: same shape, same colors, same packaging, same label text, same proportions. THE STYLE REFERENCES CONTRIBUTE AESTHETIC ONLY — THEY MUST NEVER REPLACE OR ALTER THE PRODUCT ITSELF.`;

  const finalPrompt = `${rolePrefix}

${basePrompt}${stylePart}

${ratioInstruction}

Produce one photorealistic, studio-grade commercial image.${identityGuard}`;

  // 3. Armamos el `contents` que vamos a mandar (igual en todas las calls).
  //    Orden importante: producto PRIMERO (mayor peso), refs DESPUÉS, texto AL
  //    FINAL. Gemini suele tomar las últimas partes textuales como "lo que
  //    tiene que hacer", y las imágenes anteriores como referencia.
  const contents: GeminiContent[] = [
    {
      role: "user",
      parts: [
        ...productParts,
        ...referenceParts,
        { text: finalPrompt },
      ],
    },
  ];

  // 4. N llamadas en paralelo. `Promise.allSettled` para que una variación
  //    rota no tire la tanda entera.
  const calls = Array.from({ length: variations }, async () => {
    const result = await callGemini({
      apiKey,
      model: GEMINI_IMAGE_MODEL,
      contents,
      // El modelo de imagen requiere `responseModalities: ["IMAGE"]` para
      // forzar output de imagen. Si lo omitís, a veces devuelve texto.
      generationConfig: {
        responseModalities: ["IMAGE"],
      },
    });
    if (!result.ok) {
      throw result.error;
    }
    return extractImageDataUrl(result.response);
  });

  const settled = await Promise.allSettled(calls);

  const images: string[] = [];
  const errors: GenerationError[] = [];
  for (const item of settled) {
    if (item.status === "fulfilled") {
      images.push(item.value);
    } else {
      errors.push(normalizeError(item.reason));
    }
  }

  if (images.length === 0) {
    return {
      ok: false,
      error: errors[0] ?? { kind: "unknown", message: "Sin imágenes." },
    };
  }

  // Post-proceso: enforce de aspect ratio exacto con canvas. Nano Banana
  // usualmente respeta el ratio del prompt pero a veces se desvia 1-2 pixeles
  // y Meta Ads rechaza creatividades con ratio no exacto. Si el enforce falla
  // por cualquier motivo, conservamos el dataURL original (degradacion graceful).
  const enforced = await Promise.all(
    images.map((dataUrl) =>
      enforceAspectRatio(dataUrl, version.output_ratio).catch(() => dataUrl),
    ),
  );

  return { ok: true, images: enforced, failures: errors, finalPrompt };
}

/* -------------------------------------------------------------------------- */
/*  Image normalization                                                         */
/* -------------------------------------------------------------------------- */

async function imagesToParts(urls: string[]): Promise<GeminiPart[]> {
  const out: GeminiPart[] = [];
  for (const url of urls) {
    const { mime, data } = await urlToBase64(url);
    out.push({ inlineData: { mimeType: mime, data } });
  }
  return out;
}

/**
 * Lee una URL (dataURI, blob:, http) y devuelve `{ mime, data }` con `data`
 * como base64 puro (sin el prefijo `data:...;base64,`). Funciona en el
 * browser vía `fetch` + `FileReader`.
 */
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
      // FileReader devuelve `data:<mime>;base64,<payload>` — nos quedamos
      // sólo con el payload porque la API espera base64 puro en `inlineData.data`.
      const idx = result.indexOf("base64,");
      resolve(idx >= 0 ? result.slice(idx + "base64,".length) : result);
    };
    reader.readAsDataURL(blob);
  });
}

/* -------------------------------------------------------------------------- */
/*  Response parsing                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Saca la imagen del response de Gemini y devuelve un dataURL listo para usar.
 * Lanza un objeto `GeminiError` (no Error) cuando no hay imagen — el caller
 * (`generateImages`) cachea con `Promise.allSettled` y lo normaliza después.
 */
function extractImageDataUrl(response: GeminiResponse): string {
  const candidate = response.candidates?.[0];
  if (!candidate) {
    const err: GeminiError = {
      kind: "unknown",
      message: "Gemini no devolvió candidatos.",
    };
    throw err;
  }

  // Safety block a nivel candidato — el más común. Lo tratamos como
  // `content_blocked` para que la UI muestre copy específico de safety.
  if (
    candidate.finishReason === "SAFETY" ||
    candidate.finishReason === "PROHIBITED_CONTENT" ||
    candidate.finishReason === "BLOCKLIST" ||
    candidate.finishReason === "SPII" ||
    candidate.finishReason === "IMAGE_SAFETY"
  ) {
    const err: GeminiError = {
      kind: "content_blocked",
      reason: candidate.finishReason,
    };
    throw err;
  }

  const parts = candidate.content?.parts ?? [];
  for (const part of parts) {
    if ("inlineData" in part && part.inlineData?.data) {
      const mime = part.inlineData.mimeType ?? "image/png";
      return `data:${mime};base64,${part.inlineData.data}`;
    }
  }

  const err: GeminiError = {
    kind: "unknown",
    message: "Gemini no devolvió imagen en el candidato.",
  };
  throw err;
}

/* -------------------------------------------------------------------------- */
/*  Error normalization                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Acepta cualquier cosa que haya caído al `Promise.allSettled` y lo lleva a
 * `GenerationError`. Cubre:
 *  - `GeminiError` ya tipado (lo que tiramos desde `extractImageDataUrl` o lo
 *    que devuelve `callGemini` cuando `!ok`).
 *  - `Error` genérico — caemos a `unknown` con su `.message`.
 *  - `unknown` — lo serializamos a string como último recurso.
 */
function normalizeError(err: unknown): GenerationError {
  if (err && typeof err === "object" && "kind" in err) {
    return err as GenerationError;
  }
  if (err instanceof Error) {
    return { kind: "unknown", message: err.message };
  }
  return { kind: "unknown", message: String(err) };
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function buildRatioInstruction(ratio: string): string {
  const label = OUTPUT_RATIOS.find((r) => r.value === ratio)?.label ?? ratio;
  return `Aspect ratio: ${ratio} (${label}). Frame the composition to match this aspect ratio exactly.`;
}

/* -------------------------------------------------------------------------- */
/*  Aspect ratio enforcement (post-process via Canvas, browser-side)            */
/* -------------------------------------------------------------------------- */

/**
 * Dimensiones target por ratio. Pensado para ser un punto medio razonable
 * entre "calidad print/ad-ready" y "peso de archivo manejable en Storage".
 * Nano Banana suele devolver ~1024px en el lado largo, asi que usamos eso
 * como base y ajustamos el corto para que el ratio sea exacto.
 */
const RATIO_TARGETS: Record<OutputRatio, { w: number; h: number }> = {
  "1:1": { w: 1024, h: 1024 },
  "4:5": { w: 1024, h: 1280 },
  "9:16": { w: 1080, h: 1920 },
  "16:9": { w: 1920, h: 1080 },
};

/**
 * Toma un dataURL devuelto por Nano Banana y lo lleva a las dimensiones
 * exactas del ratio elegido usando un canvas con "cover crop" (escala para
 * fill, recorta el exceso desde el centro). Si la imagen ya esta dentro
 * de tolerancia (<1% de diferencia), devuelve el original sin tocar.
 *
 * Implementacion explicita en browser — `image-generator.ts` corre en cliente
 * (la API key vive en `useNegocio()`), asi que `sharp` (Node) no aplica.
 *
 * Devuelve JPEG 92% (suficiente para feed/ads, mucho mas liviano que el PNG
 * que devuelve Gemini). Si la operacion falla, el caller tiene un .catch que
 * conserva el dataURL original.
 */
async function enforceAspectRatio(
  dataUrl: string,
  ratio: OutputRatio,
): Promise<string> {
  const target = RATIO_TARGETS[ratio];
  if (!target) return dataUrl;

  // Cargamos el dataURL en un HTMLImageElement para poder dibujarlo.
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("No se pudo cargar la imagen para enforce ratio."));
    i.src = dataUrl;
  });

  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;
  if (srcW === 0 || srcH === 0) return dataUrl;

  const srcRatio = srcW / srcH;
  const targetRatio = target.w / target.h;

  // Si ya esta cerca del target (<1%), no hacemos nada — evita recompresion.
  if (Math.abs(srcRatio - targetRatio) < 0.01) {
    return dataUrl;
  }

  // Cover crop: calculamos rect de source que coincida con target ratio,
  // centrado. Si la imagen es mas ancha de lo necesario, croppeamos los lados.
  // Si es mas alta, croppeamos arriba/abajo.
  let sx = 0;
  let sy = 0;
  let sw = srcW;
  let sh = srcH;
  if (srcRatio > targetRatio) {
    sw = srcH * targetRatio;
    sx = (srcW - sw) / 2;
  } else {
    sh = srcW / targetRatio;
    sy = (srcH - sh) / 2;
  }

  const canvas = document.createElement("canvas");
  canvas.width = target.w;
  canvas.height = target.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;

  // Calidad de scaling. `imageSmoothingQuality: "high"` mejora notoriamente
  // el resultado cuando hay downscale fuerte (ej. 4096 -> 1024).
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, target.w, target.h);

  // JPEG 92% — calidad casi indistinguible para fotos, ~4-6x mas chico que PNG.
  return canvas.toDataURL("image/jpeg", 0.92);
}

/* -------------------------------------------------------------------------- */
/*  UI helper compartido                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Traduce un `GenerationError` a copy friendly en castellano para mostrar en
 * banners de UI. Se exporta acá para que `image-analyzer.ts` y las pantallas
 * la compartan sin duplicar strings.
 */
export function formatGenerationError(err: GenerationError): string {
  switch (err.kind) {
    case "missing_key":
      return "Falta API key — configurala en Mi Negocio.";
    case "invalid_key":
      return "Tu API key no es válida — revisala en Mi Negocio.";
    case "rate_limit":
      return err.retryAfterSec
        ? `Llegaste al límite de Gemini. Probá de nuevo en ~${err.retryAfterSec}s.`
        : "Llegaste al límite de Gemini. Esperá unos minutos.";
    case "content_blocked":
      return err.reason
        ? `Gemini bloqueó la generación por seguridad: ${err.reason}`
        : "Gemini bloqueó la generación por seguridad.";
    case "network":
      return "Sin conexión o Gemini no responde. Intentá de nuevo.";
    case "unknown":
      return err.message || "Error desconocido al generar.";
  }
}
