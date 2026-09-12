/**
 * DRY-RUN del pipeline v2 de prompts — SIN RED, SIN BASE, SIN KEY, costo cero.
 *
 * Qué hace: arma con notas y planes de FIXTURE (los ejemplos de la spec §2.8:
 * "Toallas 2" como set A/B + la referencia de la mujer con toallas azul rey, y la
 * cartera multi_angle) los prompts EXACTOS que vería el modelo de imagen, usando
 * el ensamblado REAL de lib/ai/v2 (composeV2 → validatePlan → assembleBatch). No
 * hay una segunda implementación: si esto sale bien, producción arma lo mismo.
 *
 * Por qué existe: la v2 cambia el texto que llega al modelo de imagen y la app no
 * tiene suite de tests. Este script es el gate barato antes de gastar un centavo
 * en el A/B en vivo: compara byte a byte contra los ejemplos de la spec y chequea
 * las reglas del §2.6 (cada dominio con una sola fuente, sin nombre/marca/
 * user_prompt crudo, COLOR_LOCK con hex, MARGIN solo cuando corresponde, roles
 * por ordinal) en todos los casos + planes malos contra el validador, más el
 * cache del plan (hash por contenido), el cupo de notas y el allowlist de URLs.
 *
 * v2.1: la sección 14 prueba una por una las correcciones F1–F13 del A/B ronda 1
 * y la 15 re-pasa los planes y notas REALES de esa ronda por el validador nuevo.
 * Los esperados byte a byte de la spec cambiaron a propósito (ver sección 1).
 *
 * v2.2: la sección 17 prueba G1 (saldo agotado ≠ rate limit, con `fetch`
 * SIMULADO: ninguna llamada sale a la red), G2 (referencia sin nota con rol
 * genérico) y G3 (bloque PRODUCT del fallback sin nota con varias fotos).
 *
 * Uso:  npx --yes tsx scripts/v2-dry-run.ts
 * Sale con código 1 si falla algún chequeo.
 */

import type { OutputRatio } from "@/lib/constants";
import { STYLES } from "@/lib/styles";
import { BILLING_BREAKER_MS, callGemini, isGeminiBillingExhausted, resetGeminiBillingState } from "@/lib/ai/gemini-client";
import { formatBillingError } from "@/lib/generations/format";
import type { BrandContext } from "@/lib/validations/generations";
import { buildImageParts, RATIO_SENTENCE } from "@/lib/ai/v2/assemble";
import {
  deriveColorName,
  neutralizeColorPhrase,
  neutralizeColorWordsInText,
  productColorFamilies,
  productProtectedNouns,
} from "@/lib/ai/v2/colors";
import { composeV2, type ComposeContext } from "@/lib/ai/v2/compose";
import {
  ASSEMBLY_VERSION,
  DIRECTOR_PROMPT_VERSION,
  PRODUCT_BRIEF_PROMPT_VERSION,
  REF_BRIEF_PROMPT_VERSION,
  STYLE_LOCK_OVER_REFERENCE,
} from "@/lib/ai/v2/constants";
import { DIRECTOR_SYSTEM, type Plan } from "@/lib/ai/v2/director";
import { FALLBACK_SHOTS } from "@/lib/ai/v2/fallback";
import { normalizeProductBrief, PRODUCT_BRIEF_SYSTEM, type NormalizeResult, type ProductBrief } from "@/lib/ai/v2/product-brief";
import { normalizeReferenceBrief, REF_BRIEF_SYSTEM, type ReferenceBrief } from "@/lib/ai/v2/reference-brief";
import { clean, escapeRegExp, isAllowedImageUrl, LIMITS, partitionUrls, stripTrailingPeriod } from "@/lib/ai/v2/sanitize";
import { resolveStyle, STYLE_PARTS, type ResolvedStyle } from "@/lib/ai/v2/style-parts";
import type { InlineImage } from "@/lib/ai/v2/types";
import { extraUnitMentions, hairstyleKeywords, repeatsHairstyle, shotAxes, validatePlan } from "@/lib/ai/v2/validate-plan";
import { noteContentHash, planHash } from "@/lib/ai/v2/hash";
import { createMemoryStore } from "@/lib/ai/v2/store";

/* -------------------------------------------------------------------------- */
/*  Mini-harness                                                                */
/* -------------------------------------------------------------------------- */

let checks = 0;
let failures = 0;
const failed: string[] = [];
const out = (s = "") => console.log(s);

