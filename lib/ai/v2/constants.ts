/**
 * Pipeline v2 de prompts — constantes, modelos y flag.
 *
 * La v2 separa lo que en v1 hacía UNA sola llamada (El Director mirando fotos y
 * escribiendo el prompt entero) en piezas con dueño único:
 *   - nota del PRODUCTO (qué es, cómo se ve)      → product-brief.ts
 *   - nota de cada REFERENCIA (qué se toma de ella) → reference-brief.ts
 *   - PLAN del Director (dónde va y qué lo rodea)  → director.ts, SIN imágenes
 *   - ENSAMBLADO del prompt final                  → assemble.ts, lo escribe el código
 * El porqué completo vive en la spec (tmp/v2/spec-full.md §2).
 *
 * Todas las versiones de prompt entran en los hashes de cache: cambiar un prompt
 * sin subir su versión haría que se sirvan notas/planes viejos escritos con las
 * reglas anteriores.
 */

import { GEMINI_REASONING_MODEL } from "@/lib/ai/gemini-client";

export { GEMINI_REASONING_MODEL };

export const PIPELINE_V2_VERSION = "v2.0"; // se sube cuando cambian reglas transversales (ensamblado, dominios)
// pb-2 (v2.1, 2026-09-10): construcción textil por lo VISIBLE (F1), nombres de
// color distintos entre ítems parecidos (F12), tamaño real + `rigidity` (F5),
// detalles chicos solo si se ven (F13), `omit_from_product` (F8), `style` del
// texto impreso (F9) e `item_id` en cada incertidumbre (F4). Schema nuevo.
export const PRODUCT_BRIEF_PROMPT_VERSION = "pb-2";
// rb-2 (v2.1): la persona de la referencia se describe con el PEINADO (color,
// largo y forma). Sin eso el Director no puede pedir uno distinto (F2) y el
// validador no tiene contra qué comparar.
export const REF_BRIEF_PROMPT_VERSION = "rb-2";
// dir-2 (2026-09-10): la paleta de la nota de referencia llega al Director SIN el
// color del producto de stock (refNoteForDirector). Cambia la entrada del
// Director, así que los planes cacheados con la entrada vieja se invalidan solos.
// dir-3 (v2.1): reglas F2-F7, F10, F11 y campo `person_description` en el schema.
export const DIRECTOR_PROMPT_VERSION = "dir-3";
export const STYLE_SPLIT_VERSION = "ss-1";
// asm-2 (2026-09-10): oración de stand-in sin "in place of" cuando el lock o el
// plan sacan a la persona, y fallback saneado (color de la referencia, lock con
// persona, cámara default). No entra en hashes (no se cachea); va al snapshot.
// asm-3 (v2.1): stand-in que solo presta posición y uso (F1), modelo distinta en
// ROLES y SCENE (F2), línea de conteo exacto (F3), rigidez (F5), toma de detalle
// que no saca ítems (F6), omisiones (F8), tipografía (F9), COLOR_LOCK con nombres
// distintos (F12), "Photo N" → "Image M" (F13). Fallback con 1 unidad por ítem.
// asm-4 (v2.2): referencia SIN nota (su nota falló por un error transitorio) que
// sigue viajando con un rol genérico escrito por el código (G2), y bloque PRODUCT
// del fallback sin nota con varias fotos: un ítem por ordinal, cada uno una vez,
// texto impreso letra por letra (G3).
export const ASSEMBLY_VERSION = "asm-4";
// Revisión adversarial de v2.1 (mismo día, mismos números): rb-2 encuadra por el
// cuerpo y el lugar y el template nombra a la persona sin su look; dir-3 aclara
// que el ítem dudoso sigue la regla 8; asm-3 remite el stand-in a SCENE y saca la
// línea de conteo bajo macro. No se subieron: nada de v2.1 llegó a un cache
// persistente (0026 sin aplicar; la prueba en vivo usó el store de memoria).

/**
 * Con referencia + estilo que tiene "lock" de cámara (flat lay, knolling, macro,
 * flotando): ¿quién manda en el ángulo? `true` = el estilo (su ángulo ES su
 * identidad; la referencia aporta lugar, superficies y props).
 *
 * ⚠️ PENDIENTE DE OK DE PAOLO: choca con la decisión 5 ("con referencia manda el
 * encuadre de la referencia"). Si Paolo dice que no, se pasa a `false` y listo:
 * entra en el hash del plan, así que los planes viejos se invalidan solos.
 */
export const STYLE_LOCK_OVER_REFERENCE = true;

export const PRODUCT_BRIEF_MAX_PHOTOS = 8; // fotos que ve la nota
/**
 * Cuántas URLs de producto se intentan bajar para llenar las 8 de la nota. No hay
 * tope server-side de fotos por producto (se suman sin límite desde la ficha), así
 * que bajar TODAS podría ser arbitrariamente caro; con 12 candidatas cubrimos
 * hasta 4 fotos rotas sin perder ninguna de las 8.
 */
export const PRODUCT_DOWNLOAD_CANDIDATES = 12;
export const IMAGE_MAX_PRODUCT_PHOTOS = 6; // fotos que ve el modelo de imagen
export const IMAGE_MAX_REFS = 2; // principal + secundaria
export const REF_MAX_PROCESSED = 5; // referencias que se analizan (el uploader topa en 5)
export const SHOT_COUNT = 5;

