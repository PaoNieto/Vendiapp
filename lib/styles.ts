/**
 * Catalogo de estilos visuales seleccionables por el usuario en la estacion
 * "Estilo" de la Fabrica.
 *
 * Cada estilo tiene:
 * - id: clave en codigo (snake_case), persistible en store / DB
 * - label: nombre en espanol para mostrar en UI
 * - description: 1 linea explicativa para el usuario
 * - fragment: bloque en ingles que se inyecta en el prompt final del modelo
 *
 * El fragment NUNCA se muestra al usuario. Solo se manda al modelo de imagen
 * (Nano Banana) como parte del prompt final.
 *
 * Patron tomado de purrtraits (STYLE_PROMPTS dict): fragmentos curados y
 * reutilizables, no IA generando estilos en runtime.
 */

export type StyleId =
  | "estudio_limpio"
  | "cafe_de_barrio"
  | "lifestyle_natural"
  | "color_solido"
  | "editorial_premium"
  | "cenital_flatlay"
  | "aire_libre"
  | "vibrante_pop";

export type Style = {
  id: StyleId;
  label: string;
  description: string;
  fragment: string;
};

export const STYLES: Record<StyleId, Style> = {
  estudio_limpio: {
    id: "estudio_limpio",
    label: "Estudio limpio",
    description:
      "Fondo blanco, sombra suave, foco nitido. El producto manda.",
    fragment:
      "Clean studio product photography on pure white seamless background, soft diffused key light from above with subtle natural shadow underneath the product, sharp focus, neutral color balance, hero composition centered, minimal styling.",
  },
  cafe_de_barrio: {
    id: "cafe_de_barrio",
    label: "Cafe de barrio",
    description:
      "Madera, tonos tierra, luz calida. Vibe artesanal y acogedor.",
    fragment:
      "Warm rustic lifestyle photography on weathered wooden surface, soft golden hour window light from the side, earth-tone palette of warm browns and cream, visible artisanal textures, cozy hand-crafted feel, gentle natural shadows.",
  },
  lifestyle_natural: {
    id: "lifestyle_natural",
    label: "Lifestyle natural",
    description:
      "Producto en uso, luz de dia, escena real y creible.",
    fragment:
      "Authentic lifestyle photography of the product being used in a real everyday environment, natural daylight, soft shallow depth of field, candid composition, warm realistic color grading, human-scale context.",
  },
  color_solido: {
    id: "color_solido",
    label: "Fondo de color",
    description:
      "Fondo de color vibrante solido, producto centrado. Estilo redes.",
    fragment:
      "Minimal commercial photography on a solid vibrant color background, product centered with bold geometric framing, sharp directional light creating clean defined shadows, saturated punchy color grading, modern flat composition optimized for social feed.",
  },
  editorial_premium: {
    id: "editorial_premium",
    label: "Editorial premium",
    description:
      "Luz dramatica lateral, sombras profundas. Vibe lujo y revista.",
    fragment:
      "Editorial luxury product photography with dramatic side rim lighting, deep rich shadows, low-key moody atmosphere, premium magazine-style composition, sophisticated muted color palette, refined sense of craft and exclusivity.",
  },
  cenital_flatlay: {
    id: "cenital_flatlay",
    label: "Cenital (vista desde arriba)",
    description:
      "Vista desde arriba, props ordenados, estilo revista de cocina.",
    fragment:
      "Top-down flatlay photography shot from directly above, product centered with complementary props arranged geometrically around it, even soft natural light, magazine-style editorial composition, harmonious color palette, generous negative space.",
  },
  aire_libre: {
    id: "aire_libre",
    label: "Aire libre",
    description:
      "Exterior, luz natural de dia. Contexto real al aire libre.",
    fragment:
      "Outdoor product photography in a natural exterior environment, golden hour soft daylight, real-world contextual backdrop (urban or natural setting), gentle wind and atmosphere, lifestyle composition with environmental storytelling.",
  },
  vibrante_pop: {
    id: "vibrante_pop",
    label: "Vibrante pop",
    description:
      "Colores saturados, contraste fuerte, energia joven y divertida.",
    fragment:
      "Bold pop-art inspired product photography with highly saturated colors, strong contrast, dynamic diagonal angles, playful energetic composition, optional duotone or color-blocking elements, youthful contemporary feel.",
  },
};

export const STYLE_LIST: Style[] = Object.values(STYLES);

export function getStyleFragment(id: StyleId | null | undefined): string {
  if (!id) return "";
  return STYLES[id]?.fragment ?? "";
}

export function isStyleId(value: unknown): value is StyleId {
  return typeof value === "string" && value in STYLES;
}