function check(name: string, cond: boolean, detail = ""): void {
  checks++;
  if (!cond) {
    failures++;
    failed.push(name);
  }
  out(`  ${cond ? "OK  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function header(title: string): void {
  out();
  out("=".repeat(100));
  out(title);
  out("=".repeat(100));
}

function must<T>(r: NormalizeResult<T>, what: string): T {
  if (!r.ok) throw new Error(`${what}: ${r.error}`);
  return r.value;
}

/** Líneas de un bloque del prompt (hasta la línea vacía siguiente). */
function block(prompt: string, title: string): string {
  const lines = prompt.split("\n");
  const start = lines.indexOf(title);
  if (start < 0) return "";
  const body: string[] = [];
  for (let k = start + 1; k < lines.length && lines[k] !== ""; k++) body.push(lines[k]);
  return body.join("\n");
}

const countWord = (text: string, phrase: string) =>
  (text.match(new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "gi")) ?? []).length;

/** La misma nota con las claves al revés en todo nivel (jsonb no preserva el orden). */
function reverseKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(reverseKeys);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .reverse()
        .map(([k, x]) => [k, reverseKeys(x)]),
    );
  }
  return v;
}

const BLOCKS = [
  "IMAGE ROLES",
  "PRODUCT (reproduce exactly as photographed)",
  "SCENE",
  "LIGHT AND FINISH",
  "CAMERA AND FORMAT",
  "SHOT",
  "KEEP OUT",
] as const;

/* -------------------------------------------------------------------------- */
/*  Fixtures — notas (spec §2.8)                                                */
/* -------------------------------------------------------------------------- */

const TOALLAS_RAW = {
  photos: [
    { photo_index: 1, item_ids: ["A"], view: "flat, top view", identity_quality: "good" },
    { photo_index: 2, item_ids: ["B"], view: "folded, three-quarter view", identity_quality: "good" },
  ],
  items: [
    {
      item_id: "A",
      label: "light-blue textured flat textile",
      category_guess: "towel (possibly a bath or yoga mat)",
      category_confidence: "low",
      colors: [{ name: "light blue", hex: "#8FCFE0", where: "whole surface" }],
      material_and_finish: "woven textile with a matte finish",
      texture: "raised woven grid of small square cells",
      shape_and_scale: "flat rectangle, about 50 x 80 cm, even thickness",
      rigidity: "soft_drapable",
      details: ["neatly finished straight edges"],
      printed_text: [],
      omit_from_product: [],
      identity_sentence:
        "a flat rectangular light blue (approx. #8FCFE0) textile with a raised woven grid of small square cells across the whole surface, an even, slightly spongy thickness and neatly finished straight edges, single color with no print or label",
    },
    {
      item_id: "B",
      label: "light-blue microfiber towel",
      category_guess: "bath towel",
      category_confidence: "high",
      colors: [{ name: "light blue", hex: "#A6D8EA", where: "whole towel" }],
      material_and_finish: "microfiber with a soft matte surface",
      texture: "smooth, fine short pile",
      shape_and_scale: "large bath towel about 70 x 140 cm, folded into a rectangle",
      rigidity: "soft_drapable",
      details: ["thin flat-stitched hem in the same color"],
      printed_text: [],
      omit_from_product: [],
      // Con punto final a propósito: el normalizador lo tiene que sacar.
      identity_sentence:
        "a light blue (approx. #A6D8EA) microfiber towel with a smooth, fine short pile, a soft matte surface and a thin flat-stitched hem in the same color along its edges, single color with no print or label.",
    },
  ],
  primary_item_id: "B",
  photo_set_kind: "set",
  category: "bath towels",
  name_match: "ambiguous",
  typical_use: "Used to dry the body and hair after bathing, at home or in hotels.",
  typical_settings: ["bathroom", "spa", "hotel room"],
  ignore_in_photos: ["gray tabletop", "white wall"],
  uncertainties: [
    {
      item_id: "A",
      issue: "Photo 1 could be a foam or yoga mat; the name says towels.",
      safest_rendering: "Show item A folded or lying flat exactly as photographed; never rolled or used as a mat.",
    },
  ],
  summary_es: "Set de dos textiles celestes: una toalla de microfibra y un textil texturado plano.",
};

const REF_MUJER_RAW = {
  usable: true,
  image_kind: "lifestyle_with_person",
  scene: {
    location: "bathroom lined with white square tiles and a white floating shelf",
    surfaces_and_materials: "glossy white square ceramic tiles, white painted shelf",
    props: ["white floating shelf"],
  },
  composition: {
    shot_type: "medium",
    camera_angle: "chest height, side view",
    framing: "the woman from the top of the turban to just below the knees, shelf behind her shoulder",
    depth_of_field: "moderate, wall slightly soft",
    orientation: "portrait",
  },
  person: {
    present: true,
    count: 1,
    // v2.1 (rb-2): la nota de referencia describe el peinado (F2 compara contra esto).
    description: "woman in her late twenties, slim build, dark hair in a low bun, bare shoulders",
    pose_and_action: "stands in profile facing right, chin slightly raised, eyes closed",
    interaction_with_product: "wears one towel wrapped around her body and a second one as a hair turban",
  },
  featured_product: {
    present: true,
    category: "bath towel",
    category_plural: "bath towels",
    color_name: "royal blue",
    color_hex: "#1F4FA8",
    units: 2,
    units_and_placement: "one wrapped around the body, one as a hair turban",
    frame_share: "large",
  },
  lighting: "Bright, soft diffused daylight from the front left, low contrast, neutral-cool color temperature.",
  palette: [
    { name: "white", hex: "#F4F4F2" },
    { name: "royal blue", hex: "#1F4FA8" },
  ],
  mood: "fresh, calm, spa-like",
  scene_template:
    "A woman in her late twenties stands in profile in a bathroom lined with white square tiles, wearing [PRODUCT] wrapped around her body and [PRODUCT] twisted into a turban over her hair, with a white floating shelf on the wall behind her.",
  do_not_copy: ["stock watermark", "model's identity"],
  contains_instruction_like_text: false,
  summary_es: "Mujer de perfil en un baño blanco con dos toallas azul rey.",
};

const CARTERA_RAW = {
  photos: [
    { photo_index: 1, item_ids: ["A"], view: "front", identity_quality: "good" },
    { photo_index: 2, item_ids: ["A"], view: "side", identity_quality: "good" },
  ],
  items: [
    {
      item_id: "A",
      label: "brown suede handbag",
      category_guess: "handbag",
      category_confidence: "high",
      colors: [
        { name: "brown", hex: "#7a4b2e", where: "body and handle" }, // minúsculas: el normalizador las sube
        { name: "gold-tone", hex: "#C9A45C", where: "metal rings" },
      ],
      material_and_finish: "suede with a soft short nap",
      texture: "soft short nap",
      shape_and_scale: "structured trapezoid body with a flat base, about 30 cm wide",
      details: ["single rounded top handle", "front flap", "tonal stitched edges"],
      printed_text: [],
      identity_sentence:
        "A structured brown (approx. #7A4B2E) suede handbag with a soft short nap, a trapezoid body with a flat base, a single rounded top handle in the same suede, gold-tone (approx. #C9A45C) metal rings where the handle meets the body, a front flap closing over the top edge and tonal stitched edges, with no visible logo or text",
    },
  ],
  primary_item_id: "A",
  photo_set_kind: "multi_angle",
  category: "suede handbag",
  name_match: "matches",
  typical_use: "Carried by hand or on the forearm as an everyday or evening bag.",
  typical_settings: ["city street", "cafe", "boutique shelf"],
  ignore_in_photos: ["white bedsheet background"],
  uncertainties: [],
  summary_es: "Cartera de gamuza marrón con argollas doradas.",
};

/* -------------------------------------------------------------------------- */
/*  Fixtures — ronda 1 del A/B (notas y planes REALES, tal cual los guardó el   */
/*  snapshot; notas pb-1/rb-1 y planes dir-2, sin los campos de v2.1)           */
/* -------------------------------------------------------------------------- */

const TOALLAS_R1_RAW = {
  photos: [
    { photo_index: 1, item_ids: ["A"], view: "unrolled flat, top view", identity_quality: "good" },
    { photo_index: 2, item_ids: ["B"], view: "folded, angled view", identity_quality: "good" },
  ],
  items: [
    {
      item_id: "A", label: "light-blue textured foam mat", category_guess: "yoga mat", category_confidence: "low",
      colors: [{ name: "light-blue", hex: "#76D4EF", where: "entire item" }],
      material_and_finish: "synthetic foam with a molded surface", texture: "embossed grid or woven-like pattern",
      shape_and_scale: "long rectangle, flat", details: ["embossed basket-weave or grid pattern on the surface", "rounded corners"], printed_text: [],
      identity_sentence: "a light-blue (approx. #76D4EF) synthetic foam mat with an embossed woven-like grid texture, shaped as a long flat rectangle with rounded corners",
    },
    {
      item_id: "B", label: "light-blue terrycloth towel", category_guess: "towel", category_confidence: "high",
      colors: [{ name: "light-blue", hex: "#4BA1DD", where: "entire item" }],
      material_and_finish: "terrycloth fabric", texture: "soft loops", shape_and_scale: "rectangular, shown folded into a smaller rectangle",
      details: ["stitched edges"], printed_text: [],
      identity_sentence: "a light-blue (approx. #4BA1DD) terrycloth towel with stitched edges, shown folded into a rectangle",
    },
  ],
  primary_item_id: "B", photo_set_kind: "set", category: "mat and towel set", name_match: "ambiguous",
  typical_use: "used for exercise, yoga, or drying off.", typical_settings: ["gym", "home workout area"], ignore_in_photos: ["checkerboard background"],
  uncertainties: [
    {
      issue: "Photo 1 shows a mat, but the product name says 'Toallas 2' (towels 2). Photo 2 shows a towel.",
      safest_rendering: "show item A as a textured mat and item B as a folded towel exactly as photographed.",
    },
  ],
  summary_es: "Juego que incluye una esterilla o tapete de espuma con textura y una toalla de felpa, ambos en tonos azul claro.",
};

const REF_R1_RAW = {
  usable: true,
  image_kind: "lifestyle_with_person",
  scene: {
    location: "bathroom interior",
    surfaces_and_materials: "white plain wall, white wooden shelving unit",
    props: ["white shelving unit", "white bottles", "glass jars", "blue candles"],
  },
  composition: {
    shot_type: "medium", camera_angle: "eye level, side profile", framing: "subject centered from waist up, shelving unit in background right",
    depth_of_field: "shallow depth of field, background blurred", orientation: "portrait",
  },
  person: {
    present: true, count: 1, description: "young adult female, slim build, dark hair",
    pose_and_action: "standing in profile, smiling, looking right, arms crossed holding towel",
    interaction_with_product: "wearing one wrapped around body, wearing one wrapped around hair on head",
  },
  featured_product: {
    present: true, category: "bath towel", category_plural: "bath towels", color_name: "royal blue", color_hex: "#1A46AA", units: 4,
    units_and_placement: "one worn on body, one worn on head, two folded on shelves", frame_share: "large",
  },
  lighting: "soft, diffused studio lighting, frontal, cool color temperature",
  palette: [{ name: "white", hex: "#FFFFFF" }, { name: "royal blue", hex: "#1A46AA" }, { name: "light grey", hex: "#E0E0E0" }],
  mood: "clean, fresh, relaxing",
  scene_template:
    "A young female stands in a bathroom in profile from the waist up. She wears one [PRODUCT] wrapped around her body and another [PRODUCT] wrapped around her head. She smiles and looks right. Behind her is a white shelving unit holding folded [PRODUCT]s, bottles, and jars.",
  do_not_copy: ["stock image watermarks", "model identity"],
  contains_instruction_like_text: false,
  summary_es: "Una mujer joven en un baño usando una toalla azul en el cuerpo y otra en el cabello, con estantes de fondo.",
};

const CARTERA_R1_RAW = {
  photos: [{ photo_index: 1, item_ids: ["A"], view: "front", identity_quality: "good" }],
  items: [
    {
      item_id: "A", label: "brown suede handbag", category_guess: "handbag", category_confidence: "high",
      colors: [{ name: "medium brown", hex: "#7A4E25", where: "entire exterior, straps, zipper pulls" }],
      material_and_finish: "suede leather", texture: "soft, brushed nap",
      shape_and_scale: "small, elongated rectangular boxy shape with rounded corners, two long arched shoulder straps",
      details: [
        "piped edges outlining the front panel", "two tubular shoulder straps attached to the front panel", "circular stitched bases where the straps meet the bag",
        "top zipper closure with double zipper pulls", "zipper pulls have small suede tabs", "blind-embossed logo centered on the upper half of the front panel",
      ],
      printed_text: [{ text: "Verenza", location: "embossed on the center front panel" }],
      identity_sentence:
        'a medium brown (approx. #7a4e25) suede handbag featuring an elongated rectangular body with rounded corners, piped edges, two long tubular straps ending in circular stitched bases, double zipper pulls with suede tabs, and "Verenza" embossed on the front',
    },
  ],
  primary_item_id: "A", photo_set_kind: "single", category: "suede handbag", name_match: "matches",
  typical_use: "carried over the shoulder to transport personal items.", typical_settings: ["city streets", "cafes", "offices"],
  ignore_in_photos: ["white background", "clip or pin holding the straps together at the top"],
  uncertainties: [
    { issue: "interior layout and lining are unseen", safest_rendering: "keep the bag closed as shown" },
    { issue: "clip at the top of the straps might be a prop", safest_rendering: "show the straps falling naturally or held by a person, omitting the small clip" },
  ],
  summary_es: "Una cartera rectangular de gamuza marrón con bordes vivos, dos asas largas tubulares y cremallera superior.",
};

const R1_SHOTS = (xs: Array<[string, string, boolean]>) => xs.map(([label, instruction, full]) => ({ label, instruction, full_product_in_frame: full }));

const PLAN_A_R1: Record<string, unknown> = {
  primary_reference: 1, secondary_reference: 0, secondary_use: "",
  conflicts: [
    { domain: "identity", between: "reference 1 person wearing towels around body and head", resolution: "Changed person's interaction to holding the folded towel and standing on the unrolled mat to respect product note constraints." },
    { domain: "camera", between: "reference medium shot from waist up", resolution: "Widened framing to a full-body shot so the unrolled mat on the floor is clearly visible." },
  ],
  items_in_frame: [{ item_id: "A", units: 1 }, { item_id: "B", units: 2 }],
  has_person: true,
  purpose: "for a home goods or fitness e-commerce store",
  product_placement:
    'The "light-blue textured foam mat" lies unrolled flat on the floor beneath the woman. The woman holds one "light-blue terrycloth towel" neatly folded in her hands. A second "light-blue terrycloth towel" rests folded on the shelving unit behind her.',
  scene_paragraph:
    "Inside a clean bathroom interior, a young adult female with a slim build and dark hair, wearing a simple white slip dress, stands in profile on the floor, smiling and looking right. Behind her sits a white wooden shelving unit holding white bottles and glass jars, placed against a white plain wall.",
  allowed_objects: ["the young adult female", "the simple white slip dress", "the white wooden shelving unit", "the white plain wall", "the white bottles", "the glass jars"],
  light_owner: "style", light_and_finish: "",
  light_placement: "A focused directional key light rakes across the woman, the held towel, and the floor mat from the side, casting the background shelving unit into deep shadow.",
  camera: "Eye-level side profile, wide full-body shot framing the standing woman, the floor, and the shelving unit. The focus is balanced between the held towel and the unrolled mat.",
  shot_variations: R1_SHOTS([
    ["Base wide shot", "Use the base framing described above.", true],
    ["Medium crop", "Closer medium shot framing the woman from the waist up, holding the towel, with the mat cropped out.", false],
    ["Low angle wide", "Lower camera angle looking up slightly, capturing the mat in the foreground and the woman holding the towel.", true],
    ["Opposite side angle", "Camera moved to the opposite side profile, showing the woman's left side as she holds the towel over the mat.", true],
    ["Floor detail crop", "Close crop angled downwards focusing on the woman's feet on the mat, with the held towel barely visible above.", false],
  ]),
  user_instructions_applied: "", rejected_requests: [],
  summary_es: "Una mujer joven con un vestido blanco sostiene una toalla doblada mientras está de pie sobre una alfombra plana desenrollada en un baño.",
};

const PLAN_B_R1: Record<string, unknown> = {
  primary_reference: 1, secondary_reference: 0, secondary_use: "",
  conflicts: [{ domain: "person", between: "reference pose showing product worn and product note safest_rendering", resolution: "the woman holds the folded towel against her body instead of wearing it" }],
  items_in_frame: [{ item_id: "B", units: 1 }, { item_id: "A", units: 1 }],
  has_person: true,
  purpose: "for a product page and social media ads",
  product_placement:
    "The woman holds the folded light-blue terrycloth towel against her torso. The light-blue textured foam mat lies unrolled flat on a shelf of the shelving unit behind her.",
  scene_paragraph:
    "A slim young adult female with dark hair stands in a bathroom interior from the waist up. She stands in profile, smiling and looking to the right while holding the product. Behind her to the right is a white wooden shelving unit arranged against a plain white wall, decorated with white bottles and blue candles.",
  allowed_objects: ["the woman", "the plain white wall", "the white wooden shelving unit", "the white bottles", "the blue candles"],
  light_owner: "reference",
  light_and_finish:
    "Soft, diffused studio lighting from the front with a cool color temperature. The image has a clean, fresh, and relaxing mood featuring a white and light grey palette, captured with a shallow depth of field that blurs the background.",
  light_placement: "",
  camera: "Eye level, side profile medium shot framed from the waist up. The subject is centered in a 1:1 square composition with the background slightly blurred.",
  shot_variations: R1_SHOTS([
    ["Base medium shot", "Use the base framing described above.", true],
    ["Closer detail crop", "Closer crop focusing tightly on the folded towel in the woman's hands.", false],
    ["Wider framing", "Camera moves back for a wider view, revealing more of the white wall and the shelving unit.", true],
    ["Frontal angle", "Camera shifts to a frontal view of the woman holding the product instead of a profile angle.", true],
    ["Slightly higher angle", "Camera is positioned slightly higher, pointing down at the woman and the shelves.", true],
  ]),
  user_instructions_applied: "", rejected_requests: [],
  summary_es: "Una mujer joven sostiene la toalla azul claro plegada frente a ella en un baño.",
};

const PLAN_C_R1: Record<string, unknown> = {
  primary_reference: 0, secondary_reference: 0, secondary_use: "", conflicts: [],
  items_in_frame: [{ item_id: "A", units: 1 }],
  has_person: false,
  purpose: "for a fashion accessories shop's social media and product pages",
  product_placement: "The brown suede handbag stands upright in the center of the surface. Its two long arched shoulder straps drape naturally down its sides, keeping the bag closed.",
  scene_paragraph:
    "The setting is a bold, minimal studio arrangement featuring a smooth, seamless backdrop in a solid, vibrant teal to complement the warm tones of the handbag. The layout consists entirely of this continuous surface, leaving clean negative space on all sides for a graphic, contemporary aesthetic without any props.",
  allowed_objects: ["the seamless studio backdrop"],
  light_owner: "style", light_and_finish: "",
  light_placement:
    "Crisp directional light strikes from the upper left, casting a well-defined shadow of the handbag and its straps toward the lower right against the vibrant background.",
  camera:
    "Straight-on, eye-level angle at a medium distance. The framing places the handbag squarely in the center, capturing it in full focus with an even border of negative space on all four sides.",
  shot_variations: R1_SHOTS([
    ["Base square framing", "Use the base framing described above.", true],
    ["Close-up front detail", "Closer crop focusing tightly on the front texture and details of the handbag, with the straps extending out of frame.", false],
    ["High-angle view", "Camera raised to look down slightly at the handbag, capturing the top edge and the drape of the straps from above.", true],
    ["Wider studio view", "Camera moved back to capture more of the vibrant teal seamless backdrop, emphasizing the minimal layout and graphic proportions.", true],
    ["Three-quarter angle", "Camera shifted horizontally to a slight side angle, adding volume to the presentation while keeping the handbag centered and entirely visible.", true],
  ]),
  user_instructions_applied: "", rejected_requests: [],
  summary_es: "Una cartera de ante marrón sobre un fondo de estudio continuo verde azulado vibrante.",
};

const PLAN_D_R1: Record<string, unknown> = {
  primary_reference: 0, secondary_reference: 0, secondary_use: "", conflicts: [],
  items_in_frame: [{ item_id: "A", units: 1 }],
  has_person: true,
  purpose: "for a fashion brand's online store and social media ads",
  product_placement:
    "The brown suede handbag hangs gracefully from the woman's shoulder. The straps are worn over her shoulder, allowing the bag's front side to be fully visible, facing the camera, and securely closed.",
  scene_paragraph:
    "A young woman stands outdoors against an out-of-focus stone building facade on a city street. She has a slim build and wears a cream-colored wool coat. Her face is out of frame, keeping the visual focus entirely on the handbag.",
  allowed_objects: ["the woman", "the cream-colored wool coat", "the stone building facade", "the city street"],
  light_owner: "director",
  light_and_finish:
    "Bright, natural sunlight coming from the top left, creating soft shadows that highlight the suede texture. Warm, natural color grading with rich contrast. Shot on a 50mm lens for a natural perspective with a shallow depth of field, rendering a crisp, high-end commercial finish.",
  light_placement: "",
  camera:
    "Eye-level medium shot, framed in a 4:5 vertical ratio. The handbag occupies the middle two-thirds of the frame with a little headroom above, keeping the bag and the woman's torso in sharp focus.",
  shot_variations: R1_SHOTS([
    ["Base medium shot", "Use the base framing described above.", true],
    ["Wider framing", "Stepping back to show more of the coat and the stone building facade, keeping the bag centered.", true],
    ["Lower angle", "Lower camera height looking slightly upward at the bag on the shoulder.", true],
    ["Texture close-up", "Closer crop focusing heavily on the front side and printed text, cropping out most of the background.", false],
    ["Strap detail", "Macro detail crop on the rounded corners and the long arched shoulder straps.", false],
  ]),
  user_instructions_applied: "", rejected_requests: [],
  summary_es: "Cartera de gamuza marrón llevada al hombro por una modelo anónima con abrigo crema en la calle.",
};

/* -------------------------------------------------------------------------- */
/*  Fixtures — planes del Director                                              */
/* -------------------------------------------------------------------------- */

// Spec §2.8, ACTUALIZADO a las reglas v2.1 (a propósito, no es regresión):
//   - F3: la segunda toalla de turbante se fue (units 1; la referencia no manda cantidades).
//   - F2: person_description con otro peinado que la referencia (rodete → pelo corto
//     y rizado) y otros dos rasgos; la escena la llama "the model".
//   - F6b: la toma 2 cambia dos ejes (distancia + ángulo) y ninguna toma saca un ítem.
const PLAN_TOALLAS_EDITORIAL: Plan = {
  primary_reference: 1,
  secondary_reference: 0,
  secondary_use: "",
  conflicts: [
    { domain: "light", between: "reference: bright soft daylight / style: dramatic low-key", resolution: "Style owns the light; same bathroom lit by one side key light." },
    { domain: "scene", between: "style setting: polished surface, negative space / reference: tiled bathroom with shelf", resolution: "Reference owns the scene; style setting ignored." },
    { domain: "identity", between: "reference towels: royal blue / seller items: light blue", resolution: "Replaced by the seller's items in their own colors." },
    { domain: "identity", between: "item A: towel or mat (low confidence)", resolution: "Folded flat on the shelf as photographed; never rolled." },
  ],
  items_in_frame: [
    { item_id: "B", units: 1 },
    { item_id: "A", units: 1 },
  ],
  has_person: true,
  person_description: "a woman in her early forties with short curly auburn hair and a medium build",
  purpose: "for a home-textiles shop's product page and social ads",
  product_placement:
    "She wears the light-blue microfiber towel wrapped snugly around her body from the chest to just above the knees, one hand resting on its fold. The light-blue textured flat textile lies folded in a neat square on the shelf, textured face up.",
  scene_paragraph:
    "The model stands in profile, facing right, in a bathroom lined with white square tiles, her chin slightly raised and her eyes gently closed. Behind her, a single white floating shelf is mounted on the wall, with open wall space in front of her face.",
  allowed_objects: ["the woman", "the white tiled wall", "the white floating shelf"],
  light_owner: "style",
  light_and_finish: "",
  light_placement:
    "The key light comes from the side she faces, catching her profile, the towel folds and the folded textile, while the tiled wall behind her falls away.",
  camera:
    "Medium-long shot at chest height from her side, framing her from the top of her head to just below the knees, with the shelf behind her shoulder and sharp focus on the towel wrap.",
  shot_variations: [
    { label: "base", instruction: "Use the base framing described above.", full_product_in_frame: true },
    { label: "closer three-quarter", instruction: "Move in to a waist-up crop from a three-quarter front angle so the wrapped towel fills most of the frame, the shelf with the folded textile behind her.", full_product_in_frame: false },
    { label: "three-quarter", instruction: "Move the camera to a three-quarter view from slightly in front of her, at the same height and distance.", full_product_in_frame: true },
    { label: "wider", instruction: "Step back and lower the camera to hip height, showing more of the wall and the shelf with the folded textile.", full_product_in_frame: true },
    { label: "detail", instruction: "Close-up at her shoulder where the towel is tucked, the microfiber texture filling most of the image and the folded textile at the frame's edge.", full_product_in_frame: false },
  ],
  user_instructions_applied: "",
  rejected_requests: [],
  summary_es:
    "Mujer de perfil en un baño de azulejos blancos, envuelta en la toalla celeste con otra de turbante; la texturada doblada en el estante; luz lateral dramática.",
};

const PLAN_TOALLAS_REF_ONLY: Plan = {
  ...structuredClone(PLAN_TOALLAS_EDITORIAL),
  conflicts: [PLAN_TOALLAS_EDITORIAL.conflicts[2], PLAN_TOALLAS_EDITORIAL.conflicts[3]],
  light_owner: "reference",
  light_and_finish:
    "Bright, soft diffused daylight from the front left with low contrast and airy, neutral-cool whites in the surroundings. Shot on a full-frame camera with a 50mm lens. Fresh, natural lifestyle finish.",
  light_placement: "",
  summary_es: "Mujer de perfil en el baño de la referencia, con su luz diurna suave.",
};

// Spec §2.8 (cartera), tal cual.
const PLAN_CARTERA_FONDO: Plan = {
  primary_reference: 0,
  secondary_reference: 0,
  secondary_use: "",
  conflicts: [],
  items_in_frame: [{ item_id: "A", units: 1 }],
  has_person: false,
  person_description: "",
  purpose: "for a leather-goods shop's social feed",
  product_placement:
    "The brown suede handbag stands upright on its base at the center of the frame, turned slightly toward the camera so the flap, the metal rings and one side read clearly, its handle raised in a clean arc.",
  scene_paragraph:
    "A smooth, seamless backdrop in a single saturated teal (approx. #1E8C8A) curves from floor to wall with no visible horizon line, leaving clean negative space all around.",
  allowed_objects: ["the seamless teal backdrop"],
  light_owner: "style",
  light_and_finish: "",
  light_placement:
    "The key light comes from the upper left, laying a clean shadow to the lower right on the teal floor and raking across the suede nap.",
  camera:
    "Eye level at the bag's mid-height, three-quarter front view, the bag centered and filling about 60% of the frame height, in sharp focus from the flap to the base.",
  shot_variations: [
    { label: "base", instruction: "Use the base framing described above.", full_product_in_frame: true },
    // v2.1 (F6b): la toma 2 cambia dos ejes (lado + altura).
    { label: "three-quarter, higher", instruction: "Move the camera about 30 degrees to the left and raise it slightly, for a view of the front, one side and the top edge.", full_product_in_frame: true },
    { label: "closer", instruction: "Move closer so the flap and the metal rings fill the upper two-thirds of the frame.", full_product_in_frame: false },
    { label: "higher", instruction: "Raise the camera to look down about 20 degrees onto the flap, same distance.", full_product_in_frame: true },
    { label: "wider", instruction: "Step back so the bag fills about 40% of the frame height, with more teal space around it.", full_product_in_frame: true },
  ],
  user_instructions_applied: "",
  rejected_requests: [],
  summary_es: "Cartera de pie sobre fondo teal, luz dura desde arriba a la izquierda.",
};

const PLAN_CARTERA_NONE: Plan = {
  ...structuredClone(PLAN_CARTERA_FONDO),
  purpose: "for a leather-goods shop's product page",
  product_placement:
    "The brown suede handbag stands upright on the tabletop, turned slightly toward the camera so the flap and the metal rings read clearly, its handle raised in a clean arc.",
  scene_paragraph:
    "A pale oak tabletop stands in front of a warm off-white plaster wall, with a small folded linen napkin near the back edge of the table and calm, empty space around the bag.",
  allowed_objects: ["the pale oak tabletop", "the off-white plaster wall", "a folded linen napkin"],
  light_owner: "director",
  light_and_finish:
    "Large soft key light from the upper left with a gentle fill, soft natural falloff and neutral, true-to-life color balance. Shot on a full-frame camera with a 70mm lens at a moderate aperture. Clean, catalog-grade commercial finish.",
  light_placement: "",
  camera:
    "Eye level at the bag's mid-height, three-quarter front view, the bag centered and filling about 55% of the frame height, in sharp focus from the flap to the base.",
  shot_variations: [
    ...structuredClone(PLAN_CARTERA_FONDO.shot_variations.slice(0, 4)),
    { label: "wider", instruction: "Step back so the bag fills about 40% of the frame height, with more of the tabletop and the wall around it.", full_product_in_frame: true },
  ],
  summary_es: "Cartera sobre mesa de roble claro con pared de yeso.",
};

const PLAN_TOALLAS_FLATLAY: Plan = {
  primary_reference: 1,
  secondary_reference: 0,
  secondary_use: "",
  conflicts: [
    { domain: "camera", between: "reference: side view at chest height / style lock: top-down at 90 degrees", resolution: "The lock owns the camera; the reference gives the tiled surface only." },
    { domain: "person", between: "reference: woman wearing the towel / style lock: top-down flat lay", resolution: "Person dropped; both items lie flat." },
  ],
  items_in_frame: [
    { item_id: "B", units: 1 },
    { item_id: "A", units: 1 },
  ],
  has_person: false,
  person_description: "",
  purpose: "for a home-textiles shop's product page",
  product_placement:
    "The light-blue microfiber towel lies folded in a neat rectangle at the center of the frame, and the light-blue textured flat textile lies flat beside it on the right, textured face up.",
  scene_paragraph:
    "White square bathroom tiles fill the frame as one flat, clean surface, with a small white ceramic dish near the top left corner and even tile space around the items.",
  allowed_objects: ["the white tiled surface", "a small white ceramic dish"],
  light_owner: "style",
  light_and_finish: "",
  light_placement:
    "The broad overhead source sits slightly above the top edge of the frame, giving the towel pile and the raised grid gentle, even relief.",
  camera:
    "Both items centered with even tile space on all sides, the folded towel at the optical center, sharp focus across the whole surface.",
  shot_variations: [
    { label: "base", instruction: "Use the base framing described above.", full_product_in_frame: true },
    { label: "tighter", instruction: "Crop tighter so both items fill most of the frame, the tile grid still visible at the edges.", full_product_in_frame: true },
    { label: "left third", instruction: "Shift the framing so the folded towel sits on the left third.", full_product_in_frame: true },
    { label: "corner detail", instruction: "Crop in on the corner where the towel and the textile meet, their textures filling the frame.", full_product_in_frame: false },
    { label: "wider", instruction: "Slightly wider crop with more empty tile surface around both items.", full_product_in_frame: true },
  ],
  user_instructions_applied: "",
  rejected_requests: [],
  summary_es: "Flat lay cenital de las dos piezas sobre azulejo blanco.",
};

const PLAN_TOALLAS_STORY: Plan = {
  ...structuredClone(PLAN_TOALLAS_EDITORIAL),
  conflicts: [PLAN_TOALLAS_EDITORIAL.conflicts[2], PLAN_TOALLAS_EDITORIAL.conflicts[3]],
  purpose: "for a home-textiles shop's stories and reels",
  light_placement:
    "The window light falls from the side she faces, catching her profile and the towel folds while the far wall stays softer.",
  camera:
    "Full-length vertical shot at chest height from her side, her face and the towel wrap in the central area of the frame, clear of the top and bottom edges, with sharp focus on the towel wrap.",
  summary_es: "Versión story 9:16 de la mujer con las toallas.",
};

const USER_LIGHT_PROMPT = "Quiero luz natural de mañana, suave y clara, nada oscuro.";

const PLAN_TOALLAS_USERLIGHT: Plan = {
  ...structuredClone(PLAN_TOALLAS_EDITORIAL),
  conflicts: [
    { domain: "user_instructions", between: "user: soft bright morning light / style: dramatic low-key", resolution: "User instructions own the light." },
    PLAN_TOALLAS_EDITORIAL.conflicts[2],
  ],
  light_owner: "user_instructions",
  light_and_finish:
    "Soft, bright morning daylight from a frosted window on her right, gentle low-contrast falloff and clean, airy whites in the surroundings. Shot on a medium-format camera with a short telephoto lens. Fresh, high-end editorial finish.",
  light_placement: "",
  user_instructions_applied: "Bright soft morning daylight replaces the style's low-key light.",
};

/* -------------------------------------------------------------------------- */
/*  Esperados de la spec §2.8 (byte a byte), ACTUALIZADOS a v2.1                */
/* -------------------------------------------------------------------------- */
// Qué cambió a propósito respecto del ejemplo de la spec (y por qué):
//   ROLES   + "From the stand-ins take only their position and how they are used;
//             the seller's items keep their own material, surface, edges, size and
//             count." (F1: la toalla heredaba el rizo y la guarda de la de stock)
//           "a new, anonymous model" → "a different, anonymous model: <descripción>"
//             (F2: salió la misma modelo de stock)
//   SCENE   arranca con "The model is …" (F2) y ya no hay turbante (F3, cambio del plan)
//   LIGHT   COLOR_LOCK con nombres derivados del hex: "light sky blue" / "light aqua"
//             (F12: dos ítems "light blue" mezclaban colores)
//   CAMERA  "top of her head" en vez de "top of the turban" (cambio del plan, F3)
//   KEEP OUT + "The image contains exactly one … and exactly one …." (F3)
//   SHOT 2  toma de dos ejes + "Every product item stays at least partly in view." (F6)
//   ROLES   + ", arranged as described in SCENE," en el stand-in (revisión v2.1: con
//             una unidad por ítem y el textil dudoso en el estante, "take only their
//             position" lo mandaba al lugar del turbante)

const EXPECTED_TOALLAS_1 = `Create one new photorealistic commercial photograph for a home-textiles shop's product page and social ads: take the product from Images 1 and 2 and place it in the scene of Image 3, in place of the product shown there.

IMAGE ROLES
Images 1 and 2 show the product being sold (bath towels): two different items sold together; they are the only source for how they look. Image 3 is a scene reference: use it only for the setting, the composition and camera angle, the person's pose and how the product is used; not for its light or colors. The royal blue bath towels in Image 3 are stand-ins for the seller's product: put the light-blue microfiber towel and the light-blue textured flat textile in their place, arranged as described in SCENE, in their own colors. From the stand-ins take only their position and how they are used; the seller's items keep their own material, surface, edges, size and count. The person is a different, anonymous model: a woman in her early forties with short curly auburn hair and a medium build; not the person in Image 3. Ignore any watermark, logo or text in Image 3.

PRODUCT (reproduce exactly as photographed)
The light-blue microfiber towel (Image 2): a light blue (approx. #A6D8EA) microfiber towel with a smooth, fine short pile, a soft matte surface and a thin flat-stitched hem in the same color along its edges, single color with no print or label.
The light-blue textured flat textile (Image 1): a flat rectangular light blue (approx. #8FCFE0) textile with a raised woven grid of small square cells across the whole surface, an even, slightly spongy thickness and neatly finished straight edges, single color with no print or label.
Keep each item's color, material, texture, shape and details identical to Images 1 and 2.

SCENE
The model is a woman in her early forties with short curly auburn hair and a medium build. The model stands in profile, facing right, in a bathroom lined with white square tiles, her chin slightly raised and her eyes gently closed. Behind her, a single white floating shelf is mounted on the wall, with open wall space in front of her face. She wears the light-blue microfiber towel wrapped snugly around her body from the chest to just above the knees, one hand resting on its fold. The light-blue textured flat textile lies folded in a neat square on the shelf, textured face up.

LIGHT AND FINISH
Dramatic low-key lighting: a focused directional key light rakes across the product from the side, sculpting form with a bright rim highlight while rich, deep shadows fall into near-black around it for a moody, sophisticated mood. Refined, muted color palette in the surroundings with elegant contrast. Shot on a medium-format camera with a short telephoto lens for compression and presence. Cinematic, high-end editorial finish. The key light comes from the side she faces, catching her profile, the towel folds and the folded textile, while the tiled wall behind her falls away. Light and grading never change the product's colors: the light-blue microfiber towel stays light sky blue (approx. #A6D8EA) and the light-blue textured flat textile stays light aqua (approx. #8FCFE0).

CAMERA AND FORMAT
Medium-long shot at chest height from her side, framing her from the top of her head to just below the knees, with the shelf behind her shoulder and sharp focus on the towel wrap. Square 1:1 image.

SHOT
For this image: use the base framing described above. Keep every product item fully inside the frame with a clear margin.

KEEP OUT
Every surface is clean and unmarked: no text, letters, logos, watermarks or brand marks anywhere in the image. The image contains exactly one light-blue microfiber towel and exactly one light-blue textured flat textile. The only products in the frame are the seller's items described above; besides them, the scene holds only the woman, the white tiled wall and the white floating shelf.`;

const EXPECTED_TOALLAS_2_SHOT =
  "For this image: Move in to a waist-up crop from a three-quarter front angle so the wrapped towel fills most of the frame, the shelf with the folded textile behind her. Every product item stays at least partly in view.";

const EXPECTED_CARTERA_1 = `Create one new photorealistic commercial photograph of the product in Images 1 and 2, for a leather-goods shop's social feed.

IMAGE ROLES
Images 1 and 2 show the product being sold (suede handbag), one product seen from different angles; they are the only source for how it looks.

PRODUCT (reproduce exactly as photographed)
The brown suede handbag (Images 1 and 2): a structured brown (approx. #7A4B2E) suede handbag with a soft short nap, a trapezoid body with a flat base, a single rounded top handle in the same suede, gold-tone (approx. #C9A45C) metal rings where the handle meets the body, a front flap closing over the top edge and tonal stitched edges, with no visible logo or text.
Keep its color, material, texture, shape and details identical to Images 1 and 2.

SCENE
A smooth, seamless backdrop in a single saturated teal (approx. #1E8C8A) curves from floor to wall with no visible horizon line, leaving clean negative space all around. The brown suede handbag stands upright on its base at the center of the frame, turned slightly toward the camera so the flap, the metal rings and one side read clearly, its handle raised in a clean arc.

LIGHT AND FINISH
Crisp directional light creating well-defined, intentional shadows that add depth. Saturated, punchy yet tasteful color grading in the surroundings. Shot on a full-frame camera with an 85mm lens for clean proportions. Sharp focus, polished commercial finish. The key light comes from the upper left, laying a clean shadow to the lower right on the teal floor and raking across the suede nap. Light and grading never change the product's colors: the brown suede handbag stays brown (approx. #7A4B2E) with gold-tone (approx. #C9A45C) metal rings.

CAMERA AND FORMAT
Eye level at the bag's mid-height, three-quarter front view, the bag centered and filling about 60% of the frame height, in sharp focus from the flap to the base. Square 1:1 image.

SHOT
For this image: use the base framing described above. Keep the whole product fully inside the frame with a clear margin.

KEEP OUT
Every surface is clean and unmarked: no text, letters, logos, watermarks or brand marks anywhere in the image. The image contains exactly one brown suede handbag. The only product in the frame is the brown suede handbag; besides it, the scene holds only the seamless teal backdrop.`;
// (v2.1: la única diferencia con el ejemplo de la spec es la línea de conteo del KEEP OUT, F3.)

/* -------------------------------------------------------------------------- */
/*  Contexto                                                                    */
/* -------------------------------------------------------------------------- */

const TOALLAS = must(normalizeProductBrief(TOALLAS_RAW, 2), "nota toallas");
const CARTERA = must(normalizeProductBrief(CARTERA_RAW, 2), "nota cartera");
const REF_MUJER = must(normalizeReferenceBrief(REF_MUJER_RAW), "nota referencia");

const TOALLAS_NAME = "Toallas Nube Celeste";
const CARTERA_NAME = "Cartera Luna de gamuza";
const BRAND: BrandContext = {
  name: "Casa Nube",
  industry: "textiles para el hogar",
  description: "Toallas y textiles de algodón para baño, hechos en Lima.",
};

function ctxOf(p: {
  brief: ProductBrief | null;
  refs?: ReferenceBrief[];
  style: ResolvedStyle;
  ratio?: OutputRatio;
  variations?: number;
  userPrompt?: string;
  productName?: string;
  brand?: BrandContext;
  photos?: number;
}): ComposeContext {
  return {
    productBrief: p.brief,
    availablePhotoCount: p.photos ?? 2,
    usableRefs: p.refs ?? [],
    style: p.style,
    ratio: p.ratio ?? "1:1",
    variations: p.variations ?? 5,
    userPrompt: p.userPrompt ?? "",
    productName: p.productName ?? TOALLAS_NAME,
    brand: p.brand ?? BRAND,
  };
}

const NO_STYLE = resolveStyle(null);

/* -------------------------------------------------------------------------- */
/*  Reglas del §2.6 — se corren sobre CADA caso                                 */
/* -------------------------------------------------------------------------- */

type Composed = ReturnType<typeof composeV2>;

function checkRules(label: string, ctx: ComposeContext, r: Composed): void {
  const { batch, plan, planSource, frame } = r;
  const prompts = batch.prompts;
  const p0 = prompts[0];
  const P = batch.slots.filter((s) => s.role === "product").length;

  // -- Forma: 7 bloques en orden, ninguno vacío.
  const allBlocks = prompts.every((p) => BLOCKS.every((b) => block(p, b).trim().length > 0));
  check(`${label}: los 7 bloques están y ninguno queda vacío`, allBlocks);
  const order = BLOCKS.map((b) => p0.split("\n").indexOf(b));
  check(`${label}: bloques en el orden de la plantilla`, order.every((v, k) => v > 0 && (k === 0 || v > order[k - 1])));

  // -- Roles por ordinal: productos = Image 1..P, referencia = P+1, secundaria = P+2.
  check(
    `${label}: slots numerados 1..N en el orden en que viajan`,
    batch.slots.every((s, k) => s.label.startsWith(`Image ${k + 1}: `)),
    batch.slots.map((s) => s.label).join(" | "),
  );
  check(`${label}: primero todas las fotos de producto, después las referencias`, batch.slots.slice(0, P).every((s) => s.role === "product"));
  const roles = block(p0, "IMAGE ROLES");
  const productBlock = block(p0, "PRODUCT (reproduce exactly as photographed)");
  const refSlot = batch.slots.find((s) => s.role === "reference");
  if (refSlot) {
    const K = batch.slots.indexOf(refSlot) + 1;
    check(`${label}: referencia = Image ${K} = P+1`, K === P + 1);
    check(`${label}: ROLES dice "Image ${K} is a scene reference"`, roles.includes(`Image ${K} is a scene reference`));
    check(`${label}: TASK_LINE apunta a la escena de Image ${K}`, p0.split("\n")[0].includes(`in the scene of Image ${K}`));
    const refNums = [...productBlock.matchAll(/Images? ([\d–, and]+)\)/g)].map((m) => m[1]).join(" ");
    check(`${label}: el bloque PRODUCT nunca cita la imagen de la referencia`, !new RegExp(`\\b${K}\\b`).test(refNums), refNums);
  } else {
    check(`${label}: sin referencia, ni ROLES ni TASK_LINE mencionan una`, !/reference|scene of Image/i.test(`${roles}\n${p0.split("\n")[0]}`));
    check(`${label}: sin referencia no hay slots de referencia`, batch.slots.every((s) => s.role === "product"));
  }

  // -- LUZ: una sola fuente.
  const light = block(p0, "LIGHT AND FINISH");
  const lightSource = light.split("Light and grading never change")[0].trim();
  const look = frame.hasStyle && ctx.style.parts ? ctx.style.parts.look : null;
  check(`${label}: el bloque de luz trae luz (no solo el COLOR_LOCK)`, lightSource.length > 20, `"${lightSource.slice(0, 60)}"`);
  if (plan.light_owner === "user_instructions") {
    check(`${label}: luz del usuario → arranca con plan.light_and_finish`, lightSource.startsWith(stripTrailingPeriod(plan.light_and_finish)));
    if (look) check(`${label}: luz del usuario → el look del estilo NO entra (una sola voz)`, !p0.includes(look.slice(0, 40)));
  } else if (look) {
    check(`${label}: con estilo → la luz es el look del estilo TAL CUAL`, light.startsWith(look));
    check(`${label}: con estilo → plan.light_and_finish vacío`, plan.light_and_finish === "");
  } else {
    check(`${label}: sin estilo → la luz es plan.light_and_finish`, lightSource.startsWith(stripTrailingPeriod(plan.light_and_finish)));
  }
  // Ningún OTRO estilo se cuela (ni look ni setting ni lock).
  for (const [id, parts] of Object.entries(STYLE_PARTS)) {
    if (id === ctx.style.styleId) continue;
    if (planSource === "fallback" && id === "estudio_limpio" && !look && !frame.hasRef) continue; // luz default del fallback (spec §2.7)
    if (!p0.includes(parts.look.slice(0, 50)) && !p0.includes(parts.setting.slice(0, 50))) continue;
    check(`${label}: no se cuela el estilo ${id}`, false);
  }
  // Con referencia, el setting del estilo se DESCARTA (la escena es de la referencia).
  if (frame.hasRef && ctx.style.parts) {
    check(`${label}: con referencia el setting del estilo no entra`, !p0.includes(ctx.style.parts.setting.slice(0, 50)));
  }

  // -- COLOR_LOCK con hex por ítem en cuadro.
  const inFrameIds = new Set(plan.items_in_frame.map((f) => f.item_id));
  if (ctx.productBrief) {
    for (const it of ctx.productBrief.items.filter((i) => inFrameIds.has(i.item_id))) {
      const c1 = it.colors[0];
      // v2.1 (F12): el nombre puede ser el de la nota o uno derivado del hex, y la
      // etiqueta puede llevar el hex; lo que no cambia es "la etiqueta … su hex".
      const re = new RegExp(
        `the ${escapeRegExp(it.label)}(?: \\(#[0-9A-F]{6}\\))? stays [^;(]+${c1.hex ? ` \\(approx\\. ${escapeRegExp(c1.hex)}\\)` : ""}`,
      );
      check(`${label}: COLOR_LOCK fija "${it.label}" con su hex`, re.test(light), re.exec(light)?.[0] ?? "");
    }
  } else {
    check(`${label}: sin nota → COLOR_LOCK remite a las fotos`, light.includes("which stay exactly as in Image"));
  }

  // -- CÁMARA: lock adelante (si hay) y la oración de ratio al final.
  const cam = block(p0, "CAMERA AND FORMAT");
  if (frame.effectiveLock) check(`${label}: CAMERA arranca con el lock del estilo`, cam.startsWith(frame.effectiveLock));
  else check(`${label}: sin lock efectivo, CAMERA no trae ningún lock`, Object.values(STYLE_PARTS).every((s) => !s.lock || !cam.includes(s.lock.slice(0, 40))));
  check(`${label}: CAMERA termina con "${RATIO_SENTENCE[ctx.ratio]}"`, cam.endsWith(RATIO_SENTENCE[ctx.ratio]));

  // -- SHOT: ciclo i % 5, MARGIN solo cuando corresponde, y es lo ÚNICO que cambia.
  check(
    `${label}: tomas en ciclo i % 5`,
    batch.shotIndexes.every((idx, i) => idx === i % 5),
    `[${batch.shotIndexes.join(",")}]`,
  );
  prompts.forEach((p, i) => {
    const shot = plan.shot_variations[batch.shotIndexes[i]];
    const wants = shot.full_product_in_frame && frame.lockKind !== "macro";
    const has = block(p, "SHOT").includes("fully inside the frame with a clear margin");
    if (wants !== has) check(`${label}: MARGIN de la imagen ${i + 1} (toma ${batch.shotIndexes[i] + 1})`, false, `espera ${wants}, tiene ${has}`);
  });
  check(`${label}: MARGIN solo en las tomas con full_product_in_frame (y nunca con lock macro)`, true);
  const withoutShot = prompts.map((p) => p.replace(/\nSHOT\n[^\n]*\n/, "\nSHOT\n~\n"));
  check(`${label}: entre imágenes solo cambia el bloque SHOT`, withoutShot.every((p) => p === withoutShot[0]));
  check(`${label}: imagen 1 (y cada 5ª) usa el encuadre base`, prompts.every((p, i) => (i % 5 === 0) === block(p, "SHOT").startsWith("For this image: use the base framing described above.")));

  // -- Nombre del producto, marca y user_prompt crudo: nunca (salvo el fallback).
  const leak = (s: string | undefined) => !!s && s.trim().length >= 4 && prompts.some((p) => p.toLowerCase().includes(s.trim().toLowerCase()));
  check(`${label}: el nombre del producto no llega al prompt de imagen`, !leak(ctx.productName));
  check(`${label}: la marca no llega al prompt de imagen`, !leak(ctx.brand?.name) && !leak(ctx.brand?.description) && !leak(ctx.brand?.industry));
  const up = clean(ctx.userPrompt, LIMITS.userPromptFallback).replace(/"/g, "'");
  if (up) {
    if (planSource === "director") {
      check(`${label}: el user_prompt crudo NO llega (lo traduce el Director)`, !leak(up));
    } else {
      const scene = block(p0, "SCENE");
      check(`${label}: fallback → el user_prompt va citado y acotado SOLO en SCENE`, scene.includes(`"${up}"`) && p0.split(up).length === 2);
    }
  }

  // -- Color de la referencia: solo en la oración de reemplazo (la escribe el código); el hex nunca.
  const ref = refSlot && refSlot.role === "reference" ? ctx.usableRefs[refSlot.refN - 1] : null;
  if (ref && ref.featured_product.present && ref.featured_product.color_name) {
    const name = ref.featured_product.color_name;
    const standIn = roles.split(". ").find((s) => s.includes("stand-in")) ?? "";
    check(`${label}: "${name}" aparece UNA vez, en la oración de reemplazo`, countWord(p0, name) === 1 && countWord(standIn, name) === 1, `veces=${countWord(p0, name)}`);
    if (ref.featured_product.color_hex) check(`${label}: el hex de la referencia nunca llega`, !p0.includes(ref.featured_product.color_hex));
  }

  // -- Higiene de texto.
  const hygiene = prompts.every(
    (p) => !/ {2,}|\.\.|\s\.|\(\s*\)|undefined|null|\[PRODUCT\]|NaN/.test(p) && !/\n\n\n/.test(p),
  );
  check(`${label}: sin dobles espacios, "..", " .", "()", "undefined", "[PRODUCT]"`, hygiene);
}

function printCase(r: Composed, opts: { directorMessage?: boolean; allPrompts?: boolean } = {}): void {
  const { frame, plan, planSource, validation, batch } = r;
  out(`caso=${frame.caseKind}  plan_source=${planSource}  lock=${frame.lockKind ?? "none"}  has_person=${plan.has_person}  light_owner=${plan.light_owner}`);
  if (validation) {
    out(`validación: ${validation.ok ? "OK" : "FALLÓ → fallback"}  repairs=[${validation.repairs.join(", ")}]${validation.ok ? "" : `\n  errores: ${validation.errors.join(" | ")}`}`);
  }
  out(`fotos elegidas (photo_index)=[${batch.selectedPhotos.join(", ")}]  shotIndexes=[${batch.shotIndexes.join(", ")}]`);
  out(`slots: ${batch.slots.map((s) => s.label).join(" ")}`);
  if (opts.directorMessage && frame.directorMessage) {
    out("\n--- mensaje al Director ---");
    out(frame.directorMessage);
  }
  const words = batch.prompts[0].split(/\s+/).length;
  out(`\n--- PROMPT imagen 1 de ${batch.prompts.length} (${words} palabras) ---`);
  out(batch.prompts[0]);
  for (let i = 1; i < batch.prompts.length; i++) {
    if (opts.allPrompts) {
      out(`\n--- PROMPT imagen ${i + 1} ---`);
      out(batch.prompts[i]);
    } else {
      out(`\n--- imagen ${i + 1}: SHOT → ${block(batch.prompts[i], "SHOT")}`);
    }
  }
  out("\n--- chequeos ---");
}

/* -------------------------------------------------------------------------- */
/*  Casos                                                                       */
/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
  out("DRY-RUN pipeline v2 — sin red, sin base de datos, sin key (costo US$0)");
  out(`STYLE_LOCK_OVER_REFERENCE=${STYLE_LOCK_OVER_REFERENCE}`);

  header("0) Notas de fixture (normalizadas por el código real)");
  check("nota toallas: identity_sentence sin punto final", !TOALLAS.items[1].identity_sentence.endsWith("."));
  check("nota cartera: artículo inicial en minúscula (el modelo lo manda en mayúscula)", CARTERA.items[0].identity_sentence.startsWith("a structured"));
  check("nota cartera: hex normalizado a mayúsculas", CARTERA.items[0].colors[0].hex === "#7A4B2E");
  check("nota referencia: template_ok con [PRODUCT]", REF_MUJER.template_ok && REF_MUJER.usable);
  const reverse = resolveStyle(null, STYLES.fondo_color.fragment);
  check("búsqueda inversa del fragment → fondo_color", reverse.styleId === "fondo_color" && reverse.source === "reverse_lookup");
  check("fragment desconocido → sin estilo (se loguea)", resolveStyle(null, "algo que no es un estilo").unmatchedFragment);
  // photo_set_kind tiene que cuadrar con la cantidad de ítems (si no, H2 no mira el set y ROLES se contradice).
  const twoAsMulti = normalizeProductBrief({ ...TOALLAS_RAW, photo_set_kind: "multi_angle" }, 2);
  check(
    "nota: 2 ítems + multi_angle → se concilia a set (y avisa)",
    twoAsMulti.ok && twoAsMulti.value.photo_set_kind === "set" && twoAsMulti.warnings.some((w) => w.startsWith("photo_set_kind_")),
  );
  const oneAsSet = normalizeProductBrief({ ...CARTERA_RAW, photo_set_kind: "set" }, 2);
  check("nota: 1 ítem + set con 2 fotos → multi_angle", oneAsSet.ok && oneAsSet.value.photo_set_kind === "multi_angle");
  const oneAsSetOnePhoto = normalizeProductBrief({ ...CARTERA_RAW, photos: [CARTERA_RAW.photos[0]], photo_set_kind: "set" }, 1);
  check("nota: 1 ítem + set con 1 foto → single", oneAsSetOnePhoto.ok && oneAsSetOnePhoto.value.photo_set_kind === "single");
  // El hash de contenido del plan necesita que re-normalizar una nota guardada no la cambie.
  const reToallas = must(normalizeProductBrief(JSON.parse(JSON.stringify(TOALLAS)), 2), "re-normalizar toallas");
  check("nota: re-normalizar la nota guardada no la cambia (mismo hash de contenido)", noteContentHash(reToallas) === noteContentHash(TOALLAS));
  const reRef = must(normalizeReferenceBrief(JSON.parse(JSON.stringify(REF_MUJER))), "re-normalizar referencia");
  check("nota de referencia: re-normalizarla no la cambia", noteContentHash(reRef) === noteContentHash(REF_MUJER));

  /* 1) ref_and_style, editorial_premium, 1:1, imágenes 1 y 2 ----------------- */
  header("1) ref_and_style · editorial_premium · 1:1 · N=2  (Toallas 2, spec §2.8)");
  const c1ctx = ctxOf({ brief: TOALLAS, refs: [REF_MUJER], style: resolveStyle("editorial_premium"), variations: 2 });
  const c1 = composeV2(c1ctx, PLAN_TOALLAS_EDITORIAL);
  printCase(c1, { directorMessage: true, allPrompts: true });
  check("1: el plan de la spec pasa el validador sin reparaciones", c1.validation?.ok === true && c1.validation.repairs.length === 0, c1.validation?.repairs.join(","));
  check("1: prompt 1 == ejemplo de la spec §2.8 BYTE A BYTE", c1.batch.prompts[0] === EXPECTED_TOALLAS_1);
  if (c1.batch.prompts[0] !== EXPECTED_TOALLAS_1) {
    const a = c1.batch.prompts[0].split("\n");
    const b = EXPECTED_TOALLAS_1.split("\n");
    for (let k = 0; k < Math.max(a.length, b.length); k++) if (a[k] !== b[k]) out(`    got: ${a[k]}\n    exp: ${b[k]}`);
  }
  check("1: prompt 2 == spec (solo cambia SHOT, sin MARGIN)", block(c1.batch.prompts[1], "SHOT") === EXPECTED_TOALLAS_2_SHOT);
  check("1: el Director NO ve identity_sentence ni hex del producto", !!c1.frame.directorMessage && !c1.frame.directorMessage.includes("#A6D8EA") && !c1.frame.directorMessage.includes("#8FCFE0") && !c1.frame.directorMessage.includes("spongy thickness"));
  check("1: el Director SÍ ve nombre y marca (dentro de sus tags)", !!c1.frame.directorMessage?.includes(`<product_name>${TOALLAS_NAME}</product_name>`) && !!c1.frame.directorMessage?.includes("name: Casa Nube"));
  const refNote1 = JSON.parse(/<reference n="1">(.*)<\/reference>/.exec(c1.frame.directorMessage ?? "")?.[1] ?? "{}") as {
    palette?: Array<{ name: string; hex: string }>;
  };
  check(
    "1: la paleta que ve el Director NO trae el color del producto de stock (y conserva el resto)",
    !!refNote1.palette && refNote1.palette.every((p) => p.name !== "royal blue" && p.hex !== "#1F4FA8") && refNote1.palette.some((p) => p.name === "white"),
    JSON.stringify(refNote1.palette),
  );
  checkRules("1", c1ctx, c1);

  // Parts reales de la llamada: etiquetas intercaladas (variante A) y sin etiquetas (variante B).
  const img = (tag: string): InlineImage => ({ url: `https://x/${tag}.jpg`, mimeType: "image/jpeg", data: tag, bytes: 1 });
  const imgs = { productPhotos: [img("PHOTO1"), img("PHOTO2")], refs: [img("REF1")] };
  const partsA = buildImageParts(c1.batch, 0, imgs);
  const seqA = partsA.map((p) => ("text" in p && p.text ? (p.text.length > 40 ? "<PROMPT>" : p.text) : `[${"inlineData" in p ? p.inlineData?.data : "?"}]`));
  out(`  parts variante A: ${seqA.join(" · ")}`);
  check(
    "1: parts A = etiqueta+foto por slot y el prompt al final",
    JSON.stringify(seqA) === JSON.stringify(["Image 1: product photo.", "[PHOTO1]", "Image 2: product photo.", "[PHOTO2]", "Image 3: scene reference.", "[REF1]", "<PROMPT>"]),
  );
  const seqB = buildImageParts(c1.batch, 1, imgs, { labels: false }).map((p) => ("text" in p && p.text ? "<PROMPT>" : "[img]"));
  check("1: parts B (A/B sin etiquetas) = mismas imágenes, sin etiquetas", JSON.stringify(seqB) === JSON.stringify(["[img]", "[img]", "[img]", "<PROMPT>"]));
  let threw = false;
  try {
    buildImageParts(c1.batch, 0, { productPhotos: [img("PHOTO1")], refs: [img("REF1")] });
  } catch {
    threw = true;
  }
  check("1: si falta una imagen, falla en vez de correr la numeración", threw);

  /* 2) ref_only ---------------------------------------------------------------- */
  header("2) ref_only · sin estilo · 1:1 · N=5  (Toallas 2 + referencia)");
  const c2ctx = ctxOf({ brief: TOALLAS, refs: [REF_MUJER], style: NO_STYLE });
  const c2 = composeV2(c2ctx, PLAN_TOALLAS_REF_ONLY);
  printCase(c2);
  check("2: plan válido", c2.validation?.ok === true, c2.validation && !c2.validation.ok ? c2.validation.errors.join(" | ") : "");
  check("2: ROLES pide a la referencia también la luz y el color", block(c2.batch.prompts[0], "IMAGE ROLES").includes("use it for the setting, the composition and camera angle, the light and the color mood"));
  checkRules("2", c2ctx, c2);

  /* 3) style_only, fondo_color --------------------------------------------------- */
  header("3) style_only · fondo_color · 1:1 · N=5  (Cartera, spec §2.8)");
  const c3ctx = ctxOf({ brief: CARTERA, style: resolveStyle("fondo_color"), productName: CARTERA_NAME, brand: { name: "Luna" } });
  const c3 = composeV2(c3ctx, PLAN_CARTERA_FONDO);
  printCase(c3);
  check("3: plan válido sin reparaciones", c3.validation?.ok === true && c3.validation.repairs.length === 0, c3.validation?.repairs.join(","));
  check("3: prompt 1 == ejemplo de la spec §2.8 BYTE A BYTE", c3.batch.prompts[0] === EXPECTED_CARTERA_1);
  if (c3.batch.prompts[0] !== EXPECTED_CARTERA_1) {
    const a = c3.batch.prompts[0].split("\n");
    const b = EXPECTED_CARTERA_1.split("\n");
    for (let k = 0; k < Math.max(a.length, b.length); k++) if (a[k] !== b[k]) out(`    got: ${a[k]}\n    exp: ${b[k]}`);
  }
  checkRules("3", c3ctx, c3);

  /* 4) none --------------------------------------------------------------------- */
  header("4) none · sin referencia ni estilo · 4:5 · N=5  (Cartera)");
  const c4ctx = ctxOf({ brief: CARTERA, style: NO_STYLE, ratio: "4:5", productName: CARTERA_NAME });
  const c4 = composeV2(c4ctx, PLAN_CARTERA_NONE);
  printCase(c4);
  check("4: plan válido", c4.validation?.ok === true, c4.validation && !c4.validation.ok ? c4.validation.errors.join(" | ") : "");
  checkRules("4", c4ctx, c4);

  /* 5) ref_and_style con flat_lay (lock) ---------------------------------------- */
  header("5) ref_and_style · flat_lay (lock cenital) · 1:1 · N=5  (Toallas 2 + referencia)");
  const c5ctx = ctxOf({ brief: TOALLAS, refs: [REF_MUJER], style: resolveStyle("flat_lay") });
  const c5 = composeV2(c5ctx, PLAN_TOALLAS_FLATLAY);
  printCase(c5, { directorMessage: true });
  check("5: plan válido", c5.validation?.ok === true, c5.validation && !c5.validation.ok ? c5.validation.errors.join(" | ") : "");
  check("5: lock efectivo (STYLE_LOCK_OVER_REFERENCE) y del tipo overhead", c5.frame.effectiveLock === STYLE_PARTS.flat_lay.lock && c5.frame.lockKind === "overhead");
  check("5: ROLES con lock → la referencia NO manda en cámara", block(c5.batch.prompts[0], "IMAGE ROLES").includes("use it only for the place, the surfaces and the props; not for its camera angle, light or colors."));
  check("5: el Director recibe la fila de cámara del lock", !!c5.frame.directorMessage?.includes("camera angle and framing: style camera lock"));
  const roles5 = block(c5.batch.prompts[0], "IMAGE ROLES");
  check("5: con lock, TASK_LINE NO manda 'in place of the product shown there'", !c5.batch.prompts[0].split("\n")[0].includes("in place of"));
  check(
    "5: con lock, el stand-in remite a SCENE (nunca 'in their place': ese lugar era el cuerpo de la mujer)",
    roles5.includes("replace them, arranged as described in SCENE, in their own colors") && !roles5.includes("in their place"),
  );
  checkRules("5", c5ctx, c5);

  /* 5b) sin lock, pero el plan saca a la persona ----------------------------------- */
  header("5b) ref_and_style · editorial_premium SIN lock · el plan saca a la persona · 1:1 · N=5");
  const PLAN_SIN_PERSONA: Plan = {
    ...structuredClone(PLAN_TOALLAS_EDITORIAL),
    conflicts: [PLAN_TOALLAS_EDITORIAL.conflicts[2]],
    items_in_frame: [
      { item_id: "B", units: 1 },
      { item_id: "A", units: 1 },
    ],
    has_person: false,
    person_description: "",
    product_placement:
      "The light-blue microfiber towel lies folded on the white floating shelf, and the light-blue textured flat textile lies folded beside it, textured face up.",
    scene_paragraph: "White square bathroom tiles line the wall behind a single white floating shelf, with open wall space above it.",
    allowed_objects: ["the white tiled wall", "the white floating shelf"],
    light_placement: "The key light comes from the left, catching the folds of both items while the tiled wall falls away.",
    camera: "Eye-level medium shot of the shelf, both items centered on it, sharp focus on the towel folds.",
    shot_variations: [
      { label: "base", instruction: "Use the base framing described above.", full_product_in_frame: true },
      { label: "closer", instruction: "Move closer so both folded items fill most of the frame.", full_product_in_frame: true },
      { label: "left", instruction: "Move the camera about 30 degrees to the left, same height and distance.", full_product_in_frame: true },
      { label: "higher", instruction: "Raise the camera to look down about 20 degrees onto the shelf.", full_product_in_frame: true },
      { label: "detail", instruction: "Close crop on the folded edges where both textures meet.", full_product_in_frame: false },
    ],
    summary_es: "Las dos piezas dobladas en el estante, sin persona.",
  };
  const c5b = composeV2(c1ctx, PLAN_SIN_PERSONA);
  printCase(c5b);
  const roles5b = block(c5b.batch.prompts[0], "IMAGE ROLES");
  check("5b: plan válido", c5b.validation?.ok === true, c5b.validation && !c5b.validation.ok ? c5b.validation.errors.join(" | ") : "");
  check("5b: sin persona, TASK_LINE sin 'in place of' y stand-in remite a SCENE", !c5b.batch.prompts[0].split("\n")[0].includes("in place of") && roles5b.includes("arranged as described in SCENE"));
  check("5b: ROLES no pide a la persona", !/person/i.test(roles5b));
  checkRules("5b", { ...c1ctx, variations: 5 }, c5b);

  /* 6) 9:16 con referencia ------------------------------------------------------- */
  header("6) ref_and_style · lifestyle · 9:16 · N=5  (story con referencia)");
  const c6ctx = ctxOf({ brief: TOALLAS, refs: [REF_MUJER], style: resolveStyle("lifestyle"), ratio: "9:16" });
  const c6 = composeV2(c6ctx, PLAN_TOALLAS_STORY);
  printCase(c6);
  check("6: plan válido", c6.validation?.ok === true, c6.validation && !c6.validation.ok ? c6.validation.errors.join(" | ") : "");
  check("6: el Director recibe la regla de formato de la story", !!c6.frame.directorMessage?.includes("<format>9:16: Full-screen vertical story: product and any face in the central area, clear of the top 15% and the bottom 20% of the frame.</format>"));
  checkRules("6", c6ctx, c6);

  /* 7) user_prompt que pide otra luz -------------------------------------------- */
  header("7) ref_and_style · editorial_premium · user_prompt pide OTRA luz · 1:1 · N=5");
  const c7ctx = ctxOf({ brief: TOALLAS, refs: [REF_MUJER], style: resolveStyle("editorial_premium"), userPrompt: USER_LIGHT_PROMPT });
  const c7 = composeV2(c7ctx, PLAN_TOALLAS_USERLIGHT);
  printCase(c7);
  check("7: plan válido, sin forzar la luz del estilo", c7.validation?.ok === true && !c7.validation.repairs.includes("R4:luz_del_estilo"), c7.validation?.repairs.join(","));
  check("7: el user_prompt llega SOLO al Director, en <user_instructions>", !!c7.frame.directorMessage?.includes(`<user_instructions>${USER_LIGHT_PROMPT}</user_instructions>`));
  check("7: el look low-key del estilo no aparece", !c7.batch.prompts[0].includes("Dramatic low-key"));
  checkRules("7", c7ctx, c7);

  // 7b) Regresión: el Director reclama la luz para el usuario pero NO la escribe.
  out("\n  7b) regresión: light_owner=user_instructions con light_and_finish vacío");
  const emptyUserLight: Plan = { ...structuredClone(PLAN_TOALLAS_USERLIGHT), light_and_finish: "" };
  const c7b = composeV2(c7ctx, emptyUserLight);
  const light7b = block(c7b.batch.prompts[0], "LIGHT AND FINISH").split("Light and grading never change")[0].trim();
  out(`      → plan_source=${c7b.planSource} light_owner=${c7b.plan.light_owner} repairs=[${c7b.validation?.repairs.join(", ")}] luz="${light7b.slice(0, 70)}…"`);
  check("7b: con estilo, la luz vacía del usuario se repara al look del estilo (nunca un bloque de luz vacío)", c7b.planSource === "director" && c7b.plan.light_owner === "style" && light7b.startsWith("Dramatic low-key"));
  const c7c = validatePlan(
    { ...structuredClone(PLAN_TOALLAS_USERLIGHT), light_and_finish: "", light_placement: "" },
    { productBrief: TOALLAS, usableRefs: [REF_MUJER], hasStyle: false, lockKind: null, userPrompt: USER_LIGHT_PROMPT, productName: TOALLAS_NAME, brandName: BRAND.name ?? "" },
  );
  check("7c: sin estilo, luz del usuario vacía → H7 (reintento / fallback)", !c7c.ok && c7c.errors.some((e) => e.startsWith("H7")), c7c.ok ? "pasó" : c7c.errors.join(" | "));

  /* 8) fallback sin Director ----------------------------------------------------- */
  header("8a) FALLBACK sin Director · CON nota · ref_and_style editorial_premium · 1:1");
  const c8a = composeV2(c1ctx);
  printCase(c8a);
  check("8a: plan_source fallback", c8a.planSource === "fallback");
  check("8a: el ítem de confianza baja NO ocupa un [PRODUCT] (no termina de turbante)", !/textured flat textile twisted|textured flat textile wrapped/.test(c8a.batch.prompts[0]));
  // v2.1: SCENE arranca con la modelo nueva (F2) y la persona del template pasa a
  // "The model"; el resto de la escena sigue saliendo del template.
  check(
    "8a: la escena sale del scene_template de la referencia",
    block(c8a.batch.prompts[0], "SCENE").includes("The model stands in profile in a bathroom lined with white square tiles"),
  );
  check(
    "8a: el ítem de confianza baja se describe por su estado físico, no por la vista de cámara de su foto",
    block(c8a.batch.prompts[0], "SCENE").includes("keeps the same resting shape it has in its product photo") &&
      !block(c8a.batch.prompts[0], "SCENE").includes("(flat, top view)"),
  );
  checkRules("8a", c1ctx, c8a);

  header("8b) FALLBACK sin Director · SIN nota del producto · ref_and_style editorial_premium · 1:1");
  const c8bctx = ctxOf({ brief: null, refs: [REF_MUJER], style: resolveStyle("editorial_premium") });
  const c8b = composeV2(c8bctx);
  printCase(c8b);
  check("8b: sin nota no hay mensaje al Director", c8b.frame.directorMessage === null);
  // v2.2 (G3), cambio a propósito: el bloque de la spec ("Images 1 and 2 show the
  // product being sold. Reproduce it exactly…", en singular) fue la receta del
  // híbrido mat+toalla de v1. Ahora cada foto va por su ordinal.
  check(
    "8b: bloque PRODUCT sin nota (G3: un ítem por ordinal, cada uno una vez, texto letra por letra)",
    block(c8b.batch.prompts[0], "PRODUCT (reproduce exactly as photographed)") ===
      "Image 1 shows a product item; Image 2 shows a product item. If they show different items, each item appears exactly once, separately, exactly as photographed; if they show the same item from different angles, that item appears once. Every item keeps the shape, proportions, colors, material and texture of its photos. Any printed text or logo on the product is copied letter by letter from the photos.",
  );
  // Regresión: sin nota, la 2ª unidad del template salía "a second product", que se
  // lee como OTRO producto y contradice el KEEP OUT ("The only product… is the seller's").
  // v2.1 (F3), cambio a propósito: ya no hay unidad extra en absoluto; la cláusula
  // del [PRODUCT] sobrante (el turbante) sale del template.
  const scene8b = block(c8b.batch.prompts[0], "SCENE");
  check(
    "8b: el [PRODUCT] sobrante del template se va entero (sin 'a second', sin turbante)",
    !/\ba second\b|turban/.test(scene8b) && scene8b.includes("wearing the product wrapped around her body, with a white floating shelf"),
    scene8b,
  );
  checkRules("8b", c8bctx, c8b);

  header("8c) FALLBACK sin Director · CON nota · none · user_prompt citado · 1:1");
  const c8cctx = ctxOf({ brief: CARTERA, style: NO_STYLE, productName: CARTERA_NAME, userPrompt: 'Fondo de madera clara, que se vea el cierre "dorado"' });
  const c8c = composeV2(c8cctx);
  printCase(c8c);
  check("8c: luz default = look de estudio_limpio (spec §2.7)", block(c8c.batch.prompts[0], "LIGHT AND FINISH").startsWith(STYLE_PARTS.estudio_limpio.look));
  check("8c: la cámara default no dice 'centered'", !block(c8c.batch.prompts[0], "CAMERA AND FORMAT").includes("centered"));
  check("8c: la toma 2 no repite la vista de tres cuartos que ya tiene la base", !block(c8c.batch.prompts[1], "SHOT").includes("three-quarter"));
  checkRules("8c", c8cctx, c8c);

  out("\n  8c2) fallback · style_only lifestyle: el setting dice off-center");
  const c8c2ctx = ctxOf({ brief: CARTERA, style: resolveStyle("lifestyle"), productName: CARTERA_NAME });
  const c8c2 = composeV2(c8c2ctx);
  check(
    "8c2: SCENE pide off-center y CAMERA ya no pide 'centered' (sin órdenes opuestas)",
    block(c8c2.batch.prompts[0], "SCENE").includes("off-center") && !block(c8c2.batch.prompts[0], "CAMERA AND FORMAT").includes("centered"),
  );
  checkRules("8c2", c8c2ctx, c8c2);

  header("8d) FALLBACK sin Director · SIN nota · macro_detalle (lock macro) · 9:16 · N=6 · 7 fotos");
  const c8dctx = ctxOf({ brief: null, style: resolveStyle("macro_detalle"), ratio: "9:16", variations: 6, photos: 7 });
  const c8d = composeV2(c8dctx);
  printCase(c8d);
  check("8d: sin nota → primeras 6 fotos", JSON.stringify(c8d.batch.selectedPhotos) === "[1,2,3,4,5,6]");
  check("8d: el producto es 'sujeto del primer plano', no 'shown whole'", !c8d.batch.prompts[0].includes("shown whole"));
  checkRules("8d", c8dctx, c8d);

  header("8e) Plan del Director que NO pasa el validador → fallback (nunca v1)");
  const badForRoute: Plan = { ...structuredClone(PLAN_TOALLAS_EDITORIAL), scene_paragraph: "A woman in a bathroom with royal blue towels on the shelf." };
  const c8e = composeV2(c1ctx, badForRoute);
  out(`  plan_source=${c8e.planSource}  errores=${c8e.validation && !c8e.validation.ok ? c8e.validation.errors.join(" | ") : "-"}`);
  check("8e: plan inválido → plan_source fallback", c8e.planSource === "fallback");

  header("8f) FALLBACK · la nota de referencia nombra el color de SU producto en framing (template no usable)");
  const REF_COLOR_FRAMING = must(
    normalizeReferenceBrief({
      ...REF_MUJER_RAW,
      composition: {
        ...REF_MUJER_RAW.composition,
        framing: "A woman wrapped in a royal blue bath towel with a matching turban, framed from head to knees",
      },
      scene_template: "A woman stands in profile in a bathroom lined with white square tiles, with a white floating shelf behind her.",
    }),
    "ref con color en framing",
  );
  const c8fctx = ctxOf({ brief: TOALLAS, refs: [REF_COLOR_FRAMING], style: resolveStyle("editorial_premium") });
  const c8f = composeV2(c8fctx);
  printCase(c8f);
  const scene8f = block(c8f.batch.prompts[0], "SCENE");
  const cam8f = block(c8f.batch.prompts[0], "CAMERA AND FORMAT");
  // v2.1: SCENE arranca con "The model is …" (F2); después, location + framing.
  check(
    "8f: el template sin [PRODUCT] no es usable (template_ok=false) → SCENE = location + framing",
    !REF_COLOR_FRAMING.template_ok && scene8f.includes("Bathroom lined with white square tiles"),
  );
  check("8f: ni SCENE ni CAMERA nombran 'royal blue' (H4 también para el fallback)", !/royal blue/i.test(scene8f) && !/royal blue/i.test(cam8f), cam8f);
  check("8f: la parte del framing sin el color sobrevive", /framed from head to knees/i.test(cam8f) && /framed from head to knees/i.test(scene8f));
  checkRules("8f", c8fctx, c8f);

  header("8g) FALLBACK · ref_and_style · producto_flotando (lock de levitación) · referencia con persona");
  const c8gctx = ctxOf({ brief: TOALLAS, refs: [REF_MUJER], style: resolveStyle("producto_flotando") });
  const c8g = composeV2(c8gctx);
  printCase(c8g);
  const scene8g = block(c8g.batch.prompts[0], "SCENE");
  const roles8g = block(c8g.batch.prompts[0], "IMAGE ROLES");
  check("8g: con lock + persona NO se usa el template (nadie viste un producto que levita)", !/wearing|woman|turban/i.test(scene8g), scene8g.slice(0, 90));
  check("8g: la escena es el lugar + las superficies de la referencia", scene8g.startsWith("Bathroom lined with white square tiles and a white floating shelf. Glossy white square ceramic tiles"));
  check("8g: la persona sale del plan y ROLES no la pide", c8g.plan.has_person === false && !/person/i.test(roles8g));
  check("8g: TASK_LINE sin 'in place of' y stand-in remite a SCENE", !c8g.batch.prompts[0].split("\n")[0].includes("in place of") && roles8g.includes("arranged as described in SCENE"));
  checkRules("8g", c8gctx, c8g);

  /* 9) 7 variaciones --------------------------------------------------------------- */
  header("9) style_only · fondo_color · N=7 (i % 5)");
  const c9ctx = ctxOf({ brief: CARTERA, style: resolveStyle("fondo_color"), variations: 7, productName: CARTERA_NAME });
  const c9 = composeV2(c9ctx, PLAN_CARTERA_FONDO);
  printCase(c9);
  check("9: shotIndexes = [0,1,2,3,4,0,1]", JSON.stringify(c9.batch.shotIndexes) === "[0,1,2,3,4,0,1]");
  check("9: imagen 6 == imagen 1 e imagen 7 == imagen 2 (byte a byte)", c9.batch.prompts[5] === c9.batch.prompts[0] && c9.batch.prompts[6] === c9.batch.prompts[1]);
  checkRules("9", c9ctx, c9);

  /* 10) set reducido por el user_prompt → renumeración de ordinales ---------------- */
  header("10) set · el user_prompt deja SOLO la toalla (foto 2) → pasa a ser Image 1 · estudio_limpio");
  const ONLY_TOWEL_PROMPT = "Solo la toalla de microfibra, sin el otro textil.";
  const c10ctx = ctxOf({ brief: TOALLAS, style: resolveStyle("estudio_limpio"), userPrompt: ONLY_TOWEL_PROMPT });
  const PLAN_SOLO_TOALLA: Plan = {
    ...structuredClone(PLAN_CARTERA_FONDO),
    purpose: "for a home-textiles shop's product page",
    items_in_frame: [{ item_id: "B", units: 1 }],
    product_placement: "The light-blue microfiber towel lies folded in a neat rectangle at the center of the frame, its hem facing the camera.",
    scene_paragraph: "A pure white seamless background curves from floor to wall, with generous negative space around the folded towel.",
    allowed_objects: ["the white seamless background"],
    light_placement: "The softbox sits above and front-left, giving the pile a gentle sheen and a faint contact shadow under the fold.",
    camera: "Slightly elevated three-quarter view, the folded towel centered and filling about half of the frame, in sharp focus across the pile.",
    shot_variations: [
      { label: "base", instruction: "Use the base framing described above.", full_product_in_frame: true },
      { label: "left", instruction: "Move the camera about 30 degrees to the left, same height and distance.", full_product_in_frame: true },
      { label: "closer", instruction: "Move closer so the folded edge and the pile fill most of the frame.", full_product_in_frame: false },
      { label: "overhead", instruction: "Raise the camera to look straight down on the fold.", full_product_in_frame: true },
      { label: "wider", instruction: "Step back for a wider framing with more white space around the towel.", full_product_in_frame: true },
    ],
    user_instructions_applied: "Only the microfiber towel is shown.",
    summary_es: "Solo la toalla de microfibra doblada sobre blanco.",
  };
  const c10 = composeV2(c10ctx, PLAN_SOLO_TOALLA);
  printCase(c10);
  check("10: set sin un ítem pasa H2 porque lo pidió el usuario", c10.validation?.ok === true, c10.validation && !c10.validation.ok ? c10.validation.errors.join(" | ") : "");
  check("10: solo se manda la foto 2 (la del ítem en cuadro)", JSON.stringify(c10.batch.selectedPhotos) === "[2]");
  check("10: la foto 2 se renumera como Image 1 en PRODUCT", block(c10.batch.prompts[0], "PRODUCT (reproduce exactly as photographed)").startsWith("The light-blue microfiber towel (Image 1):"));
  check("10: ROLES en singular (P = 1)", block(c10.batch.prompts[0], "IMAGE ROLES") === "Image 1 shows the product being sold (bath towels); it is the only source for how the product looks.");
  check("10: el ítem fuera de cuadro no aparece en ningún lado", !c10.batch.prompts[0].includes("textured flat textile"));
  const parts10 = buildImageParts(c10.batch, 0, { productPhotos: [img("PHOTO1"), img("PHOTO2")], refs: [] });
  check("10: la Image 1 que viaja es la foto 2 (PHOTO2)", "inlineData" in parts10[1] && parts10[1].inlineData?.data === "PHOTO2");
  checkRules("10", c10ctx, c10);

  /* 11) referencia secundaria → Image P+2 --------------------------------------------- */
  header("11) ref_and_style · editorial_premium · referencia SECUNDARIA → Image P+2");
  const REF_TABURETE = must(
    normalizeReferenceBrief({
      usable: true,
      image_kind: "scene_without_person",
      scene: { location: "bathroom corner with a small wooden stool", surfaces_and_materials: "white tiles, oiled teak wood", props: ["small teak stool"] },
      composition: { shot_type: "medium", camera_angle: "eye level, front", framing: "stool centered", depth_of_field: "deep", orientation: "portrait" },
      person: { present: false, count: 0, description: "", pose_and_action: "", interaction_with_product: "" },
      featured_product: { present: false, category: "", category_plural: "", color_name: "", color_hex: "", units: 0, units_and_placement: "", frame_share: "small" },
      lighting: "Even soft daylight.",
      palette: [{ name: "teak", hex: "#8A5A36" }],
      mood: "calm",
      scene_template: "A small teak stool stands in the corner of a white tiled bathroom.",
      do_not_copy: [],
      contains_instruction_like_text: false,
      summary_es: "Rincón de baño con banquito de teca.",
    }),
    "ref taburete",
  );
  const c11ctx = ctxOf({ brief: TOALLAS, refs: [REF_MUJER, REF_TABURETE], style: resolveStyle("editorial_premium"), variations: 1 });
  const PLAN_SECUNDARIA: Plan = {
    ...structuredClone(PLAN_TOALLAS_EDITORIAL),
    secondary_reference: 2,
    secondary_use: "the small teak stool beside her",
    scene_paragraph: `${PLAN_TOALLAS_EDITORIAL.scene_paragraph} A small teak stool stands beside her.`,
    allowed_objects: [...PLAN_TOALLAS_EDITORIAL.allowed_objects, "a small teak stool"],
  };
  const c11 = composeV2(c11ctx, PLAN_SECUNDARIA);
  printCase(c11);
  check(
    "11: slots = 2 fotos + Image 3 escena + Image 4 secundaria",
    JSON.stringify(c11.batch.slots.map((s) => s.label)) ===
      JSON.stringify(["Image 1: product photo.", "Image 2: product photo.", "Image 3: scene reference.", "Image 4: supporting reference."]),
  );
  check("11: ROLES nombra la secundaria por ordinal", block(c11.batch.prompts[0], "IMAGE ROLES").includes("Image 4 is a supporting reference, used only for the small teak stool beside her."));
  const seq11 = buildImageParts(c11.batch, 0, { productPhotos: [img("PHOTO1"), img("PHOTO2")], refs: [img("REF1"), img("REF2")] })
    .map((p) => ("inlineData" in p ? p.inlineData?.data : null))
    .filter(Boolean);
  check("11: las imágenes viajan como PHOTO1, PHOTO2, REF1, REF2", JSON.stringify(seq11) === JSON.stringify(["PHOTO1", "PHOTO2", "REF1", "REF2"]));
  checkRules("11", c11ctx, c11);
  const sameAsPrimary = composeV2(c11ctx, { ...structuredClone(PLAN_SECUNDARIA), secondary_reference: 1 });
  check("11: secundaria = principal → R6 la saca (sin Image 4)", !!sameAsPrimary.validation?.repairs.includes("R6:secondary_reference_a_0") && sameAsPrimary.batch.slots.length === 3);

  /* V) Validador contra 3 planes malos ------------------------------------------- */
  header("V) Validador contra 4 planes malos (Toallas 2, ref_and_style editorial_premium)");
  const vctx = c1.frame.validationCtx;
  if (!vctx) throw new Error("sin validationCtx");
  const bads: Array<{ name: string; code: string; plan: Plan }> = [
    {
      name: "V1 color de la referencia en la escena",
      code: "H4",
      plan: {
        ...structuredClone(PLAN_TOALLAS_EDITORIAL),
        scene_paragraph:
          "A woman in her late twenties stands in profile in a bathroom lined with white square tiles, with a royal blue bath mat on the floor and a white floating shelf on the wall behind her.",
      },
    },
    {
      name: "V2 palabras de luz en scene_paragraph",
      code: "H5",
      plan: {
        ...structuredClone(PLAN_TOALLAS_EDITORIAL),
        scene_paragraph:
          "A woman in her late twenties stands in profile in a bathroom lined with white square tiles, softly lit by window light, with long shadows across the white floating shelf behind her.",
      },
    },
    {
      name: "V3 item_id inexistente",
      code: "H2",
      plan: { ...structuredClone(PLAN_TOALLAS_EDITORIAL), items_in_frame: [...PLAN_TOALLAS_EDITORIAL.items_in_frame, { item_id: "C", units: 1 }] },
    },
    {
      name: "V4 token [PRODUCT] copiado del template de la referencia",
      code: "H8",
      plan: {
        ...structuredClone(PLAN_TOALLAS_EDITORIAL),
        scene_paragraph:
          "A woman in her late twenties stands in profile in a bathroom lined with white square tiles, wearing [PRODUCT] wrapped around her body, with a white floating shelf on the wall behind her.",
      },
    },
  ];
  for (const b of bads) {
    const v = validatePlan(b.plan, vctx);
    out(`  ${b.name}: ${v.ok ? "PASÓ (mal)" : v.errors.join(" | ")}`);
    check(`${b.name} → lo detecta ${b.code}`, !v.ok && v.errors.some((e) => e.startsWith(b.code)));
    check(`${b.name} → termina en fallback`, composeV2(c1ctx, b.plan).planSource === "fallback");
  }
  // Controles: lo que NO tiene que disparar.
  const lightBlue = validatePlan(PLAN_TOALLAS_EDITORIAL, vctx);
  check("control: 'light-blue' en las etiquetas no dispara H5 ni H4", lightBlue.ok);
  const whiteRef = must(normalizeReferenceBrief({ ...REF_MUJER_RAW, featured_product: { ...REF_MUJER_RAW.featured_product, color_name: "white" } }), "ref blanca");
  check("control: color de la referencia que también es del entorno ('white tiles') no dispara H4", validatePlan(PLAN_TOALLAS_EDITORIAL, { ...vctx, usableRefs: [whiteRef] }).ok);

  /* 12) Cache del plan: hash por CONTENIDO + overwrite + cupo de notas --------------- */
  header("12) Cache del plan (hash por CONTENIDO de las notas) + overwrite + cupo de notas");
  // La carrera after()/lazy: dos notas con los MISMOS insumos y etiquetas distintas
  // (temperatura 1.0). Antes compartían la clave del plan y el plan de una se
  // servía con la otra → H3 en cada tanda, Director pago cada vez, para siempre.
  const TOALLAS_Y = must(
    normalizeProductBrief(
      { ...TOALLAS_RAW, items: [TOALLAS_RAW.items[0], { ...TOALLAS_RAW.items[1], label: "light blue microfiber bath towel" }] },
      2,
    ),
    "nota Y",
  );
  const phBase = { styleId: "editorial_premium", ratio: "1:1", userPrompt: "", productName: TOALLAS_NAME, brand: BRAND };
  const phX = planHash({ ...phBase, productNoteHash: noteContentHash(TOALLAS), refNoteHashes: [noteContentHash(REF_MUJER)] });
  const phY = planHash({ ...phBase, productNoteHash: noteContentHash(TOALLAS_Y), refNoteHashes: [noteContentHash(REF_MUJER)] });
  check("12: mismos insumos, etiquetas distintas → planHash distinto (el plan de Y nunca se sirve con X)", phX !== phY);
  check(
    "12: la misma nota con las claves en otro orden (jsonb) → mismo planHash",
    phX === planHash({ ...phBase, productNoteHash: noteContentHash(reverseKeys(TOALLAS)), refNoteHashes: [noteContentHash(reverseKeys(REF_MUJER))] }),
  );
  const planY: Plan = {
    ...structuredClone(PLAN_TOALLAS_EDITORIAL),
    product_placement: PLAN_TOALLAS_EDITORIAL.product_placement.replace(/light-blue microfiber towel/g, "light blue microfiber bath towel"),
  };
  const vY = validatePlan(planY, vctx);
  check("12: (por qué) el plan armado con Y no valida contra X — H3", !vY.ok && vY.errors.some((e) => e.startsWith("H3")));
  const mem = createMemoryStore();
  const planRow = (plan: Plan) => ({ versionId: "v1", userId: "u", inputsHash: "h", plan });
  await mem.putPlan(planRow(PLAN_TOALLAS_EDITORIAL));
  await mem.putPlan(planRow(planY));
  check("12: sin overwrite gana la primera escritura (on conflict do nothing)", JSON.stringify(await mem.getPlan("v1", "h")) === JSON.stringify(PLAN_TOALLAS_EDITORIAL));
  await mem.putPlan(planRow(planY), { overwrite: true });
  check("12: con overwrite (el cacheado ya no validaba) se pisa", JSON.stringify(await mem.getPlan("v1", "h")) === JSON.stringify(planY));
  const g1 = await mem.reserveBriefQuota("u", 38, 40);
  const g2 = await mem.reserveBriefQuota("u", 5, 40);
  const g3 = await mem.reserveBriefQuota("u", 1, 40);
  const gOther = await mem.reserveBriefQuota("otro", 1, 40);
  check("12: el cupo se RESERVA por intentos: 38 → 38, 5 → 2 (parcial), 1 → 0; otro usuario aparte", g1 === 38 && g2 === 2 && g3 === 0 && gOther === 1, `${g1},${g2},${g3},${gOther}`);

  /* 13) Allowlist de URLs (SSRF) ------------------------------------------------------- */
  header("13) Allowlist de URLs de imágenes (SSRF): solo el Supabase configurado y sus buckets");
  const prevSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
  const SB = "https://abc.supabase.co/storage/v1/object";
  const allowed = [
    `${SB}/sign/product-uploads/user_1/p1/a.jpg?token=t`,
    `${SB}/sign/references-uploads/user_1/v1/b.png?token=t`,
    `${SB}/public/starter-references/cafe/1.jpg`,
  ];
  const rejected = [
    "http://127.0.0.1:9001/x.jpg",
    "http://10.0.0.5:8080/",
    "https://evil.com/storage/v1/object/sign/product-uploads/a.jpg",
    "https://abc.supabase.co.evil.com/storage/v1/object/sign/product-uploads/a.jpg",
    "http://abc.supabase.co/storage/v1/object/sign/product-uploads/a.jpg",
    "https://user:pw@abc.supabase.co/storage/v1/object/sign/product-uploads/a.jpg",
    `${SB}/sign/generated-images/user_1/g/0.jpg?token=t`,
    `${SB}/sign/product-uploads/../../../../rest/v1/profiles`,
    `${SB}/sign/product-uploads/%2e%2e/%2e%2e/%2e%2e/%2e%2e/rest/v1/profiles`,
    "blob:http://localhost/abc",
    "data:image/svg+xml,<svg/>",
  ];
  check("13: pasan los uploads firmados y las referencias de inicio públicas", allowed.every((u) => isAllowedImageUrl(u)));
  const leaked = rejected.filter((u) => isAllowedImageUrl(u));
  check("13: no pasa ningún host interno, ajeno, http, con credenciales, otro bucket ni path con '..'", leaked.length === 0, leaked.join(" | "));
  const part = partitionUrls([...allowed, ...rejected]);
  check("13: partitionUrls manda lo rechazado a skipped (recortado)", part.http.length === allowed.length && part.skipped.length === rejected.length && part.skipped.every((s) => s.length <= 60));
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  check("13: sin NEXT_PUBLIC_SUPABASE_URL no pasa nada (fail-closed)", !isAllowedImageUrl(allowed[0]));
  if (prevSupabaseUrl !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = prevSupabaseUrl;

  /* 14) v2.1 — F1–F13 ------------------------------------------------------------------ */
  header("14) v2.1 — las correcciones del A/B ronda 1, una por una (F1–F13)");
  out(`  versiones: pb=${PRODUCT_BRIEF_PROMPT_VERSION} rb=${REF_BRIEF_PROMPT_VERSION} dir=${DIRECTOR_PROMPT_VERSION} asm=${ASSEMBLY_VERSION}`);
  // v2.2: asm-3 → asm-4 (G2/G3 cambian el ensamblado; notas y Director no).
  check(
    "versiones subidas (invalidan notas y planes cacheados con las reglas viejas)",
    PRODUCT_BRIEF_PROMPT_VERSION === "pb-2" && REF_BRIEF_PROMPT_VERSION === "rb-2" && DIRECTOR_PROMPT_VERSION === "dir-3" && ASSEMBLY_VERSION === "asm-4",
  );
  const vOf = (patch: Partial<Plan>) => validatePlan({ ...structuredClone(PLAN_TOALLAS_EDITORIAL), ...patch }, vctx);
  const withShot = (k: number, instruction: string, full = true): Plan => {
    const p = structuredClone(PLAN_TOALLAS_EDITORIAL);
    p.shot_variations[k] = { label: `shot ${k + 1}`, instruction, full_product_in_frame: full };
    return p;
  };
  const errs = (v: ReturnType<typeof validatePlan>) => (v.ok ? `pasó; repairs=[${v.repairs.join(", ")}]` : v.errors.join(" | "));
  const p1 = c1.batch.prompts[0];
  const scene8a = block(c8a.batch.prompts[0], "SCENE");
  const PRODUCT_TITLE = "PRODUCT (reproduce exactly as photographed)";

  // ---- F1 ----
  out("\n  F1) material / pelo");
  check(
    "F1a: la nota nombra la construcción textil por lo VISIBLE, nunca por la categoría; si duda, la superficie tal cual",
    PRODUCT_BRIEF_SYSTEM.includes("Name a textile's construction from what the photo shows, never from its category") &&
      PRODUCT_BRIEF_SYSTEM.includes('"smooth, fine short pile with no visible loops"'),
  );
  check("F1a: la etiqueta incluye la construcción", PRODUCT_BRIEF_SYSTEM.includes('"light-blue smooth microfiber towel"'));
  check(
    "F1b: ROLES — de los stand-ins solo posición y uso; material, superficie, bordes, tamaño y cantidad son del vendedor",
    block(p1, "IMAGE ROLES").includes(
      "From the stand-ins take only their position and how they are used; the seller's items keep their own material, surface, edges, size and count.",
    ),
  );
  check("F1b: también con el stand-in desplazado por un lock", roles5.includes("The seller's items keep their own material, surface, edges, size and count."));
  check(
    "F1b: el Director tampoco pasa pelo, bordes, tamaño ni cantidad del stand-in",
    DIRECTOR_SYSTEM.includes("From the stand-in take only its position and how it is used; the seller's items keep their own color, pattern, material, pile, edges, size and count."),
  );

  // ---- F2 ----
  out("\n  F2) identidad de la persona");
  check("F2: la nota de referencia describe el peinado (rb-2)", REF_BRIEF_SYSTEM.includes("hair color, length and style"));
  const f2empty = vOf({ person_description: "" });
  check("F2: has_person sin person_description → H9", !f2empty.ok && f2empty.errors.some((e) => e.startsWith("H9")), errs(f2empty));
  const f2same = vOf({ person_description: "a woman in her thirties with dark hair in a low bun, wearing a white robe" });
  check("F2: mismo peinado que la referencia (rodete) → H9", !f2same.ok && f2same.errors.some((e) => e.startsWith("H9") && e.includes("bun")), errs(f2same));
  check("F2: 'long' de un vestido no cuenta como peinado", !hairstyleKeywords("a woman with short curly hair wearing a long linen dress").has("long"));
  check("F2: una referencia sin peinado no se puede comparar (no marca)", repeatsHairstyle("a woman with hair in a bun", "young adult female, slim build, dark hair") === null);
  check(
    "F2: ROLES — modelo distinta con su descripción, no la de la referencia",
    block(p1, "IMAGE ROLES").includes(
      "The person is a different, anonymous model: a woman in her early forties with short curly auburn hair and a medium build; not the person in Image 3.",
    ),
  );
  check("F2: SCENE la presenta primero", block(p1, "SCENE").startsWith("The model is a woman in her early forties with short curly auburn hair and a medium build. The model stands"));
  const f2none = vOf({ has_person: false });
  check("F2: sin persona la descripción se vacía (R10)", f2none.ok && f2none.repairs.includes("R10:person_description_vacio") && f2none.plan.person_description === "", errs(f2none));
  check(
    "F2: el fallback inventa una modelo con otro peinado, otro color de pelo y otra contextura",
    c8a.plan.person_description === "a woman with short curly light brown hair and a medium build" &&
      repeatsHairstyle(c8a.plan.person_description, REF_MUJER.person.description) === null,
    c8a.plan.person_description,
  );
  check("F2: fallback → la persona del template pasa a 'The model' (una sola mujer en SCENE)", countWord(scene8a, "woman") === 1 && scene8a.includes("The model stands in profile"), scene8a.slice(0, 170));

  // ---- F3 ----
  out("\n  F3) unidades");
  const PLACEMENT_2 =
    "She wears the light-blue microfiber towel wrapped snugly around her body, one hand resting on its fold, and a second light-blue microfiber towel twisted into a turban over her hair. The light-blue textured flat textile lies folded in a neat square on the shelf, textured face up.";
  const UNITS_2 = [
    { item_id: "B" as const, units: 2 },
    { item_id: "A" as const, units: 1 },
  ];
  const f3 = vOf({ items_in_frame: UNITS_2, product_placement: PLACEMENT_2 });
  check(
    "F3: units 2 → 1 (R11) y la segunda toalla sale del texto (R11b)",
    f3.ok && f3.repairs.includes("R11:units_a_1_B") && f3.repairs.includes("R11b:unidad_extra_quitada_de_product_placement") && !/second|turban/.test(f3.plan.product_placement),
    f3.ok ? f3.plan.product_placement : errs(f3),
  );
  const f3quoted = vOf({ product_placement: `${PLAN_TOALLAS_EDITORIAL.product_placement} A second "light-blue microfiber towel" rests folded on the shelf behind her.` });
  check("F3: también con la etiqueta entre comillas (así vino en el A/B)", f3quoted.ok && !/second/.test(f3quoted.plan.product_placement), errs(f3quoted));
  const f3shot = vOf({ shot_variations: withShot(3, "Step back to show both light-blue microfiber towels on the shelf and more of the wall.").shot_variations });
  check("F3: una unidad extra que no se puede cortar (en una toma) → H10", !f3shot.ok && f3shot.errors.some((e) => e.startsWith("H10")), errs(f3shot));
  const TWO_TOWELS = "Quiero dos toallas: una en el cuerpo y otra de turbante.";
  const f3user = validatePlan({ ...structuredClone(PLAN_TOALLAS_EDITORIAL), items_in_frame: UNITS_2, product_placement: PLACEMENT_2 }, { ...vctx, userPrompt: TWO_TOWELS });
  check(
    "F3: si el usuario pide dos, quedan dos (y el texto también)",
    f3user.ok && f3user.plan.items_in_frame[0].units === 2 && f3user.plan.product_placement.includes("a second light-blue microfiber towel"),
    errs(f3user),
  );
  const cF3u = composeV2({ ...c1ctx, userPrompt: TWO_TOWELS }, { ...structuredClone(PLAN_TOALLAS_EDITORIAL), items_in_frame: UNITS_2, product_placement: PLACEMENT_2 });
  check(
    "F3: KEEP OUT cuenta 'exactly two … towels' cuando el usuario las pidió",
    block(cF3u.batch.prompts[0], "KEEP OUT").includes("The image contains exactly two light-blue microfiber towels and exactly one light-blue textured flat textile."),
  );
  check(
    "F3: KEEP OUT con el conteo exacto en positivo (caso base)",
    block(p1, "KEEP OUT").includes("The image contains exactly one light-blue microfiber towel and exactly one light-blue textured flat textile."),
  );
  check("F3: fallback — una unidad por ítem y sin 'a second' ni turbante", c8a.plan.items_in_frame.every((f) => f.units === 1) && !/\ba second\b|turban/.test(scene8a));
  check(
    "F3: el Director perdió el permiso de unidades extra (sin el ejemplo del turbante)",
    !DIRECTOR_SYSTEM.includes("hair turban") && DIRECTOR_SYSTEM.includes("Every item appears exactly once (units 1), whatever the reference shows"),
  );

  // ---- F4 ----
  out("\n  F4) incertidumbre acotada al ítem incierto");
  check(
    "F4: safest_rendering aplica solo al ítem que nombra; los ítems seguros conservan la acción de la referencia",
    DIRECTOR_SYSTEM.includes("Each uncertainty's safest_rendering applies only to the item it names (item_id)") &&
      DIRECTOR_SYSTEM.includes("the seller's towel wraps around the body"),
  );
  check(
    "F4: el ítem incierto va a un lugar secundario y neutro; la ropa no reemplaza el uso del producto",
    DIRECTOR_SYSTEM.includes("goes in a secondary, neutral place that fits its shape and size") &&
      DIRECTOR_SYSTEM.includes("it never takes over a use the reference gives to the product"),
  );
  const noteDir = JSON.parse(/<product_note>\n(.*)\n<\/product_note>/.exec(c1.frame.directorMessage ?? "")?.[1] ?? "{}") as {
    uncertainties?: Array<{ item_id: string }>;
  };
  check("F4: la nota que ve el Director dice a qué ítem aplica cada incertidumbre", noteDir.uncertainties?.[0]?.item_id === "A", JSON.stringify(noteDir.uncertainties));
  check(
    "F4: fallback — el ítem dudoso a un costado, en un lugar a su escala (nunca en un rol de la referencia)",
    scene8a.includes("The light-blue textured flat textile rests to one side of the scene in a spot that fits its real size"),
  );

  // ---- F5 ----
  out("\n  F5) escala y rigidez");
  const MAT = must(
    normalizeProductBrief(
      {
        ...TOALLAS_RAW,
        items: [
          { ...TOALLAS_RAW.items[0], label: "aqua embossed foam mat", rigidity: "semi_rigid", shape_and_scale: "long rectangle about 180 x 60 cm, about 1 cm thick" },
          TOALLAS_RAW.items[1],
        ],
      },
      2,
    ),
    "nota mat",
  );
  const weird = must(normalizeProductBrief({ ...TOALLAS_RAW, items: [{ ...TOALLAS_RAW.items[0], rigidity: "bendy" }, TOALLAS_RAW.items[1]] }, 2), "rigidez rara");
  check("F5: la nota normaliza rigidity (un valor raro queda null sin tirar la nota)", MAT.items[0].rigidity === "semi_rigid" && weird.items[0].rigidity === null);
  const cF5ctx = ctxOf({ brief: MAT, refs: [REF_MUJER], style: resolveStyle("editorial_premium") });
  const cF5 = composeV2(cF5ctx);
  check(
    "F5: PRODUCT dice que el ítem semirrígido conserva su forma y su tamaño real",
    block(cF5.batch.prompts[0], PRODUCT_TITLE).includes("single color with no print or label. It is semi-rigid and holds its own shape and real size."),
  );
  check("F5: el Director recibe tamaño y rigidez", !!cF5.frame.directorMessage?.includes('"rigidity":"semi_rigid"') && !!cF5.frame.directorMessage?.includes("180 x 60 cm"));
  check(
    "F5: regla del Director — solo lo blando se dobla o cuelga; lo grande no va sobre un soporte chico",
    DIRECTOR_SYSTEM.includes("only soft_drapable items fold, hang or drape") && DIRECTOR_SYSTEM.includes("a 180 cm mat lies on the floor or stands rolled up"),
  );
  check("F5: la nota pide tamaño real en cm y rigidez", PRODUCT_BRIEF_SYSTEM.includes("approximate real size in centimeters") && PRODUCT_BRIEF_SYSTEM.includes('"semi_rigid"'));
  checkRules("F5", cF5ctx, cF5);

  // ---- F6 ----
  out("\n  F6) tomas coherentes y variadas");
  const f6crop = validatePlan(withShot(1, "Closer medium shot framing the model from the waist up, holding the towel, with the textile cropped out.", false), vctx);
  check("F6a: 'with the <ítem> cropped out' → H11", !f6crop.ok && f6crop.errors.some((e) => e.startsWith("H11")), errs(f6crop));
  const f6without = validatePlan(withShot(2, "Wider view of the bathroom without the folded textile."), vctx);
  check("F6a: 'without the <ítem>' → H11", !f6without.ok && f6without.errors.some((e) => e.startsWith("H11")), errs(f6without));
  const f6bg = validatePlan(withShot(2, "Crop closer on the towel wrap, cropping out most of the tiled wall.", false), vctx);
  check("F6a: recortar el FONDO ('cropping out most of the tiled wall') es válido", f6bg.ok, errs(f6bg));
  check("F6a: una toma de detalle en un set pide que los otros ítems queden a la vista", block(c1.batch.prompts[1], "SHOT").endsWith("Every product item stays at least partly in view."));
  check("F6a: con un solo ítem no hace falta (cartera, toma de detalle)", !block(c3.batch.prompts[2], "SHOT").includes("partly in view"));
  const f6swap = validatePlan(withShot(1, "Step back for a wider view with more of the tiled wall."), vctx);
  check(
    "F6b: toma 2 de un solo eje → se cambia por la primera de dos ejes (R14)",
    f6swap.ok && f6swap.repairs.includes("R14:toma_2_por_toma_4") && f6swap.plan.shot_variations[1].instruction.startsWith("Step back and lower the camera"),
    errs(f6swap),
  );
  check("F6b: la toma 2 del fallback cambia dos ejes (lado + distancia)", shotAxes(FALLBACK_SHOTS.default[1].instruction) >= 2, FALLBACK_SHOTS.default[1].instruction);
  check("F6b: la regla 14 del Director pide la toma 2 más distinta", DIRECTOR_SYSTEM.includes("Shot 2 is the most different and useful second image"));

  // ---- F7 ----
  out("\n  F7) props con el color del producto");
  const f7 = vOf({
    allowed_objects: [...PLAN_TOALLAS_EDITORIAL.allowed_objects, "the blue candles"],
    scene_paragraph: `${PLAN_TOALLAS_EDITORIAL.scene_paragraph} Blue scented candles stand on the shelf beside the folded textile.`,
  });
  check(
    "F7: las velas azules (familia del producto) pasan a blancas en la lista y en la escena (R12)",
    f7.ok &&
      f7.plan.allowed_objects.includes("the white candles") &&
      f7.plan.scene_paragraph.includes("White scented candles stand on the shelf") &&
      f7.repairs.some((r) => r.startsWith("R12:")),
    errs(f7),
  );
  check("F7: la etiqueta del producto no se toca", f7.ok && f7.plan.product_placement === PLAN_TOALLAS_EDITORIAL.product_placement);
  const famToallas = productColorFamilies(TOALLAS.items);
  check("F7: una palabra de color que es el SUSTANTIVO no se toca ('a sprig of lavender')", !neutralizeColorPhrase("a sprig of lavender", new Set(["purple"]), "white").changed);
  check("F7: 'the white tiled wall' no cambia con un producto celeste", !neutralizeColorPhrase("the white tiled wall", famToallas, "white").changed);
  const whiteTowel = must(
    normalizeProductBrief({ ...CARTERA_RAW, items: [{ ...CARTERA_RAW.items[0], colors: [{ name: "white", hex: "#F5F5F2", where: "whole item" }] }] }, 2),
    "blanco",
  );
  check("F7: un producto blanco no tiene familia cromática (no se repintan paredes blancas)", productColorFamilies(whiteTowel.items).size === 0);
  check("F7: la naturaleza no se repinta ('the turquoise sea' con un producto celeste)", !neutralizeColorPhrase("the turquoise sea", famToallas, "white").changed);
  check(
    "F7: en el texto, el pelo de la modelo no se repinta (sí el prop)",
    neutralizeColorWordsInText("The model has short brown hair and holds a brown cushion.", new Set(["brown"]), "white", [], productProtectedNouns([])) ===
      "The model has short brown hair and holds a white cushion.",
  );
  check(
    "F7: el producto nombrado a medias ('the folded blue towel') no se repinta",
    neutralizeColorWordsInText("She holds the folded blue towel near the blue vase.", new Set(["blue"]), "white", [], productProtectedNouns(["light-blue microfiber towel"])) ===
      "She holds the folded blue towel near the white vase.",
  );

  // ---- F8 / F9 (+F13 en la misma nota) ----
  out("\n  F8/F9) omisiones y tipografía del texto impreso");
  const CARTERA21 = must(
    normalizeProductBrief(
      {
        ...CARTERA_RAW,
        items: [
          {
            ...CARTERA_RAW.items[0],
            rigidity: "semi_rigid",
            printed_text: [{ text: "Verenza", location: "center of the front panel", style: "small lowercase sans-serif, debossed tone-on-tone, no ink" }],
            omit_from_product: ["the small metal clip holding the straps together."],
            identity_sentence:
              'a structured brown (approx. #7A4B2E) suede handbag with a soft short nap, a trapezoid body with a flat base, a single rounded top handle, small zipper pulls exactly as in Photo 2 and "Verenza" debossed on the front',
          },
        ],
      },
      2,
    ),
    "cartera v2.1",
  );
  const cF8ctx = ctxOf({ brief: CARTERA21, style: resolveStyle("fondo_color"), productName: CARTERA_NAME, brand: { name: "Luna" } });
  const cF8 = composeV2(cF8ctx, PLAN_CARTERA_FONDO);
  const prodF8 = block(cF8.batch.prompts[0], PRODUCT_TITLE);
  out(`  PRODUCT (cartera v2.1):\n    ${prodF8.split("\n").join("\n    ")}`);
  check("F8: la nota normaliza omit_from_product (sin punto final)", CARTERA21.items[0].omit_from_product[0] === "the small metal clip holding the straps together");
  check("F8: PRODUCT dice en positivo que el clip no va", prodF8.includes("Show the brown suede handbag without the small metal clip holding the straps together; it was only a photo prop."));
  check(
    "F9: PRODUCT trae la tipografía y el tratamiento del texto impreso",
    prodF8.includes('It carries the printed text "Verenza" (small lowercase sans-serif, debossed tone-on-tone, no ink), same size and position as in Images 1 and 2.'),
  );
  check("F9: KEEP OUT sigue exceptuando el texto propio del producto", block(cF8.batch.prompts[0], "KEEP OUT").includes("other than the product's own printed text described above"));
  check("F5: la cartera semirrígida conserva su forma", prodF8.includes("It is semi-rigid and holds its own shape and real size."));
  check("F13: 'Photo 2' de la nota se lee 'Image 2' si viaja en esa posición", prodF8.includes("small zipper pulls exactly as in Image 2"));
  checkRules("F8", cF8ctx, cF8);

  // ---- F10 ----
  out("\n  F10) sin referencia ni estilo: el producto solo");
  const PLAN_NONE_PERSON: Plan = {
    ...structuredClone(PLAN_CARTERA_NONE),
    has_person: true,
    person_description: "a woman in her thirties with a sleek low ponytail, wearing a cream wool coat",
    product_placement: "The brown suede handbag hangs from the model's shoulder, its front facing the camera.",
    scene_paragraph: "The model stands on a city street in front of a stone facade.",
    allowed_objects: ["the woman", "the stone facade"],
  };
  const cF10 = composeV2(c4ctx, PLAN_NONE_PERSON);
  check(
    "F10: una modelo sin pedido del usuario → H12 → fallback (producto solo)",
    cF10.planSource === "fallback" && !!cF10.validation && !cF10.validation.ok && cF10.validation.errors.some((e) => e.startsWith("H12")) && !cF10.plan.has_person,
    cF10.validation ? errs(cF10.validation) : "",
  );
  const cF10u = composeV2({ ...c4ctx, userPrompt: "Mostrala colgada del hombro de una modelo en la calle." }, PLAN_NONE_PERSON);
  check("F10: si el usuario pide una persona, el plan pasa", cF10u.planSource === "director", cF10u.validation ? errs(cF10u.validation) : "");
  check("F10: la fila 'none' de la tabla de dominios pide el producto solo", !!c4.frame.directorMessage?.includes("the product alone as the hero on a surface or seamless backdrop"));
  check("F10: regla 6 del Director", DIRECTOR_SYSTEM.includes("With neither reference nor style, shoot the product alone as the hero"));
  check(
    "F10: el fallback sin nada es el producto solo, sin persona",
    c8c.plan.has_person === false && block(c8c.batch.prompts[0], "SCENE").startsWith("The brown suede handbag rests on a clean, pale neutral surface"),
  );

  // ---- F11 ----
  out("\n  F11) sombras de piezas finas");
  const v3ctx = c3.frame.validationCtx;
  if (!v3ctx) throw new Error("sin validationCtx (3)");
  const f11 = validatePlan(
    {
      ...structuredClone(PLAN_CARTERA_FONDO),
      light_placement:
        "Crisp directional light strikes from the upper left, casting a well-defined shadow of the handbag and its straps toward the lower right against the vibrant background.",
    },
    v3ctx,
  );
  check(
    "F11: 'shadow of …' sale de light_placement (R13); quedan dirección y dureza",
    f11.ok && f11.repairs.includes("R13:sombra_de_piezas_quitada_de_light_placement") && f11.plan.light_placement === "Crisp directional light strikes from the upper left.",
    f11.ok ? f11.plan.light_placement : errs(f11),
  );
  check("F11: el ejemplo de la spec ('laying a clean shadow to the lower right') no se toca", c3.plan.light_placement === PLAN_CARTERA_FONDO.light_placement);
  check("F11: regla 2 del Director", DIRECTOR_SYSTEM.includes("The shapes of shadows (of handles, straps and other thin parts) are left to the image model."));

  // ---- F12 ----
  out("\n  F12) colores casi iguales");
  const light1 = block(p1, "LIGHT AND FINISH");
  check(
    "F12: dos 'light blue' → nombres derivados distintos en el COLOR_LOCK",
    light1.includes("the light-blue microfiber towel stays light sky blue (approx. #A6D8EA)") && light1.includes("the light-blue textured flat textile stays light aqua (approx. #8FCFE0)"),
  );
  check(
    "F12: los dos celestes REALES del A/B (#76D4EF colchoneta, #4BA1DD toalla) salen distintos",
    deriveColorName("#76D4EF") !== deriveColorName("#4BA1DD"),
    `${deriveColorName("#76D4EF")} / ${deriveColorName("#4BA1DD")}`,
  );
  const TWIN = must(
    normalizeProductBrief({ ...TOALLAS_RAW, items: [{ ...TOALLAS_RAW.items[0], colors: [{ name: "light blue", hex: "#A6D8EA", where: "whole surface" }] }, TOALLAS_RAW.items[1]] }, 2),
    "twin",
  );
  const cTwin = composeV2(ctxOf({ brief: TWIN, style: resolveStyle("estudio_limpio") }));
  check(
    "F12: si el hex no los separa, la etiqueta del COLOR_LOCK lleva el hex",
    block(cTwin.batch.prompts[0], "LIGHT AND FINISH").includes("the light-blue textured flat textile (#A6D8EA) stays light blue (approx. #A6D8EA)"),
  );
  check("F12: la nota pide nombres distintos para colores parecidos", PRODUCT_BRIEF_SYSTEM.includes("so every item has a different main color name"));

  // ---- F13 ----
  out("\n  F13) detalles dudosos");
  check("F13: la nota pide 'small <part> exactly as in Photo N' para lo que no se ve claro", PRODUCT_BRIEF_SYSTEM.includes('"small <part> exactly as in Photo N"'));
  const TOALLAS_F13 = must(
    normalizeProductBrief(
      {
        ...TOALLAS_RAW,
        items: [
          TOALLAS_RAW.items[0],
          { ...TOALLAS_RAW.items[1], identity_sentence: "a light blue (approx. #A6D8EA) microfiber towel with a smooth, fine short pile and a small corner loop exactly as in Photo 2" },
        ],
      },
      2,
    ),
    "toallas F13",
  );
  const cF13 = composeV2({ ...c10ctx, productBrief: TOALLAS_F13 }, PLAN_SOLO_TOALLA);
  check(
    "F13: 'Photo 2' de la nota → 'Image 1' cuando la foto 2 viaja como Image 1",
    block(cF13.batch.prompts[0], PRODUCT_TITLE).includes("a small corner loop exactly as in Image 1."),
    block(cF13.batch.prompts[0], PRODUCT_TITLE),
  );

  /* 15) Replay de la ronda 1 ------------------------------------------------------------ */
  header("15) Replay ronda 1: los planes y notas REALES del A/B contra el validador v2.1");
  const T_R1 = must(normalizeProductBrief(TOALLAS_R1_RAW, 2), "nota toallas R1");
  const REF_R1 = must(normalizeReferenceBrief(REF_R1_RAW), "nota referencia R1");
  const C_R1 = must(normalizeProductBrief(CARTERA_R1_RAW, 1), "nota cartera R1");
  const BRAND_R1: BrandContext = { name: "Casa Luna", industry: "decoración" };

  out("\n  A) ref + editorial_premium — plan real");
  const rActx = ctxOf({ brief: T_R1, refs: [REF_R1], style: resolveStyle("editorial_premium"), variations: 2, productName: "Toallas 2", brand: BRAND_R1 });
  const rA = composeV2(rActx, PLAN_A_R1);
  printCase(rA, { allPrompts: false });
  const vA = rA.validation;
  check("15A: units 2 → 1 y la 'second towel' (entre comillas) sale del texto", !!vA && vA.repairs.includes("R11:units_a_1_B") && vA.repairs.includes("R11b:unidad_extra_quitada_de_product_placement"), vA ? errs(vA) : "");
  check("15A: sin person_description → H9 (reintento en producción)", !!vA && !vA.ok && vA.errors.some((e) => e.startsWith("H9")));
  check("15A: 'with the mat cropped out' → H11", !!vA && !vA.ok && vA.errors.some((e) => e.startsWith("H11")));
  const sceneA = block(rA.batch.prompts[0], "SCENE");
  check(
    "15A: el fallback: la toalla envuelve el cuerpo (acción de la referencia), la colchoneta a un costado, una unidad por ítem",
    rA.planSource === "fallback" &&
      sceneA.includes("She wears the light-blue terrycloth towel wrapped around her body") &&
      sceneA.includes("The light-blue textured foam mat rests to one side of the scene") &&
      !/\ba second\b|another|turban|head\b/.test(sceneA),
    sceneA,
  );
  check(
    "15A: COLOR_LOCK distingue los dos celestes reales",
    block(rA.batch.prompts[0], "LIGHT AND FINISH").includes("the light-blue terrycloth towel stays medium sky blue (approx. #4BA1DD) and the light-blue textured foam mat stays light aqua (approx. #76D4EF)"),
  );
  checkRules("15A", rActx, rA);

  out("\n  B) solo referencia — plan real");
  const rBctx = ctxOf({ brief: T_R1, refs: [REF_R1], style: NO_STYLE, variations: 2, productName: "Toallas 2", brand: BRAND_R1 });
  const rB = composeV2(rBctx, PLAN_B_R1);
  const vB = rB.validation;
  out(`  validación: ${vB ? errs(vB) : "-"}`);
  check(
    "15B: las velas azules pasan a blancas en la lista y en la escena (R12)",
    !!vB?.plan && vB.plan.allowed_objects.includes("the white candles") && vB.plan.scene_paragraph.includes("white bottles and white candles"),
    vB?.plan ? `${vB.plan.allowed_objects.join("; ")} || ${vB.plan.scene_paragraph}` : "",
  );
  check("15B: sin person_description → H9 (la modelo de stock ya no se clona por omisión)", !!vB && !vB.ok && vB.errors.some((e) => e.startsWith("H9")));
  checkRules("15B", rBctx, rB);

  out("\n  C) solo estilo fondo_color — plan real");
  const rCctx = ctxOf({ brief: C_R1, style: resolveStyle("fondo_color"), variations: 2, productName: "cartera", brand: BRAND_R1, photos: 1 });
  const rC = composeV2(rCctx, PLAN_C_R1);
  out(`  validación: ${rC.validation ? errs(rC.validation) : "-"}`);
  check(
    "15C: pasa, con la sombra del asa fuera de light_placement (R13)",
    rC.planSource === "director" && !!rC.validation?.repairs.includes("R13:sombra_de_piezas_quitada_de_light_placement") && rC.plan.light_placement === "Crisp directional light strikes from the upper left.",
  );
  check("15C: KEEP OUT con 'exactly one brown suede handbag'", block(rC.batch.prompts[0], "KEEP OUT").includes("The image contains exactly one brown suede handbag."));
  checkRules("15C", rCctx, rC);

  out("\n  D) sin nada, 4:5 — plan real");
  const rDctx = ctxOf({ brief: C_R1, style: NO_STYLE, ratio: "4:5", variations: 2, productName: "cartera", brand: BRAND_R1, photos: 1 });
  const rD = composeV2(rDctx, PLAN_D_R1);
  const vD = rD.validation;
  out(`  validación: ${vD ? errs(vD) : "-"}`);
  check("15D: modelo en la calle sin pedido → H12 (y H9)", !!vD && !vD.ok && vD.errors.some((e) => e.startsWith("H12")) && vD.errors.some((e) => e.startsWith("H9")));
  check(
    "15D: el fallback de D es el producto solo sobre fondo neutro",
    rD.planSource === "fallback" && !rD.plan.has_person && block(rD.batch.prompts[0], "SCENE").startsWith("The brown suede handbag rests on a clean, pale neutral surface"),
  );
  checkRules("15D", rDctx, rD);

  // 15E) Regresión de la prueba EN VIVO v2.1 (plan dir-3 real de D, 2026-09-10): el
  // Director eligió un fondo "soft terracotta" (familia del marrón del producto).
  // R12 lo pasó a blanco en la lista y en la escena, pero las tomas 3 y 4 seguían
  // diciendo "terracotta backdrop" / "terracotta wall". Plan tal cual salió del
  // Director, salvo la etiqueta (la nota en vivo decía "brown suede rectangular
  // handbag"; acá se usa la de la nota R1) y la escena/lista reconstruidas ANTES
  // de la reparación.
  out("\n  E) prueba en vivo v2.1, caso D — el color neutralizado llega a TODAS las tomas");
  const PLAN_D_LIVE_RAW: Record<string, unknown> = {
    primary_reference: 0, secondary_reference: 0, secondary_use: "", conflicts: [],
    items_in_frame: [{ item_id: "A", units: 1 }],
    has_person: false, person_description: "",
    purpose: "for a decor and accessories brand's product page and social media",
    product_placement:
      "The brown suede handbag stands upright in the center of the pedestal. Its front faces the camera directly to remain fully visible. The two long thin straps extend naturally upward.",
    scene_paragraph:
      "A minimalist studio setting featuring a matte beige plaster pedestal on a smooth floor. A curved soft terracotta backdrop sits behind the display. A small textured ceramic vase holding a few dried natural grass stems rests on the floor to the left of the pedestal, providing an organic, warm element to the composition.",
    allowed_objects: ["the matte beige plaster pedestal", "the smooth floor", "the soft terracotta backdrop", "the small textured ceramic vase", "the dried natural grass stems"],
    light_owner: "director",
    light_and_finish:
      "Soft, directional studio light from the upper right, casting gentle shadows to the left. Warm, earthy color grading with moderate contrast to enhance the suede texture. Shot with an 85mm lens. Clean, high-end commercial finish with a softly blurred background.",
    light_placement: "",
    camera:
      "Eye-level, straight-on medium shot focused on the handbag's front. Framed vertically, the bag occupies the middle two-thirds of the image, with clean headroom above the straps.",
    shot_variations: R1_SHOTS([
      ["Base medium shot", "Use the base framing described above.", true],
      ["High-angle closer crop", "High-angle, closer framing looking slightly down at the handbag, emphasizing its rounded corners while cropping the top of the straps.", false],
      ["Wider framing", "Straight-on wide shot revealing more of the pedestal, the vase, and the terracotta backdrop.", true],
      ["Low-angle medium shot", "Slightly low-angle medium shot, emphasizing the height of the straps against the terracotta wall.", true],
      ["Detail crop", "Straight-on close-up crop of the front panel, highlighting the printed text and the suede material.", false],
    ]),
    user_instructions_applied: "", rejected_requests: [],
    summary_es: "Cartera de gamuza sobre un pedestal de yeso con fondo terracota.",
  };
  const rEctx = { ...rDctx, variations: 5 };
  const rE = composeV2(rEctx, PLAN_D_LIVE_RAW);
  out(`  validación: ${rE.validation ? errs(rE.validation) : "-"}`);
  check(
    "15E: el fondo terracota pasa a blanco en la lista, la escena y las tomas 3 y 4",
    rE.planSource === "director" &&
      rE.plan.allowed_objects.includes("the white backdrop") &&
      rE.plan.scene_paragraph.includes("A curved white backdrop sits behind the display.") &&
      rE.plan.shot_variations[2].instruction === "Straight-on wide shot revealing more of the pedestal, the vase, and the white backdrop." &&
      rE.plan.shot_variations[3].instruction === "Slightly low-angle medium shot, emphasizing the height of the straps against the white wall.",
    rE.plan.shot_variations.map((s) => s.instruction).join(" || "),
  );
  check("15E: 'terracotta' no llega a ningún prompt de imagen", rE.batch.prompts.every((p) => !/terracotta/i.test(p)));
  check("15E: la luz ('Warm, earthy color grading') y la etiqueta no se tocan", rE.plan.light_and_finish === PLAN_D_LIVE_RAW.light_and_finish && rE.plan.product_placement === PLAN_D_LIVE_RAW.product_placement);
  checkRules("15E", rEctx, rE);

  /* 16) Revisión adversarial de v2.1 ------------------------------------------------------ */
  header("16) Revisión adversarial v2.1: contradicciones entre bloques y falsos positivos");
  check(
    "16a: el stand-in remite a SCENE (con una unidad por ítem y el ítem dudoso en el estante, 'their position' ya no es uno a uno)",
    block(p1, "IMAGE ROLES").includes("in their place, arranged as described in SCENE, in their own colors."),
  );

  const allowedT = new Map([
    ["towel", 1],
    ["textile", 1],
  ]);
  for (const t of [
    "She holds the towel closed with both hands resting on the towel's fold.",
    "Move to another angle of the towel, same height.",
    "Step back two steps so the towel and the wall read clearly.",
  ]) {
    check(`16b: '${t}' no es una unidad extra`, extraUnitMentions(t, allowedT).length === 0, JSON.stringify(extraUnitMentions(t, allowedT)));
  }
  check("16b: 'a second light-blue terrycloth towel' sigue siendo una unidad extra", extraUnitMentions("and a second light-blue terrycloth towel rests on the shelf", allowedT).length === 1);
  const f16both = vOf({ shot_variations: withShot(4, "Close-up of both hands holding the towel at her chest, the folded textile at the frame's edge.", false).shot_variations });
  check("16b: 'both hands holding the towel' en una toma pasa (antes era H10)", f16both.ok, errs(f16both));

  const f16keep = validatePlan(withShot(2, "Move closer and slightly to the left without cropping the folded textile."), vctx);
  check("16c: 'without cropping the <ítem>' (mantenerlo entero) no dispara H11", f16keep.ok, errs(f16keep));

  check(
    "16d: el hex entre paréntesis del color neutralizado se va con él (nunca 'white (approx. #1E8C8A)')",
    neutralizeColorWordsInText(
      "A seamless backdrop in a single saturated teal (approx. #1E8C8A) curves from floor to wall.",
      new Set(["teal"]),
      "white",
      [],
      productProtectedNouns([]),
    ) === "A seamless backdrop in a single saturated white curves from floor to wall.",
  );
  const f16light = vOf({
    allowed_objects: [...PLAN_TOALLAS_EDITORIAL.allowed_objects, "the blue candles"],
    light_placement: "The key light comes from the side she faces, grazing the blue candles on the shelf.",
  });
  check(
    "16d: R12 también llega a light_placement (LIGHT no contradice a SCENE)",
    f16light.ok && f16light.plan.light_placement === "The key light comes from the side she faces, grazing the white candles on the shelf.",
    f16light.ok ? f16light.plan.light_placement : errs(f16light),
  );

  check(
    "16e: fallback — CAMERA no nombra el turbante que F3 sacó del template",
    !/turban/i.test(block(c8a.batch.prompts[0], "CAMERA AND FORMAT")),
    block(c8a.batch.prompts[0], "CAMERA AND FORMAT"),
  );

  const REF_HAIR = must(
    normalizeReferenceBrief({
      ...REF_MUJER_RAW,
      scene_template:
        "A woman with dark hair in a low bun stands in profile in a bathroom lined with white square tiles, wearing [PRODUCT] wrapped around her body and [PRODUCT] twisted into a turban over her hair, with a white floating shelf on the wall behind her.",
    }),
    "referencia con peinado en el template",
  );
  const c16fctx = ctxOf({ brief: TOALLAS, refs: [REF_HAIR], style: resolveStyle("editorial_premium"), variations: 2 });
  const c16f = composeV2(c16fctx);
  const scene16f = block(c16f.batch.prompts[0], "SCENE");
  check(
    "16f: fallback — el peinado de la referencia en el template no contradice a la modelo nueva",
    c16f.planSource === "fallback" && !/\bbun\b|dark hair/.test(scene16f) && scene16f.includes("The model stands in profile in a bathroom"),
    scene16f,
  );
  checkRules("16f", c16fctx, c16f);

  const c16gctx = ctxOf({ brief: TOALLAS, style: resolveStyle("macro_detalle") });
  const c16g = composeV2(c16gctx);
  check(
    "16g: bajo lock macro no hay línea de conteo (no obliga a meter los dos ítems en un primerísimo plano)",
    !block(c16g.batch.prompts[0], "KEEP OUT").includes("The image contains exactly"),
  );
  checkRules("16g", c16gctx, c16g);

  const f16scene = vOf({ scene_paragraph: `${PLAN_TOALLAS_EDITORIAL.scene_paragraph} Her dark hair is gathered in a low bun.` });
  check(
    "16h: el peinado de la referencia copiado en scene_paragraph → H9 (SCENE contradiría a la modelo nueva)",
    !f16scene.ok && f16scene.errors.some((e) => e.startsWith("H9") && e.includes("scene_paragraph")),
    errs(f16scene),
  );

  const CARTERA_OMIT = must(
    normalizeProductBrief({ ...CARTERA_RAW, items: [{ ...CARTERA_RAW.items[0], omit_from_product: ["the price tag visible in Photo 2"] }] }, 2),
    "cartera omit",
  );
  const c16i = composeV2(ctxOf({ brief: CARTERA_OMIT, style: resolveStyle("fondo_color"), productName: CARTERA_NAME }), PLAN_CARTERA_FONDO);
  check(
    "16i: 'Photo N' dentro de omit_from_product también se lee 'Image M'",
    block(c16i.batch.prompts[0], PRODUCT_TITLE).includes("without the price tag visible in Image 2;"),
    block(c16i.batch.prompts[0], PRODUCT_TITLE),
  );

  check("16j: rb-2 encuadra por el cuerpo y el lugar (el encuadre no depende del producto de stock)", REF_BRIEF_SYSTEM.includes("Give the edges by the person's body and the place"));
  check("16j: rb-2 — el template nombra a la persona sin su look", REF_BRIEF_SYSTEM.includes('named only as "a woman", "a man" or "a person"'));
  check(
    "16j: regla 8 — el ítem dudoso plano o enrollado según su safest_rendering; regla 3 lo remite a la 8",
    DIRECTOR_SYSTEM.includes("whichever its safest_rendering allows") &&
      !DIRECTOR_SYSTEM.includes("shown the way its photo shows it") &&
      DIRECTOR_SYSTEM.includes("an item with low category_confidence follows rule 8 instead"),
  );

  /* 17) v2.2 — G1–G3 ---------------------------------------------------------------- */
  header("17) v2.2 — saldo agotado ≠ rate limit (G1), referencia sin nota (G2), fallback sin nota con varias fotos (G3)");

  // ---- G1: callGemini con fetch SIMULADO (ninguna llamada sale a la red) ----
  out("\n  G1) mapeo de errores de Gemini (fetch simulado)");
  const realFetch = globalThis.fetch;
  const realConsoleError = console.error;
  const loud: string[] = [];
  console.error = (...args: unknown[]) => {
    loud.push(args.map(String).join(" "));
  };
  const answer = (status: number, body: unknown) => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as typeof fetch;
  };
  const geminiErr = (status: number, error: Record<string, unknown>) => answer(status, { error });
  const callOnce = () => callGemini({ apiKey: "k-test", model: "gemini-test", contents: [{ role: "user", parts: [{ text: "x" }] }] });
  const kindOf = (r: Awaited<ReturnType<typeof callGemini>>) => (r.ok ? "ok" : r.error.kind);
  try {
    resetGeminiBillingState();
    const DEPLETED = "Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.";
    geminiErr(429, { code: 429, message: DEPLETED, status: "RESOURCE_EXHAUSTED" });
    const g1a = await callOnce();
    check("G1: 429 RESOURCE_EXHAUSTED 'prepayment credits are depleted' → billing (antes: rate_limit)", kindOf(g1a) === "billing", JSON.stringify(g1a.ok ? {} : g1a.error));
    check("G1: … y abre el corte de la instancia (las rutas cortan antes de cobrar o reservar cupo)", isGeminiBillingExhausted());
    const g1a2 = await callOnce();
    check("G1: un segundo 'depleted' sigue siendo billing", kindOf(g1a2) === "billing");
    const billingLines = loud.filter((l) => l.startsWith("[gemini] billing_exhausted"));
    check("G1: console.error '[gemini] billing_exhausted' UNA vez por apertura del corte (no una por imagen)", billingLines.length === 1, `${billingLines.length} línea(s)`);
    check("G1: la línea del log no lleva la key", billingLines.every((l) => !l.includes("k-test") && !l.includes("key=")));
    check("G1: el corte vence solo a los 2 minutos", !isGeminiBillingExhausted(Date.now() + BILLING_BREAKER_MS + 1));
    answer(200, { candidates: [] });
    const g1ok = await callOnce();
    check("G1: la primera respuesta OK levanta el corte (alguien recargó)", g1ok.ok && !isGeminiBillingExhausted());

    geminiErr(429, { code: 429, message: "Resource has been exhausted (e.g. check quota).", status: "RESOURCE_EXHAUSTED" });
    const g1b = await callOnce();
    check("G1: 429 'Resource has been exhausted (e.g. check quota)' → rate_limit", kindOf(g1b) === "rate_limit", kindOf(g1b));
    geminiErr(429, {
      code: 429,
      message:
        "You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits.",
      status: "RESOURCE_EXHAUSTED",
      details: [
        { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateContentPaidTierInputTokensPerModelPerMinute" }] },
        { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "37s" },
      ],
    });
    const g1c = await callOnce();
    check(
      "G1: 429 de cuota que NOMBRA 'billing details' → rate_limit (no billing), con retryAfterSec",
      !g1c.ok && g1c.error.kind === "rate_limit" && g1c.error.retryAfterSec === 37,
      JSON.stringify(g1c.ok ? {} : g1c.error),
    );
    geminiErr(429, { code: 429, message: "Quota exceeded for quota metric 'Generate Content API requests per minute'.", status: "RATE_LIMIT_EXCEEDED" });
    check("G1: 429 RATE_LIMIT por minuto → rate_limit", kindOf(await callOnce()) === "rate_limit");
    check("G1: ningún rate limit abrió el corte", !isGeminiBillingExhausted());

    geminiErr(403, {
      code: 403,
      message: "Method doesn't allow unregistered callers (callers without established identity). Please use API Key or other form of API consumer identity to call this API.",
      status: "PERMISSION_DENIED",
    });
    check("G1: 403 sin identidad (key inválida) → invalid_key, igual que antes", kindOf(await callOnce()) === "invalid_key");
    geminiErr(403, {
      code: 403,
      message: "Permission denied: Consumer 'api_key:XXXX' has been suspended.",
      status: "PERMISSION_DENIED",
      details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "CONSUMER_SUSPENDED" }],
    });
    check("G1: 403 key suspendida → invalid_key", kindOf(await callOnce()) === "invalid_key");
    geminiErr(400, {
      code: 400,
      message: "API key not valid. Please pass a valid API key.",
      status: "INVALID_ARGUMENT",
      details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "API_KEY_INVALID" }],
    });
    check("G1: 400 'API key not valid' → invalid_key, igual que antes", kindOf(await callOnce()) === "invalid_key");
    check("G1: ninguna key inválida abrió el corte", !isGeminiBillingExhausted());
    geminiErr(403, {
      code: 403,
      message: "This API method requires billing to be enabled. Please enable billing on project #123 by visiting the console.",
      status: "PERMISSION_DENIED",
      details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "BILLING_DISABLED" }],
    });
    check("G1: 403 BILLING_DISABLED → billing", kindOf(await callOnce()) === "billing");
    resetGeminiBillingState();
    geminiErr(503, { code: 503, message: "The model is overloaded. Please try again later.", status: "UNAVAILABLE" });
    check("G1: 503 sobrecarga → network, igual que antes", kindOf(await callOnce()) === "network");
  } finally {
    globalThis.fetch = realFetch;
    console.error = realConsoleError;
    resetGeminiBillingState();
  }

  out("\n  G1) mensajes al usuario (honestos: dicen si hubo reembolso o si no se descontó nada)");
  const msgs = {
    genRefund: formatBillingError({ service: "images", refunded: 5 }),
    genNone: formatBillingError({ service: "images", refunded: 0 }),
    regen: formatBillingError({ service: "images", refunded: 1 }),
    analysis: formatBillingError({ service: "analysis", refunded: 1 }),
    analysisNone: formatBillingError({ service: "analysis", refunded: 0 }),
  };
  for (const [k, m] of Object.entries(msgs)) out(`    ${k}: ${m}`);
  check(
    "G1: generación con deduct + refund → dice cuántos volvieron",
    msgs.genRefund === "El generador de imágenes está sin saldo en este momento. Te devolvimos los 5 créditos; ya estamos avisados.",
  );
  check(
    "G1: corte antes del deduct o ilimitado → 'No se te descontó nada'",
    msgs.genNone === "El generador de imágenes está sin saldo en este momento. No se te descontó nada; ya estamos avisados.",
  );
  check("G1: regenerar → 'Te devolvimos el crédito'", msgs.regen === "El generador de imágenes está sin saldo en este momento. Te devolvimos el crédito; ya estamos avisados.");
  check(
    "G1: análisis → su propio servicio y su propia bolsa",
    msgs.analysis === "El análisis con IA está sin saldo en este momento. Te devolvimos el crédito de análisis; ya estamos avisados." &&
      msgs.analysisNone === "El análisis con IA está sin saldo en este momento. No se te descontó nada; ya estamos avisados.",
  );
  check("G1: ningún mensaje de saldo manda a 'probar de nuevo'", Object.values(msgs).every((m) => !/prob[aá]/i.test(m)));

  // ---- G2: referencia SIN nota ----
  out("\n  G2) referencia SIN nota (su nota falló por timeout / 429 / 5xx): viaja con un rol genérico");
  const cG2ctx: ComposeContext = { ...ctxOf({ brief: TOALLAS, style: resolveStyle("editorial_premium"), variations: 2 }), genericRef: true };
  const cG2 = composeV2(cG2ctx);
  printCase(cG2);
  const p2g = cG2.batch.prompts[0];
  const rolesG2 = block(p2g, "IMAGE ROLES");
  const sceneG2 = block(p2g, "SCENE");
  check("G2: el caso sigue siendo ref_and_style (antes caía a style_only: packshot sin la escena)", cG2.frame.caseKind === "ref_and_style" && cG2.frame.genericRef);
  check("G2: sin Director (planea leyendo la nota de la referencia) → fallback", cG2.frame.directorMessage === null && cG2.planSource === "fallback");
  check(
    "G2: la referencia viaja como Image 3, después de las 2 fotos",
    JSON.stringify(cG2.batch.slots.map((s) => s.label)) === JSON.stringify(["Image 1: product photo.", "Image 2: product photo.", "Image 3: scene reference."]),
  );
  check("G2: TASK_LINE la usa como escena", p2g.split("\n")[0].endsWith("take the product from Images 1 and 2 and place it in the scene of Image 3."));
  check(
    "G2: ROLES — lugar, superficies, composición, ángulo, pose y uso; no su luz ni colores (hay estilo)",
    rolesG2.includes(
      "Image 3 is a scene reference: use it only for the place, the surfaces, the composition and camera angle, the pose of any person and how the product is used; not for its light or colors.",
    ),
  );
  check(
    "G2: ROLES — su producto es un stand-in que se reemplaza por los ítems del vendedor en sus colores, materiales y cantidad",
    rolesG2.includes(
      "Any product shown in Image 3 is a stand-in for the seller's product: put the light-blue microfiber towel and the light-blue textured flat textile in its place, arranged as described in SCENE, in their own colors, materials and count. From the stand-in take only its position and how it is used.",
    ),
  );
  check("G2: ROLES — persona distinta y anónima", rolesG2.includes("Any person in Image 3 becomes a different, anonymous model, with another face, hairstyle and build."));
  check("G2: ROLES — ignora marcas de agua, logos y texto", rolesG2.includes("Ignore any watermark, logo or text in Image 3."));
  check("G2: SCENE remite a la escena de Image 3 (el mismo ordinal que su slot)", sceneG2.startsWith("The new photo recreates the scene of Image 3: the same place, surfaces and props, with the same composition and camera angle."));
  check(
    "G2: el ítem dudoso no toma el lugar del producto de la referencia: va a un costado (F4)",
    sceneG2.includes("The light-blue microfiber towel is the clear subject, fully visible. The light-blue textured flat textile rests to one side of the scene"),
    sceneG2,
  );
  check("G2: CAMERA sigue el ángulo de Image 3", block(p2g, "CAMERA AND FORMAT").startsWith("The camera angle and framing follow Image 3"));
  check("G2: KEEP OUT deja el escenario de Image 3 (no lo vacía)", block(p2g, "KEEP OUT").endsWith("besides the setting of Image 3, add no other objects."));
  const partsG2 = buildImageParts(cG2.batch, 0, { productPhotos: [img("PHOTO1"), img("PHOTO2")], refs: [img("REF_SIN_NOTA")] })
    .map((p) => ("inlineData" in p ? p.inlineData?.data : null))
    .filter(Boolean);
  check("G2: la imagen de la referencia viaja al modelo de imagen", JSON.stringify(partsG2) === JSON.stringify(["PHOTO1", "PHOTO2", "REF_SIN_NOTA"]));
  checkRules("G2", cG2ctx, cG2);

  out("\n  G2b) solo referencia (sin estilo), 1 foto: la luz también sale de la referencia");
  const cG2bctx: ComposeContext = { ...ctxOf({ brief: CARTERA, style: NO_STYLE, productName: CARTERA_NAME, photos: 1 }), genericRef: true };
  const cG2b = composeV2(cG2bctx);
  const p2b = cG2b.batch.prompts[0];
  check("G2b: ref_only, referencia = Image 2", cG2b.frame.caseKind === "ref_only" && cG2b.batch.slots[1]?.label === "Image 2: scene reference.");
  check(
    "G2b: ROLES pide también la luz y el color",
    block(p2b, "IMAGE ROLES").includes("use it for the place, the surfaces, the composition and camera angle, the light and the color mood, the pose of any person and how the product is used."),
  );
  check("G2b: LIGHT sale de la referencia", block(p2b, "LIGHT AND FINISH").startsWith("Light and color mood follow Image 2.") && cG2b.plan.light_owner === "reference");
  check("G2b: un ítem → 'put the brown suede handbag in its place … in its own colors'", block(p2b, "IMAGE ROLES").includes("put the brown suede handbag in its place, arranged as described in SCENE, in its own colors, materials and count."));
  checkRules("G2b", cG2bctx, cG2b);

  out("\n  G2c) con lock cenital (flat_lay): de la referencia solo lugar, superficies y props");
  const cG2cctx: ComposeContext = { ...ctxOf({ brief: TOALLAS, style: resolveStyle("flat_lay") }), genericRef: true };
  const cG2c = composeV2(cG2cctx);
  const rolesG2c = block(cG2c.batch.prompts[0], "IMAGE ROLES");
  check("G2c: ROLES con lock → no su ángulo, luz ni colores", rolesG2c.includes("Image 3 is a scene reference: use it only for the place, the surfaces and the props; not for its camera angle, light or colors."));
  check("G2c: stand-in desplazado (remite a SCENE) y sin persona", rolesG2c.includes("replace it, arranged as described in SCENE, in their own colors, materials and count.") && !/person/i.test(rolesG2c));
  check("G2c: SCENE toma lugar, superficies y props de Image 3", block(cG2c.batch.prompts[0], "SCENE").startsWith("The new photo takes the place, the surfaces and the props of Image 3."));
  checkRules("G2c", cG2cctx, cG2c);

  out("\n  G2d) sin nota del producto Y referencia sin nota (G2 + G3)");
  const cG2dctx: ComposeContext = { ...ctxOf({ brief: null, style: NO_STYLE }), genericRef: true };
  const cG2d = composeV2(cG2dctx);
  printCase(cG2d);
  check("G2d: ref_only con la referencia como Image 3", cG2d.frame.caseKind === "ref_only" && cG2d.batch.slots.length === 3 && cG2d.batch.slots[2].label === "Image 3: scene reference.");
  check(
    "G2d: stand-in → 'the product … in its own colors, materials and count'",
    block(cG2d.batch.prompts[0], "IMAGE ROLES").includes("put the product in its place, arranged as described in SCENE, in its own colors, materials and count."),
  );
  checkRules("G2d", cG2dctx, cG2d);

  const cG2e = composeV2({ ...c1ctx, genericRef: true }, PLAN_TOALLAS_EDITORIAL);
  check(
    "G2e: con una referencia CON nota manda esa (Director) y el rol genérico no aparece",
    cG2e.planSource === "director" && !cG2e.frame.genericRef && cG2e.batch.prompts[0] === c1.batch.prompts[0],
  );

  // ---- G3: fallback sin nota con varias fotos ----
  out("\n  G3) fallback sin nota del producto con varias fotos: un ítem por ordinal");
  const prodG3 = block(c8b.batch.prompts[0], PRODUCT_TITLE);
  check("G3: sin 'Reproduce it' en singular con varias fotos", !/\bReproduce it\b/.test(prodG3) && !/\bthe product in Images\b/.test(c8b.batch.prompts[0]));
  check("G3: lenguaje positivo en PRODUCT (sin 'do not' / 'never' / 'don't')", !/\b(?:do not|don't|never)\b/i.test(prodG3));
  check(
    "G3: ROLES sin nota con varias fotos habla de cada ítem",
    block(c8b.batch.prompts[0], "IMAGE ROLES").startsWith("Images 1 and 2 show the product being sold; they are the only source for how each item looks."),
  );
  check(
    "G3: con 6 fotos, las 6 por ordinal",
    block(c8d.batch.prompts[0], PRODUCT_TITLE).startsWith(
      "Image 1 shows a product item; Image 2 shows a product item; Image 3 shows a product item; Image 4 shows a product item; Image 5 shows a product item; Image 6 shows a product item. If they show different items",
    ),
  );
  check(
    "G3: KEEP OUT y MARGIN sin nota con varias fotos no afirman 'un producto' (el conteo lo decide PRODUCT)",
    block(c8b.batch.prompts[0], "KEEP OUT").includes("The only product items in the frame are the ones described above;") &&
      !/The only product in the frame is/.test(c8b.batch.prompts[0]) &&
      block(c8b.batch.prompts[0], "SHOT").includes("Keep every product item fully inside the frame with a clear margin."),
  );
  const cG3onectx = ctxOf({ brief: null, style: resolveStyle("estudio_limpio"), photos: 1 });
  const cG3one = composeV2(cG3onectx);
  check(
    "G3: con UNA foto KEEP OUT y MARGIN siguen en singular",
    block(cG3one.batch.prompts[0], "KEEP OUT").includes("The only product in the frame is the seller's product described above;") &&
      block(cG3one.batch.prompts[0], "SHOT").includes("Keep the whole product fully inside the frame with a clear margin."),
  );
  check(
    "G3: con UNA foto sigue en singular y ancla el texto impreso",
    block(cG3one.batch.prompts[0], PRODUCT_TITLE) ===
      "Image 1 shows the product being sold. Reproduce it exactly as photographed: same shape, proportions, colors, material and texture. Any printed text or logo on the product is copied letter by letter from Image 1.",
  );
  checkRules("G3 (1 foto)", cG3onectx, cG3one);

  /* Resumen ------------------------------------------------------------------------ */
  header(`RESUMEN: ${checks - failures}/${checks} chequeos OK${failures ? ` — ${failures} FALLAS` : ""}`);
  for (const f of failed) out(`  FAIL ${f}`);
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
