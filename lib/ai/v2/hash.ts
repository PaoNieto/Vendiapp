/**
 * Hashes de cache de la v2.
 *
 * La consistencia entre tandas la da el CACHE, no la temperatura (Gemini 3 pide
 * dejarla en 1.0): la misma entrada tiene que dar exactamente la misma nota y el
 * mismo plan, así las 5 imágenes de hoy y las de mañana salen de la misma
 * dirección de arte.
 *
 * Cada hash incluye la versión del pipeline y la del prompt que lo produce:
 * cambiar un prompt y subir su versión invalida el cache solo, sin migrar nada.
 */

import { createHash } from "node:crypto";
import {
  DIRECTOR_PROMPT_VERSION,
  PIPELINE_V2_VERSION,
  PRODUCT_BRIEF_PROMPT_VERSION,
  REF_BRIEF_PROMPT_VERSION,
  STYLE_LOCK_OVER_REFERENCE,
  STYLE_SPLIT_VERSION,
} from "@/lib/ai/v2/constants";
import { clean, LIMITS } from "@/lib/ai/v2/sanitize";

const h = (parts: unknown[]): string =>
  createHash("sha256").update(JSON.stringify(parts)).digest("hex");

/**
 * Clave de una URL de Storage = su PATH. Las URLs firmadas llevan `?token=` y
 * nadie las re-firma hoy, pero si mañana se re-firman al leer (el arreglo
 * definitivo de las URLs que vencen), el path sigue siendo el mismo archivo.
 */
export const urlKey = (u: string): string => {
  try {
    return new URL(u).pathname;
  } catch {
    return u;
  }
};

/** El ORDEN de las fotos importa: `photo_index` de la nota apunta por posición. */
export const productBriefHash = (
  name: string,
  description: string | null | undefined,
  photoUrlsSent: string[],
): string =>
  h([
    "pb",
    PIPELINE_V2_VERSION,
    PRODUCT_BRIEF_PROMPT_VERSION,
    clean(name, LIMITS.productName),
    clean(description, LIMITS.productDescription),
    photoUrlsSent.map(urlKey),
  ]);

/**
 * La nota de referencia depende del nombre del producto (lo usa para encontrar
 * el "slot" del producto en la imagen) y de la imagen. NO de la versión: así
 * `duplicateVersion` (que copia las mismas URLs) reusa las notas gratis.
 */
export const refBriefHash = (name: string, url: string): string =>
  h(["rb", PIPELINE_V2_VERSION, REF_BRIEF_PROMPT_VERSION, clean(name, LIMITS.productName), urlKey(url)]);

/** Claves ordenadas en todo nivel: jsonb NO preserva el orden de las claves. */
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) out[k] = canonical(x);
    }
    return out;
  }
  return v;
}

/**
 * Hash del CONTENIDO de una nota ya normalizada (no de sus insumos). La misma
 * nota da el mismo hash venga del cálculo recién hecho o de la fila de la base.
 */
export const noteContentHash = (note: unknown): string =>
  createHash("sha256").update(JSON.stringify(canonical(note))).digest("hex");

export type PlanHashInput = {
  /** `noteContentHash` de la nota del producto con la que se armó el plan. */
  productNoteHash: string;
  /** `noteContentHash` de cada nota de referencia usable, en el orden de `versions.reference_images`. */
  refNoteHashes: string[];
  styleId: string | null;
  ratio: string;
  userPrompt: string;
  productName: string;
  brand: { name?: string; industry?: string; description?: string } | undefined;
};

/**
 * La marca viene del cliente (localStorage), así que el plan solo se puede
 * calcular en la generación. `variations` NO entra: siempre hay 5 tomas y las
 * imágenes > 5 las reciclan en ciclo.
 *
 * Desvío de la spec §2.1: las notas entran por el hash de su CONTENIDO, no por el
 * de sus insumos. Con temperatura 1.0 dos cálculos de la nota con los MISMOS
 * insumos dan etiquetas distintas ("light-blue microfiber towel" contra "light
 * blue microfiber bath towel"). Si ganaba la carrera after()/lazy una nota y el
 * plan salía de la otra, el plan cacheado quedaba atado a etiquetas que ya no
 * existían: fallaba H3 en cada tanda, se pagaba el Director cada vez y el
 * `on conflict do nothing` nunca dejaba reemplazarlo. Con el contenido en el
 * hash, un plan nunca se sirve con una nota distinta de la que lo produjo.
 */
export const planHash = (i: PlanHashInput): string =>
  h([
    "plan",
    PIPELINE_V2_VERSION,
    DIRECTOR_PROMPT_VERSION,
    STYLE_SPLIT_VERSION,
    STYLE_LOCK_OVER_REFERENCE,
    i.productNoteHash,
    i.refNoteHashes,
    i.styleId ?? "",
    i.ratio,
    clean(i.userPrompt, LIMITS.userPrompt),
    clean(i.productName, LIMITS.productName),
    clean(i.brand?.name, LIMITS.brandName),
    clean(i.brand?.industry, LIMITS.brandIndustry),
    clean(i.brand?.description, LIMITS.brandDescription),
  ]);
