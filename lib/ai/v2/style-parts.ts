/**
 * STYLE SPLIT — cada estilo partido en dominios con un solo dueño.
 *
 * En v1 el `fragment` entero (luz + fondo + props + cámara) se pegaba debajo del
 * texto del Director, que ya había inventado su propia luz y su propio fondo: dos
 * voces diciendo cosas distintas sobre lo mismo. Acá cada oración va a UN campo:
 *   - look      = luz, sombras, contraste, grading, profundidad, cámara/lente,
 *                 acabado. Llega TAL CUAL al modelo de imagen cuando hay estilo.
 *                 No nombra superficies ni objetos.
 *   - setting   = fondo, superficies, entorno, composición por defecto. Va solo
 *                 al Director (y solo sin referencia) o al fallback.
 *   - propsHint = sugerencia; el Director decide. Nunca llega tal cual (en v1 el
 *                 "props" del estilo inventaba frascos y suculentas).
 *   - lock      = ángulo/geometría que ES la identidad del estilo.
 *
 * Las palabras de paleta van acotadas ("in the surroundings") para que el grading
 * no tiña el producto. El `fragment` original de lib/styles.ts queda intacto para
 * v1 y para el modo estricto.
 */

import { STYLE_LIST, isStyleId, type StyleId } from "@/lib/styles";

export type StyleParts = { look: string; setting: string; propsHint: string; lock: string | null };

export const STYLE_PARTS: Record<StyleId, StyleParts> = {
  estudio_limpio: {
    look: "Large softbox key light placed slightly above and front-left for soft, even, wraparound illumination, balanced by a subtle fill that lifts the shadows. Crisp tack-sharp focus edge to edge, clean neutral color balance, no color casts. Shot on a medium-format camera with an 85mm-equivalent lens at a moderate aperture for true-to-life proportions and minimal distortion. Dust-free, catalog-grade commercial finish.",
    setting: "Professional studio setup on a pure white seamless infinity background. The product is the sole hero, centered with generous negative space, with a faint contact shadow grounding it.",
    propsHint: "",
    lock: null,
  },
  lifestyle: {
    look: "Soft natural daylight streaming from a nearby window, gentle directional quality with believable soft shadows. Shallow depth of field with a creamy out-of-focus background that keeps the product crisp and isolated. Warm, true-to-life color grading, inviting and human. Shot on a full-frame camera with a fast 35-50mm prime lens. Natural, relatable editorial-commercial finish.",
    setting: "Authentic lifestyle scene showing the product in a real, lived-in everyday setting that fits its use, in a candid, unstaged composition framed slightly off-center following the rule of thirds.",
    propsHint: "Tasteful in-context props that tell a story without cluttering.",
    lock: null,
  },
  flat_lay: {
    look: "Soft, even, diffused light from a broad overhead source, minimal flat shadows for a clean modern look. Harmonious, curated color palette in the surroundings, styled like a magazine spread. Shot on a full-frame camera with a 50mm lens. Crisp, organized commercial finish.",
    setting: "The product sits as the focal point of a balanced, editorial composition with generous negative space, on a surface such as linen, marble or warm wood that reads with subtle texture.",
    propsHint: "Complementary props and accents thoughtfully arranged around the product.",
    lock: "Top-down flat lay shot from directly overhead at a perfect 90-degree angle, the camera perfectly leveled and parallel to the surface.",
  },
  knolling: {
    look: "Soft, even, diffused lighting with crisp minimal shadows that keep every object equally legible. Restrained, cohesive color palette in the surroundings. Shot on a full-frame camera with a 50mm lens. Sharp focus across the whole frame, meticulous commercial finish.",
    setting: "A clean, uniform background. The product's items and units, and nothing else, are neatly arranged in a strict, organized grid with a methodical, satisfying, almost technical sense of order.",
    propsHint: "",
    lock: "Precise knolling shot perfectly top-down from a 90-degree overhead angle, the camera leveled square to the surface, every item aligned at exact right angles, parallel and evenly spaced with deliberate symmetry.",
  },
  producto_flotando: {
    look: "Crisp directional key light shaping the form with a gentle fill, controlled specular highlights on edges. Shot on a medium-format camera with an 85mm lens at a moderate aperture for sharp, undistorted detail. Modern, weightless, premium advertising finish.",
    setting: "A smooth, minimal gradient backdrop in a tasteful tone.",
    propsHint: "",
    lock: "The product levitates mid-air, captured as if frozen in motion, with a clean, soft drop shadow directly beneath it that grounds the levitation and gives a strong sense of depth; no visible supports or rigs.",
  },
  editorial_premium: {
    look: "Dramatic low-key lighting: a focused directional key light rakes across the product from the side, sculpting form with a bright rim highlight while rich, deep shadows fall into near-black around it for a moody, sophisticated mood. Refined, muted color palette in the surroundings with elegant contrast. Shot on a medium-format camera with a short telephoto lens for compression and presence. Cinematic, high-end editorial finish.",
    setting: "High-end editorial set with a luxury magazine aesthetic: a polished surface with subtle reflections beneath the product, in a considered composition with strong negative space and a sense of exclusivity and craft.",
    propsHint: "",
    lock: null,
  },
  aire_libre: {
    look: "Warm golden-hour daylight with soft directional sun, gentle long shadows and a touch of atmospheric haze. Shallow depth of field so the product stays sharp and separated from the scene. Natural, true-to-life color grading with warm highlights. Shot on a full-frame camera with a 50-85mm lens. Vibrant yet realistic lifestyle-commercial finish.",
    setting: "A real exterior environment that suits the product, such as a natural landscape, garden, terrace or urban street, as a believable in-context backdrop with a fresh open-air mood and environmental storytelling.",
    propsHint: "",
    lock: null,
  },
  macro_detalle: {
    look: "Soft directional light grazing across the surface to bring out texture, grain and micro-highlights. Rich, refined color and contrast. Razor-sharp focus on the key detail with an extremely shallow depth of field melting the rest into soft bokeh, emphasizing dimensionality. Shot on a full-frame camera with a dedicated macro lens at high magnification. Crisp, tactile, high-detail commercial finish.",
    setting: "The product fills the frame; no other setting is needed.",
    propsHint: "",
    lock: "Extreme close-up macro: a tight crop that fills the frame with the most tactile, premium part of the product, revealing fine surface texture, material detail and craftsmanship.",
  },
  fondo_color: {
    look: "Crisp directional light creating well-defined, intentional shadows that add depth. Saturated, punchy yet tasteful color grading in the surroundings. Shot on a full-frame camera with an 85mm lens for clean proportions. Sharp focus, polished commercial finish.",
    setting: "Bold, minimal setup on a smooth, seamless backdrop in one solid, vibrant color chosen to complement the product, never the product's own color. The product is centered with strong, confident framing and clean negative space, in a modern, graphic, contemporary look made for a striking social-media feed.",
    propsHint: "",
    lock: null,
  },
  calido_artesanal: {
    look: "Soft golden window light from the side, late-afternoon warmth with gentle, natural falloff and cozy shadows. Earthy palette of warm browns, cream and muted naturals in the surroundings. Shallow to moderate depth of field keeping the product the clear focus. Shot on a full-frame camera with a 50mm prime lens. Warm, true-to-life color grading, handcrafted finish.",
    setting: "A rustic natural surface such as weathered wood, raw linen or stone, with visible handcrafted textures and organic, tactile materials that convey care and authenticity, in an inviting, homemade, small-batch mood.",
    propsHint: "A few tasteful natural props.",
    lock: null,
  },
};