export const TIMEOUTS = {
  // 45s → 75s: una nota de 8 fotos en HIGH (~9k tokens de entrada) con varios
  // ítems escribe 2,5-4k tokens entre salida y pensamiento (~87 tok/s medidos en
  // vivo) = 30-45s. Cortarla en 45s es pagarla (Google cobra lo procesado) sin
  // guardarla, y el cache nunca se llena. Las rutas de notas tienen
  // maxDuration=120: descarga (20) + nota (75) + guardado entra.
  briefBackground: 75_000,
  /** PISO del timeout lazy; el real lo calcula `lazyBriefTimeoutMs` con lo que queda de la ruta. */
  briefLazy: 35_000,
  director: 45_000,
  image: 60_000,
  // Una foto de Storage tarda <1s; 20s es para no colgar la tanda entera por
  // una URL que no contesta (v1 no tenía timeout acá).
  download: 20_000,
} as const;

export const ROUTE_BUDGET_MS = 280_000; // margen contra maxDuration=300

/** Techo del timeout lazy de las notas (camino de la generación). */
export const BRIEF_LAZY_MAX_MS = 75_000;
/**
 * Lo que tiene que quedar DETRÁS de las notas lazy: Director (45) + imágenes (60)
 * + uploads (~20) + holgura. Si la nota se come eso, se pierde el reintento del
 * Director, que es mejor que perder el Director entero (sin nota → fallback).
 */
export const BRIEF_LAZY_TAIL_RESERVE_MS = 150_000;

/**
 * Timeout de las notas lazy: lo que sobra del presupuesto de la ruta después de
 * reservar la cola, entre 35s (spec) y 75s. La spec fijaba 35s, pero una nota de
 * 8 fotos puede tardar 30-45s: con 35s caía al fallback sin Director justo en las
 * tandas con más fotos (desvío propio). Con la 0026 sin aplicar, TODA tanda v2
 * pasa por acá.
 */
export function lazyBriefTimeoutMs(elapsedMs: number): number {
  const room = ROUTE_BUDGET_MS - elapsedMs - BRIEF_LAZY_TAIL_RESERVE_MS;
  return Math.max(TIMEOUTS.briefLazy, Math.min(BRIEF_LAZY_MAX_MS, room));
}

/**
 * Tope de bytes por imagen descargada. Los uploads del browser topan en 5 MB
 * (lib/supabase/storage.ts); 15 MB deja margen para fotos viejas y corta un
 * stream infinito antes de que llene la memoria de la instancia.
 */
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
/** El reintento del Director solo corre si quedan al menos 130s del presupuesto. */
export const DIRECTOR_RETRY_MIN_REMAINING_MS = 130_000;

/** Tope de notas (producto + referencia) por usuario por hora en los endpoints. */
export const BRIEFS_PER_USER_PER_HOUR = 40;

/**
 * Modelo de imagen de la v2 = el GA. Verificado en vivo el 2026-09-10: existe en
 * v1beta y acepta `imageConfig` (4:5 a 512 devolvió 464x576). El preview que usa
 * v1 tiene fecha de baja publicada; el fallback solo se usa si el GA da 404.
 */
// `||` y no `??`: una línea `GEMINI_IMAGE_MODEL_V2=` vacía en .env.local llega
// como "" (no undefined) y dejaría el modelo en blanco → 404 en cada imagen.
export const GEMINI_IMAGE_MODEL_V2 =
  process.env.GEMINI_IMAGE_MODEL_V2?.trim() || "gemini-3.1-flash-image";
export const GEMINI_IMAGE_MODEL_V2_FALLBACK = "gemini-3.1-flash-image-preview";
/** Con K mayúscula: la doc avisa que "1k" se rechaza. */
export const IMAGE_SIZE_V2 = "1K";

/** Tolerancia de proporción: dentro de ±1% del ratio pedido no se loguea mismatch. */
export const RATIO_TOLERANCE = 0.01;

/**
 * Holgura sobre los topes de palabras del Director antes de recortar (R1). El
 * modelo cuenta palabras "a ojo": cortar un `product_placement` de 62 palabras
 * cuando el tope es 60 mutilaría la oración del segundo ítem y dispararía H3
 * (etiqueta ausente) → reintento de 45s por dos palabras. Se recorta recién
 * cuando pasa el tope por más de 25%.
 */
export const WORD_CAP_SLACK = 1.25;

/* -------------------------------------------------------------------------- */
/*  Flag                                                                        */
/* -------------------------------------------------------------------------- */

export type PipelineId = "v1" | "v2";

/**
 * Qué pipeline corre para este usuario. Server-only (sin NEXT_PUBLIC): cambiarla
 * en Vercel exige redeploy, que es justo lo que queremos para un rollout.
 *   - VENDI_PIPELINE=v1|v2 (default v1)
 *   - VENDI_PIPELINE_V2_USERS = ids de Clerk separados por coma → v2 forzado
 *     para ellos aunque el global diga v1 (así Paolo prueba en prod sin soltarlo).
 * Se lee en cada llamada y no al cargar el módulo, para que un script de A/B
 * pueda setear el env antes de correr.
 */
export function pipelineForUser(userId: string | null | undefined): PipelineId {
  if (userId) {
    const forced = (process.env.VENDI_PIPELINE_V2_USERS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (forced.includes(userId)) return "v2";
  }
  return process.env.VENDI_PIPELINE?.trim().toLowerCase() === "v2" ? "v2" : "v1";
}

export function isPipelineV2User(userId: string | null | undefined): boolean {
  return pipelineForUser(userId) === "v2";
}
