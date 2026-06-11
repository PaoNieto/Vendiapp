/**
 * Catalogo de "Estilos Profesionales" seleccionables por el usuario en la
 * estacion "Estilo" de la Fabrica.
 *
 * Cada estilo tiene:
 * - id: clave en codigo (snake_case), persistible en store / DB
 * - label: nombre en espanol para mostrar en UI
 * - description: 1 linea explicativa para el usuario (sin jerga)
 * - previewImage: ruta del thumbnail curado (lo provee Davinci en /public)
 * - fragment: bloque en ingles que se inyecta en el prompt final del modelo
 *
 * El fragment NUNCA se muestra al usuario. Solo se manda al modelo de imagen
 * (Nano Banana 2) como parte del prompt final. Cada fragment esta escrito a
 * nivel de fotografia de producto comercial: define toma, iluminacion,
 * composicion, paleta/mood, sensacion de lente y acabado photorealista.
 *
 * El estilo es OPCIONAL y combinable: funciona solo, junto a referencias, o
 * sin nada. Cuando hay estilo, su fragment se inyecta como "Style direction".
 */

export type StyleId =
  | "estudio_limpio"
  | "lifestyle"
  | "flat_lay"
  | "knolling"
  | "producto_flotando"
  | "editorial_premium"
  | "aire_libre"
  | "macro_detalle"
  | "fondo_color"
  | "calido_artesanal";

export type Style = {
  id: StyleId;
  label: string;
  description: string;
  previewImage: string;
  fragment: string;
};