/**
 * Tipo de lock, para las reglas que dependen de la GEOMETRÍA y no del texto:
 *   - overhead: flat_lay / knolling → tabla de tomas "cenital" del fallback.
 *   - macro: todas las tomas son detalle (full_product_in_frame=false, sin MARGIN).
 *   - levitation: producto flotando → tabla default.
 */
export type LockKind = "overhead" | "macro" | "levitation";

export const LOCK_KIND: Partial<Record<StyleId, LockKind>> = {
  flat_lay: "overhead",
  knolling: "overhead",
  macro_detalle: "macro",
  producto_flotando: "levitation",
};

export type ResolvedStyle = {
  styleId: StyleId | null;
  parts: StyleParts | null;
  /** De dónde salió: la versión, la búsqueda inversa del fragment del body, o nada. */
  source: "version" | "reverse_lookup" | "none";
  /** El body trajo un fragment que no coincide con ningún estilo del catálogo. */
  unmatchedFragment: boolean;
};

/**
 * El estilo AUTORITATIVO es `versions.style_id`. Si viene null y el cliente mandó
 * un `styleFragment`, se busca en el catálogo el fragment IDÉNTICO (el cliente lo
 * saca de `getStyleFragment`, así que coincide byte a byte). Un fragment que no
 * aparece no se puede partir en dominios: el caso se trata como sin estilo y se
 * loguea (pegarlo entero traería de vuelta la doble voz de v1).
 */
export function resolveStyle(
  styleId: string | null | undefined,
  styleFragment?: string | null,
): ResolvedStyle {
  if (isStyleId(styleId)) {
    return { styleId, parts: STYLE_PARTS[styleId], source: "version", unmatchedFragment: false };
  }
  const fragment = styleFragment?.trim();
  if (fragment) {
    const match = STYLE_LIST.find((s) => s.fragment.trim() === fragment);
    if (match) {
      return { styleId: match.id, parts: STYLE_PARTS[match.id], source: "reverse_lookup", unmatchedFragment: false };
    }
    return { styleId: null, parts: null, source: "none", unmatchedFragment: true };
  }
  return { styleId: null, parts: null, source: "none", unmatchedFragment: false };
}

export function lockKindOf(styleId: StyleId | null): LockKind | null {
  return styleId ? LOCK_KIND[styleId] ?? null : null;
}