export const STYLES: Record<StyleId, Style> = {
  estudio_limpio: {
    id: "estudio_limpio",
    label: "Estudio limpio",
    description: "Fondo blanco infinito, sombra suave y foco nitido. El producto manda.",
    previewImage: "/estilos/estudio-limpio.jpg",
    fragment:
      "Professional studio product photography on a pure white seamless infinity background. The product is the sole hero, centered with generous negative space. Large softbox key light placed slightly above and front-left for soft, even, wraparound illumination, balanced by a subtle fill that lifts the shadows and a faint contact shadow grounding the product. Crisp tack-sharp focus edge to edge, clean neutral color balance, no color casts. Shot on a medium-format camera with an 85mm-equivalent lens at a moderate aperture for true-to-life proportions and minimal distortion. Immaculate, dust-free, catalog-grade commercial finish, high dynamic range, photorealistic.",
  },
  lifestyle: {
    id: "lifestyle",
    label: "Lifestyle",
    description: "El producto en uso, en una escena real y creible con luz de dia.",
    previewImage: "/estilos/lifestyle.jpg",
    fragment:
      "Authentic lifestyle product photography showing the product in a real, lived-in everyday setting that fits its use. Soft natural daylight streaming from a nearby window, gentle directional quality with believable soft shadows. Shallow depth of field with a creamy out-of-focus background that keeps the product crisp and isolated. Candid, unstaged composition framed slightly off-center following the rule of thirds, with tasteful in-context props that tell a story without cluttering. Warm, true-to-life color grading, inviting and human. Shot on a full-frame camera with a fast 35-50mm prime lens. Natural, relatable, premium editorial-commercial finish, photorealistic.",
  },
  flat_lay: {
    id: "flat_lay",
    label: "Flat lay cenital",
    description: "Vista perfecta desde arriba, props ordenados y mucho aire alrededor.",
    previewImage: "/estilos/flat-lay.jpg",
    fragment:
      "Top-down flat lay product photography shot from directly overhead at a perfect 90-degree angle. The product sits as the focal point with complementary props and accents thoughtfully arranged around it in a balanced, editorial composition with generous negative space. Soft, even, diffused light from a broad overhead source, minimal flat shadows for a clean modern look. Harmonious curated color palette, styled like a premium magazine spread. Surfaces such as linen, marble or warm wood read with subtle texture. Shot on a full-frame camera with a 50mm lens, perfectly leveled and parallel to the surface. Crisp, organized, photorealistic commercial finish.",
  },
  knolling: {
    id: "knolling",
    label: "Knolling",
    description: "Objetos alineados en grilla a 90 grados, orden quirurgico y simetrico.",
    previewImage: "/estilos/knolling.jpg",
    fragment:
      "Precise knolling product photography shot perfectly top-down from a 90-degree overhead angle. The product and its related components or variants are neatly arranged in a strict, organized grid, every item aligned at exact right angles, parallel and evenly spaced with deliberate symmetry. Clean uniform background, soft even diffused lighting with crisp minimal shadows that keep every object equally legible. Methodical, satisfying, almost technical sense of order. Restrained cohesive color palette. Shot on a full-frame camera with a 50mm lens, leveled square to the surface. Sharp focus across the whole frame, meticulous, photorealistic commercial finish.",
  },
  producto_flotando: {
    id: "producto_flotando",
    label: "Producto flotando",
    description: "El producto levita en el aire con una sombra limpia debajo. Dinamico y moderno.",
    previewImage: "/estilos/producto-flotando.jpg",
    fragment:
      "Dynamic floating product photography with the product levitating mid-air, captured as if frozen in motion. A clean, soft drop shadow sits directly beneath it to ground the levitation and give a strong sense of depth. Smooth minimal gradient backdrop in a tasteful tone, no visible supports or rigs. Crisp directional key light shaping the form with a gentle fill, controlled specular highlights on edges. Modern, weightless, premium advertising feel. Shot on a medium-format camera with an 85mm lens at a moderate aperture for sharp, undistorted detail. High dynamic range, immaculate, photorealistic commercial finish.",
  },
  editorial_premium: {
    id: "editorial_premium",
    label: "Editorial premium",
    description: "Luz dramatica lateral y sombras profundas. Vibe lujo de revista.",
    previewImage: "/estilos/editorial-premium.jpg",
    fragment:
      "High-end editorial product photography with a luxury magazine aesthetic. Dramatic low-key lighting: a focused directional key light rakes across the product from the side, sculpting form with a bright rim highlight while rich, deep shadows fall into near-black for a moody, sophisticated mood. Refined muted color palette with elegant contrast. Considered composition with strong negative space and a sense of exclusivity and craft. Subtle reflections or a polished surface beneath the product. Shot on a medium-format camera with a short telephoto lens for compression and presence. Cinematic, premium, gallery-grade, photorealistic finish.",
  },
  aire_libre: {
    id: "aire_libre",
    label: "Aire libre",
    description: "Exterior real con luz natural de dia y contexto al aire libre.",
    previewImage: "/estilos/aire-libre.jpg",
    fragment:
      "Outdoor product photography set in a real exterior environment that suits the product, such as a natural landscape, garden, terrace or urban street. Warm golden-hour daylight with soft directional sun, gentle long shadows and a touch of atmospheric haze. Believable in-context backdrop rendered with a shallow depth of field so the product stays sharp and separated from the scene. Fresh open-air mood with environmental storytelling. Natural, true-to-life color grading with warm highlights. Shot on a full-frame camera with a 50-85mm lens. Vibrant yet realistic, lifestyle-commercial finish, photorealistic.",
  },
  macro_detalle: {
    id: "macro_detalle",
    label: "Macro / detalle",
    description: "Primerisimo plano de la textura y los detalles. Ultra nitido.",
    previewImage: "/estilos/macro-detalle.jpg",
    fragment:
      "Extreme close-up macro product photography revealing fine surface texture, material detail and craftsmanship. Tight crop that fills the frame with the most tactile, premium part of the product. Razor-sharp focus on the key detail with an extremely shallow depth of field melting the rest into soft bokeh, emphasizing dimensionality. Soft directional light grazing across the surface to bring out texture, grain and micro-highlights. Rich, refined color and contrast. Shot on a full-frame camera with a dedicated macro lens at high magnification. Crisp, tactile, high-detail, photorealistic commercial finish.",
  },
  fondo_color: {
    id: "fondo_color",
    label: "Fondo de color",
    description: "Fondo de color solido y vibrante, producto centrado. Estilo redes.",
    previewImage: "/estilos/fondo-color.jpg",
    fragment:
      "Bold minimal commercial product photography on a solid, vibrant single-color background. The product is centered with strong, confident framing and clean negative space, optimized for a striking social-media feed. Crisp directional light creating well-defined, intentional shadows that add depth against the flat color. Saturated, punchy yet tasteful color grading with the backdrop chosen to complement the product. Modern, graphic, contemporary look. Shot on a full-frame camera with an 85mm lens for clean proportions. Smooth seamless backdrop, sharp focus, polished, photorealistic commercial finish.",
  },
  calido_artesanal: {
    id: "calido_artesanal",
    label: "Calido artesanal",
    description: "Madera, tonos tierra y luz calida. Hecho a mano y acogedor.",
    previewImage: "/estilos/calido-artesanal.jpg",
    fragment:
      "Warm artisanal product photography on a rustic natural surface such as weathered wood, raw linen or stone. Soft golden window light from the side, late-afternoon warmth with gentle, natural falloff and cozy shadows. Earthy palette of warm browns, cream and muted naturals. Visible handcrafted textures and organic, tactile materials that convey care and authenticity. Inviting, homemade, small-batch mood with tasteful natural props. Shallow to moderate depth of field keeping the product the clear focus. Shot on a full-frame camera with a 50mm prime lens. Warm true-to-life color grading, handcrafted premium finish, photorealistic.",
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
