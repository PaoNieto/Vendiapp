/**
 * Validador del plan del Director (spec §2.5 "Validador" + correcciones v2.1).
 * Función PURA.
 *
 * Orden: H1 (parsea / pasa zod) → reparaciones automáticas R1–R14 (se registran
 * en plan_meta.repairs) → errores duros H2–H12 sobre el plan YA reparado. Así una
 * reparación que resuelve un problema (ej. R4 forzando la luz del estilo) no
 * dispara un reintento de 45s al pedo.
 *
 * Los mensajes de error van en INGLÉS porque se le devuelven al modelo en el
 * reintento ("Your previous plan failed these checks: …").
 *
 * v2.1 (A/B ronda 1, dos jueces):
 *   R10/H9  persona anónima con peinado distinto al de la referencia (F2)
 *   R11/H10 una unidad por ítem salvo pedido del usuario (F3)
 *   R12     props del color del producto → neutro (F7)
 *   R13     sin "shadow of …" en la luz (F11)
 *   R14     la toma 2 es la que cambia al menos dos ejes (F6b)
 *   H11     ninguna toma saca un ítem de cuadro (F6a)
 *   H12     sin referencia ni estilo, el producto va solo (F10)
 */

import { planZ, type Plan } from "@/lib/ai/v2/director";
import { SHOT_COUNT, WORD_CAP_SLACK } from "@/lib/ai/v2/constants";
import {
  neutralColorFor,
  neutralizeColorPhrase,
  neutralizeColorWordsInText,
  productColorFamilies,
  productProtectedNouns,
} from "@/lib/ai/v2/colors";
import type { ProductBrief } from "@/lib/ai/v2/product-brief";
import type { ReferenceBrief } from "@/lib/ai/v2/reference-brief";
import {
  capitalizeFirst,
  dropClauses,
  escapeRegExp,
  headNoun,
  splitSentences,
  stripTrailingPeriod,
  wordCount,
} from "@/lib/ai/v2/sanitize";
import type { LockKind } from "@/lib/ai/v2/style-parts";

export const BASE_SHOT_INSTRUCTION = "Use the base framing described above.";

/** Topes de palabras de los campos que llegan al prompt final. */
export const WORD_CAPS = {
  secondary_use: 12,
  purpose: 15,
  person_description: 40,
  product_placement: 60,
  scene_paragraph: 90,
  light_and_finish: 60,
  light_placement: 30,
  camera: 40,
  shot_instruction: 25,
} as const;

export type PlanValidationContext = {
  productBrief: ProductBrief;
  /** Referencias usables, n = índice + 1. */
  usableRefs: ReferenceBrief[];
  hasStyle: boolean;
  /** Lock EFECTIVO (null si no hay lock o si la referencia le gana). */
  lockKind: LockKind | null;
  /** Ya saneados con `clean`. */
  userPrompt: string;
  productName: string;
  brandName: string;
};

export type PlanValidation =
  | { ok: true; plan: Plan; repairs: string[] }
  | { ok: false; errors: string[]; repairs: string[]; plan: Plan | null };

/** H5: palabras de luz. Sin `light` sola, porque aparece en "light-blue". */
const LIGHT_WORDS_RE =
  /\b(lighting|lit|shadows?|sunlight|daylight|sunlit|glow(ing)?|backlit|moody|dramatic|low-key|high-key|golden[- ]hour|rim light|key light|window light|soft light|hard light)\b/i;
/** R3: lentes en `camera` (la lente es del estilo o de light_and_finish). */
const LENS_RE = /\b\d{2,3}\s?mm\b|\blens\b|aperture|f\/\d/i;
/** H6: señales de inyección en campos que llegan al prompt de imagen. */
const INJECTION_TOKENS = ["http", "www.", "<", ">", "ignore", "instruction", "system prompt"];
/**
 * H8 (propio): tokens de plantilla ("[PRODUCT]") copiados del scene_template de
 * la referencia. El Director lo recibe con esos tokens y la regla 4 le pide
 * conservar la escena: copiarlo es probable, y el modelo de imagen lo leería
 * como un producto genérico extra o lo escribiría como texto en la foto.
 */
const TEMPLATE_TOKEN_RE = /\[[A-Z_]+\]/;
/** R13 (F11): "casting a shadow of the handbag and its straps" dibujó un asa fantasma. */
const SHADOW_OF_RE = /\bshadows? of\b/i;
/** H11 (F6a): frases que sacan algo del cuadro. */
const CROP_OUT_RE = /\b(cropped out|cropping out|crops? out|out of (?:the )?frame|outside (?:the )?frame|off[- ]frame|out of shot|out of view)\b/i;

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * R1: si pasa el tope (con holgura de WORD_CAP_SLACK), se corta en el último fin
 * de oración que entra en el tope. Si ni la primera oración entra, corte duro
 * por palabras.
 */
function capWords(text: string, cap: number): { text: string; cut: boolean } {
  if (wordCount(text) <= Math.floor(cap * WORD_CAP_SLACK)) return { text, cut: false };
  let out = "";
  for (const s of splitSentences(text)) {
    const next = `${out}${s}`;
    if (wordCount(next) > cap) break;
    out = next;
  }
  out = out.trim();
  if (!out) {
    out = `${text.trim().split(/\s+/).slice(0, cap).join(" ").replace(/[,;:]+$/, "")}.`;
  }
  return { text: out, cut: true };
}

/**
 * Saca las etiquetas del producto de un texto antes de buscar palabras
 * prohibidas. Sin esto, "light-blue microfiber towel" haría saltar el chequeo del
 * color "blue" de la referencia, y un producto llamado "Coffee mug" con etiqueta
 * "white ceramic coffee mug" parecería una inyección del nombre.
 */
function stripLabels(text: string, labels: string[]): string {
  let out = text;
  for (const label of [...labels].sort((a, b) => b.length - a.length)) {
    if (!label) continue;
    out = out.replace(new RegExp(escapeRegExp(label), "gi"), " ");
  }
  return out;
}

const wordRe = (phrase: string) => new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "i");

/* -------------------------------------------------------------------------- */
/*  F2 — peinado                                                                */
/* -------------------------------------------------------------------------- */

const HAIR_KEYWORDS: Record<string, string> = {
  bun: "bun", buns: "bun", ponytail: "ponytail", ponytails: "ponytail", braid: "braid", braids: "braid", braided: "braid",
  updo: "updo", loose: "loose", short: "short", long: "long", curly: "curly", curls: "curly", straight: "straight",
};
/** Estas solo se usan para pelo: cuentan en cualquier parte del texto. */
const HAIR_ONLY = new Set(["bun", "ponytail", "braid", "updo"]);
const HAIR_STOP_BACK = new Set([",", "with", "and", "wearing", "dressed", "has", "her", "his", "their", "a", "an", "the", "of", "in"]);
const HAIR_STOP_FWD = new Set([",", "and", "wearing", "with", "dressed"]);

/**
 * Palabras de peinado de una descripción (bun, ponytail, braid, loose, short,
 * long, curly, straight, updo). "short" y "long" solo cuentan pegadas a "hair"
 * ("short curly hair", "hair … in a low bun"): "a long linen dress" no es pelo.
 */
export function hairstyleKeywords(text: string): Set<string> {
  const toks = text.toLowerCase().replace(/[^a-z,\s-]/g, " ").match(/[a-z-]+|,/g) ?? [];
  const out = new Set<string>();
  const add = (t: string) => {
    const k = HAIR_KEYWORDS[t];
    if (k) out.add(k);
  };
  toks.forEach((t, i) => {
    const k = HAIR_KEYWORDS[t];
    if (k && HAIR_ONLY.has(k)) out.add(k);
    if (t !== "hair") return;
    for (let j = i - 1; j >= 0 && !HAIR_STOP_BACK.has(toks[j]); j--) add(toks[j]);
    for (let j = i + 1; j < toks.length && !HAIR_STOP_FWD.has(toks[j]); j++) add(toks[j]);
  });
  return out;
}

/**
 * "Mismo peinado" = todas las palabras de peinado de la referencia reaparecen en
 * la modelo nueva (rodete → rodete). Si la referencia no dice nada del peinado,
 * no hay contra qué comparar y no se marca.
 */
export function repeatsHairstyle(personDescription: string, refDescription: string): string[] | null {
  const ref = hairstyleKeywords(refDescription);
  if (ref.size === 0) return null;
  const mine = hairstyleKeywords(personDescription);
  return [...ref].every((k) => mine.has(k)) ? [...ref] : null;
}

/* -------------------------------------------------------------------------- */
/*  F3 — unidades                                                               */
/* -------------------------------------------------------------------------- */

/** ¿El usuario pidió más de una unidad? (heurística: número o palabra de cantidad). */
const UNITS_REQUEST_RE =
  /\b([2-9]|dos|tres|cuatro|cinco|seis|two|three|four|five|six|pairs?|par|pares|varias|varios|several|multiple|m[uú]ltiples|unidades|units|copias|copies)\b/i;
export function userAsksForUnits(userPrompt: string): boolean {
  return UNITS_REQUEST_RE.test(userPrompt);
}

/** Palabras que no pueden ir entre "two/another/both…" y el sustantivo de una unidad extra. */
const UNIT_GAP_STOP =
  "of|on|in|at|to|from|with|so|and|or|but|the|its|her|his|their|into|onto|over|under|by|for|as|that|while|than|near|beside|behind|toward|towards|across|around|against";

const COUNT_WORDS: Record<string, number> = {
  "a second": 2, second: 2, another: 2, two: 2, both: 2, "a pair of": 2, "pair of": 2,
  three: 3, four: 4, five: 5, six: 6, several: 3, multiple: 3,
};

/**
 * Menciones de MÁS unidades que las permitidas por sustantivo: "a second
 * light-blue terrycloth towel", "two towels", "another mat". `allowedByNoun`
 * suma las unidades de los ítems en cuadro que comparten sustantivo (un set con
 * una toalla blanca y una gris admite "both towels").
 */
export function extraUnitMentions(text: string, allowedByNoun: Map<string, number>): string[] {
  const found: string[] = [];
  for (const [noun, allowed] of allowedByNoun) {
    if (!noun) continue;
    // Comillas opcionales: el Director del A/B escribió las etiquetas entre
    // comillas ('A second "light-blue terrycloth towel" rests…').
    const q = `["\\u201C\\u201D]?`;
    // Entre el cuantificador y el sustantivo solo van modificadores ("a second
    // light-blue terrycloth towel"). Una preposición, un artículo o un conector
    // cortan la frase: "both hands resting on the towel", "another angle of the
    // towel" o "two steps so the towel" no son unidades extra (eran H10 al pedo).
    const gap = `(?:${q}(?!(?:${UNIT_GAP_STOP})\\b)[\\w'-]+${q}\\s+){0,4}?`;
    const re = new RegExp(
      `\\b(a second|second|another|two|three|four|five|six|both|a pair of|pair of|several|multiple)\\s+${gap}${q}${escapeRegExp(noun)}(?:e?s)?\\b`,
      "gi",
    );
    for (const m of text.matchAll(re)) {
      if ((COUNT_WORDS[m[1].toLowerCase()] ?? 2) > allowed) found.push(m[0]);
    }
  }
  return found;
}

/* -------------------------------------------------------------------------- */
/*  F6 — tomas                                                                  */
/* -------------------------------------------------------------------------- */

const AXIS_RE = {
  angle:
    /\b(left|right|opposite|three-quarter|profile|frontal|front view|rear|rotate[sd]?|orbit|degrees to the|side view|other side|opposite side|from the side|to the side|side angle|side profile)\b/i,
  distance:
    /\b(closer|close-up|close up|closeup|detail|macro|wider|wide|step(?:s|ping)? back|back up|pull(?:s|ing)? back|tight(?:er|ly)?|crop|full-length|full-body|full body|whole|farther|further back|zoom|move[sd]? in|fill(?:s|ing)?)\b/i,
  height:
    /\b(higher|lower|raise[sd]?|overhead|above|from below|low angle|high angle|look(?:s|ing)? (?:up|down)|down at|up at|downward|upward|hip height|knee height|waist height|top-down|bird's-eye|ground level|floor level)\b/i,
};

/** Cuántos ejes cambia una instrucción (ángulo/lado, distancia, altura). Heurística por palabras. */
export function shotAxes(instruction: string): number {
  return Object.values(AXIS_RE).filter((re) => re.test(instruction)).length;
}

/* -------------------------------------------------------------------------- */
/*  Color del producto de la referencia (H4 + fallback)                         */
/* -------------------------------------------------------------------------- */

/** En minúsculas. `names` = nombres de color prohibidos; `hex` = códigos prohibidos. */
export type RefColorTerms = { names: Set<string>; hex: Set<string> };

/**
 * Lo que H4 no deja llegar a un bloque del prompt: el `color_name` del producto
 * de cada referencia (si no es también un color del vendedor), su `color_hex` y
 * cualquier hex del producto. Si se escribe "royal blue", el modelo de imagen
 * pinta la toalla del vendedor de azul rey (la falla del 09-10).
 *
 * Desvío propio: si el MISMO color es parte legítima del entorno de la
 * referencia ("white square tiles" con toallas blancas), el nombre no se
 * prohíbe; si no, cada baño blanco con producto blanco caería al fallback. El
 * hex sigue prohibido y el COLOR_LOCK protege el color del vendedor.
 *
 * La usan validatePlan (H4) y el fallback, que no pasa por el validador y pega
 * textos de la nota de referencia: mismas reglas, mismas excepciones.
 */
export function referenceColorTerms(brief: ProductBrief | null, refs: ReferenceBrief[]): RefColorTerms {
  const items = brief?.items ?? [];
  const productColorNames = new Set(items.flatMap((i) => i.colors.map((c) => c.name.toLowerCase())));
  const hex = new Set<string>(
    items.flatMap((i) => i.colors.map((c) => c.hex).filter((h): h is string => !!h)).map((h) => h.toLowerCase()),
  );
  const names = new Set<string>();
  for (const ref of refs) {
    if (!ref.featured_product.present) continue;
    if (ref.featured_product.color_hex) hex.add(ref.featured_product.color_hex.toLowerCase());
    const name = ref.featured_product.color_name.trim().toLowerCase();
    if (!name || productColorNames.has(name)) continue;
    const env = [ref.scene.location, ref.scene.surfaces_and_materials, ...ref.scene.props].join(" ");
    if (wordRe(name).test(env)) continue;
    names.add(name);
  }
  return { names, hex };
}

function mentionsForbiddenColor(text: string, terms: RefColorTerms): boolean {
  const t = text.toLowerCase();
  for (const h of terms.hex) if (t.includes(h)) return true;
  for (const n of terms.names) if (wordRe(n).test(t)) return true;
  return false;
}

/**
 * Saca de un texto de la nota de referencia las CLÁUSULAS (entre comas o punto y
 * coma) que nombran el color prohibido; si una oración se queda sin cláusulas,
 * se va entera. "A woman wrapped in a royal blue bath towel with a matching
 * turban, framed from head to knees" → "Framed from head to knees". Un texto sin
 * el color vuelve igual, byte a byte.
 */
export function stripForbiddenColorClauses(text: string, terms: RefColorTerms): string {
  if (!text || (terms.names.size === 0 && terms.hex.size === 0) || !mentionsForbiddenColor(text, terms)) return text;
  const kept: string[] = [];
  for (const sentence of splitSentences(text)) {
    const s = sentence.trim();
    if (!s) continue;
    if (!mentionsForbiddenColor(s, terms)) {
      kept.push(s);
      continue;
    }
    const end = /[.!?]["')\]]*$/.exec(s)?.[0] ?? "";
    const body = end ? s.slice(0, -end.length) : s;
    const survivors = body
      .split(/\s*[,;]\s*/)
      .map((c) => c.trim())
      .filter((c) => c && !mentionsForbiddenColor(c, terms));
    if (survivors.length === 0) continue;
    const joined = survivors.join(", ");
    kept.push(`${/^[A-Z]/.test(s) ? capitalizeFirst(joined) : joined}${end}`);
  }
  return kept.join(" ");
}

/** Los campos que llegan tal cual al prompt final. */
export function promptBoundTexts(plan: Plan): Array<[string, string]> {
  return [
    ["purpose", plan.purpose],
    ["person_description", plan.person_description],
    ["product_placement", plan.product_placement],
    ["scene_paragraph", plan.scene_paragraph],
    ["allowed_objects", plan.allowed_objects.join("; ")],
    ["light_and_finish", plan.light_and_finish],
    ["light_placement", plan.light_placement],
    ["camera", plan.camera],
    ["secondary_use", plan.secondary_use],
    ...plan.shot_variations.map((s, i): [string, string] => [`shot_variations[${i}].instruction`, s.instruction]),
  ];
}

/* -------------------------------------------------------------------------- */
/*  validatePlan                                                                */
/* -------------------------------------------------------------------------- */

export function validatePlan(raw: unknown, ctx: PlanValidationContext): PlanValidation {
  // ---- H1 ----------------------------------------------------------------
  const parsed = planZ.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join(", ");
    return { ok: false, errors: [`H1: the plan does not match the schema (${issues})`], repairs: [], plan: null };
  }
  // Copia: nunca mutamos lo que nos pasaron (puede venir del cache).
  const plan: Plan = JSON.parse(JSON.stringify(parsed.data)) as Plan;
  const repairs: string[] = [];
  const R = ctx.usableRefs.length;
  const hasRef = R > 0;
  const brief = ctx.productBrief;
  const itemsById = new Map(brief.items.map((i) => [i.item_id, i]));
  const allLabels = brief.items.map((i) => i.label);

  // ---- Reparaciones --------------------------------------------------------
  // R8: allowed_objects máx 6.
  if (plan.allowed_objects.length > 6) {
    plan.allowed_objects = plan.allowed_objects.slice(0, 6);
    repairs.push("R8:allowed_objects_cortado_a_6");
  }
  plan.allowed_objects = plan.allowed_objects.map((o) => o.trim().replace(/[.;,]+$/, "")).filter(Boolean);

  // R9 (propia): un item_id repetido en items_in_frame se queda con la primera
  // aparición; si no, el prompt describiría dos veces el mismo ítem.
  const seenIds = new Set<string>();
  const dedup = plan.items_in_frame.filter((f) => (seenIds.has(f.item_id) ? false : (seenIds.add(f.item_id), true)));
  if (dedup.length !== plan.items_in_frame.length) {
    plan.items_in_frame = dedup;
    repairs.push("R9:items_in_frame_duplicados");
  }

  // R6: referencias dentro de rango.
  if (!hasRef) {
    if (plan.primary_reference !== 0 || plan.secondary_reference !== 0) repairs.push("R6:referencias_a_0");
    plan.primary_reference = 0;
    plan.secondary_reference = 0;
    plan.secondary_use = "";
  } else {
    if (plan.primary_reference < 1 || plan.primary_reference > R) {
      plan.primary_reference = 1;
      repairs.push("R6:primary_reference_a_1");
    }
    if (
      plan.secondary_reference !== 0 &&
      (plan.secondary_reference === plan.primary_reference || plan.secondary_reference < 1 || plan.secondary_reference > R)
    ) {
      plan.secondary_reference = 0;
      repairs.push("R6:secondary_reference_a_0");
    }
    if (plan.secondary_reference === 0) plan.secondary_use = "";
  }
  const primaryRef = hasRef ? (ctx.usableRefs[plan.primary_reference - 1] ?? null) : null;

  // R4: con estilo, la luz es del estilo salvo que el usuario haya pedido otra.
  // "Pedida" = hay user_prompt Y el Director la escribió: un light_owner
  // "user_instructions" con light_and_finish vacío dejaba el bloque LIGHT AND
  // FINISH sin ninguna luz (el ensamblado usa plan.light_and_finish y el look del
  // estilo no entraba). Visto en el dry-run (caso 7b); ahí gana el look del estilo.
  if (ctx.hasStyle) {
    const userOwns =
      plan.light_owner === "user_instructions" && ctx.userPrompt.length > 0 && plan.light_and_finish.trim().length > 0;
    if (!userOwns && (plan.light_owner !== "style" || plan.light_and_finish !== "")) {
      plan.light_owner = "style";
      plan.light_and_finish = "";
      repairs.push("R4:luz_del_estilo");
    }
  } else if (plan.light_owner === "style" || (plan.light_owner === "user_instructions" && !ctx.userPrompt)) {
    // R4b (propia): sin estilo no hay "luz del estilo" que insertar; el dueño es
    // la referencia o el Director. Si light_and_finish viene vacío, H7 lo agarra.
    plan.light_owner = hasRef ? "reference" : "director";
    repairs.push("R4b:luz_sin_estilo");
  }

  // R5: sin estilo no hay light_placement.
  if (!ctx.hasStyle && plan.light_placement) {
    plan.light_placement = "";
    repairs.push("R5:light_placement_vacio");
  }

  // R3: sin lentes en camera.
  if (LENS_RE.test(plan.camera)) {
    plan.camera = splitSentences(plan.camera)
      .filter((s) => !LENS_RE.test(s))
      .join("")
      .trim();
    repairs.push("R3:lente_fuera_de_camera");
  }

  // R10 (F2): sin persona no hay descripción de persona. Con persona, la frase
  // va dentro de otras oraciones ("The model is a woman…"): sin punto final y con
  // el artículo en minúscula.
  if (!plan.has_person && plan.person_description.trim()) {
    plan.person_description = "";
    repairs.push("R10:person_description_vacio");
  }
  plan.person_description = stripTrailingPeriod(plan.person_description).replace(/^(An?)(?=\s)/, (m) => m.toLowerCase());

  // R11 (F3): una unidad por ítem. El Director copiaba la cantidad de la
  // referencia (4 toallas → units 2) y el modelo duplicaba ítems. Solo el
  // usuario puede pedir más.
  if (!userAsksForUnits(ctx.userPrompt)) {
    for (const f of plan.items_in_frame) {
      if (f.units > 1) {
        repairs.push(`R11:units_a_1_${f.item_id}`);
        f.units = 1;
      }
    }
  }
  // Unidades permitidas por sustantivo (dos ítems pueden compartirlo).
  const allowedByNoun = new Map<string, number>();
  for (const f of plan.items_in_frame) {
    const item = itemsById.get(f.item_id);
    if (!item) continue;
    const noun = headNoun(item.label);
    allowedByNoun.set(noun, (allowedByNoun.get(noun) ?? 0) + f.units);
  }
  // R11b (F3): la unidad extra también sale del TEXTO ("…and a second
  // light-blue terrycloth towel rests folded on the shelf"); si no, SCENE
  // contradiría la línea de conteo del KEEP OUT. Lo que no se puede cortar sin
  // romper la oración queda para H10 (reintento).
  const hasExtra = (c: string) => extraUnitMentions(c, allowedByNoun).length > 0;
  for (const field of ["product_placement", "scene_paragraph"] as const) {
    if (!hasExtra(plan[field])) continue;
    plan[field] = dropClauses(plan[field], hasExtra, { splitAnd: true });
    repairs.push(`R11b:unidad_extra_quitada_de_${field}`);
  }
  const objectsBefore = plan.allowed_objects.length;
  plan.allowed_objects = plan.allowed_objects.filter((o) => !hasExtra(o));
  if (plan.allowed_objects.length !== objectsBefore) repairs.push("R11b:unidad_extra_quitada_de_allowed_objects");

  // R12 (F7): ningún objeto en la familia de color del producto (las velas teal
  // de la referencia parecían parte del set celeste). Se pasa a un neutro en la
  // lista y ese MISMO color en todos los campos de escena y en las tomas (visto en
  // vivo: el fondo "soft terracotta" pasó a blanco en la lista, pero las tomas 3 y
  // 4 seguían diciendo "terracotta backdrop" / "terracotta wall"). Solo familias
  // cromáticas; nunca toca las etiquetas ni lo que precede a un sustantivo del
  // producto, del cuerpo o de la naturaleza (ver colors.ts).
  const families = productColorFamilies(brief.items);
  if (families.size > 0) {
    const neutral = neutralColorFor(brief.items);
    const labelsLower = allLabels.map((l) => l.toLowerCase());
    const neutralized = new Set<string>();
    plan.allowed_objects = plan.allowed_objects.map((o) => {
      if (labelsLower.some((l) => o.toLowerCase().includes(l))) return o;
      const r = neutralizeColorPhrase(o, families, neutral);
      if (!r.changed) return o;
      r.colorWords.forEach((w) => neutralized.add(w));
      repairs.push(`R12:prop_neutralizado:${r.span.toLowerCase().replace(/\s+/g, "_")}_${r.head.toLowerCase()}`);
      return r.text;
    });
    if (neutralized.size > 0) {
      const protect = productProtectedNouns(allLabels);
      const apply = (field: string, text: string, set: (v: string) => void) => {
        const out = neutralizeColorWordsInText(text, neutralized, neutral, allLabels, protect);
        if (out !== text) {
          set(out);
          repairs.push(`R12:color_neutralizado_en_${field}`);
        }
      };
      apply("scene_paragraph", plan.scene_paragraph, (v) => (plan.scene_paragraph = v));
      apply("product_placement", plan.product_placement, (v) => (plan.product_placement = v));
      apply("person_description", plan.person_description, (v) => (plan.person_description = v));
      apply("camera", plan.camera, (v) => (plan.camera = v));
      // La luz también nombra objetos de la escena ("grazing the blue candles",
      // "on the terracotta wall"): sin esto, LIGHT contradecía a SCENE.
      apply("light_placement", plan.light_placement, (v) => (plan.light_placement = v));
      apply("light_and_finish", plan.light_and_finish, (v) => (plan.light_and_finish = v));
      plan.shot_variations.forEach((s, i) => apply(`shot_variations[${i}]`, s.instruction, (v) => (s.instruction = v)));
    }
  }

  // R13 (F11): la luz dice dirección, dureza y lado en sombra; nunca la forma de
  // la sombra de asas o correas (salió un asa fantasma dibujada en la sombra).
  for (const field of ["light_placement", "light_and_finish"] as const) {
    if (!SHADOW_OF_RE.test(plan[field])) continue;
    plan[field] = dropClauses(plan[field], (c) => SHADOW_OF_RE.test(c));
    repairs.push(`R13:sombra_de_piezas_quitada_de_${field}`);
  }

  // R2: la toma 1 es SIEMPRE el encuadre base.
  const macro = ctx.lockKind === "macro";
  if (plan.shot_variations[0]) {
    plan.shot_variations[0].instruction = BASE_SHOT_INSTRUCTION;
    plan.shot_variations[0].full_product_in_frame = !macro;
  }
  // R7: con lock macro ninguna toma muestra el producto entero.
  if (macro) plan.shot_variations.forEach((s) => (s.full_product_in_frame = false));

  // R1: topes de palabras (después de las otras reparaciones).
  const capField = (field: keyof typeof WORD_CAPS, value: string, set: (v: string) => void) => {
    const r = capWords(value, WORD_CAPS[field]);
    if (r.cut) {
      set(r.text);
      repairs.push(`R1:${field}_recortado`);
    }
  };
  capField("secondary_use", plan.secondary_use, (v) => (plan.secondary_use = v));
  capField("purpose", plan.purpose, (v) => (plan.purpose = v));
  capField("person_description", plan.person_description, (v) => (plan.person_description = stripTrailingPeriod(v)));
  capField("product_placement", plan.product_placement, (v) => (plan.product_placement = v));
  capField("scene_paragraph", plan.scene_paragraph, (v) => (plan.scene_paragraph = v));
  capField("light_and_finish", plan.light_and_finish, (v) => (plan.light_and_finish = v));
  capField("light_placement", plan.light_placement, (v) => (plan.light_placement = v));
  capField("camera", plan.camera, (v) => (plan.camera = v));
  plan.shot_variations.forEach((s, i) => {
    if (i === 0) return;
    capField("shot_instruction", s.instruction, (v) => (s.instruction = v));
  });

  // ---- Errores duros ------------------------------------------------------
  const errors: string[] = [];

  // H2: ítems existentes; en un set, todos (salvo que el usuario haya pedido otra cosa).
  for (const f of plan.items_in_frame) {
    if (!itemsById.has(f.item_id)) {
      errors.push(`H2: items_in_frame lists item_id ${f.item_id}, which is not in the product note`);
    }
  }
  if (brief.photo_set_kind === "set" && !ctx.userPrompt) {
    const inFrame = new Set(plan.items_in_frame.map((f) => f.item_id));
    const missing = brief.items.filter((i) => !inFrame.has(i.item_id)).map((i) => `"${i.label}"`);
    if (missing.length) {
      errors.push(`H2: the product is a set, so every item must be in items_in_frame (missing: ${missing.join(", ")})`);
    }
  }

  // H3: cada etiqueta en cuadro aparece literal en product_placement.
  const placementLower = plan.product_placement.toLowerCase();
  for (const f of plan.items_in_frame) {
    const item = itemsById.get(f.item_id);
    if (item && !placementLower.includes(item.label.toLowerCase())) {
      errors.push(`H3: product_placement must name the item exactly as "${item.label}"`);
    }
  }

  const fields = promptBoundTexts(plan);

  // H4: el color del producto de la referencia (o cualquier hex) no puede llegar
  // a los bloques (reglas y excepciones en `referenceColorTerms`).
  const colorTerms = referenceColorTerms(brief, ctx.usableRefs);
  for (const [field, text] of fields) {
    if (!text) continue;
    const t = stripLabels(text, allLabels).toLowerCase();
    for (const hex of colorTerms.hex) {
      if (t.includes(hex)) errors.push(`H4: ${field} contains the color code ${hex.toUpperCase()}; never write color codes`);
    }
    for (const name of colorTerms.names) {
      if (wordRe(name).test(t)) {
        errors.push(`H4: ${field} names "${name}", the reference product's color; refer to the seller's items only by their labels`);
      }
    }
  }

  // H5: nada de luz en la escena ni en la ubicación del producto.
  for (const [field, text] of [
    ["scene_paragraph", plan.scene_paragraph],
    ["product_placement", plan.product_placement],
  ] as const) {
    const m = LIGHT_WORDS_RE.exec(stripLabels(text, allLabels));
    if (m) errors.push(`H5: ${field} uses the light word "${m[0]}"; light belongs only to light_and_finish or light_placement`);
  }

  // H6: señales de inyección, o el nombre de la marca / del producto (que nunca
  // deben llegar al modelo de imagen: los escribiría como texto en la foto).
  const names = [ctx.productName, ctx.brandName].map((s) => s.trim()).filter((s) => s.length >= 4);
  for (const [field, text] of fields) {
    if (!text) continue;
    const lower = text.toLowerCase();
    const token = INJECTION_TOKENS.find((tk) => lower.includes(tk));
    if (token) errors.push(`H6: ${field} contains "${token}"`);
    const stripped = stripLabels(text, allLabels);
    for (const n of names) {
      if (wordRe(n).test(stripped)) errors.push(`H6: ${field} contains the product or brand name; never write it`);
    }
  }

  // H8: tokens de plantilla ("[PRODUCT]") que llegarían literales al prompt.
  for (const [field, text] of fields) {
    const m = TEMPLATE_TOKEN_RE.exec(text);
    if (m) {
      errors.push(`H8: ${field} contains the template token ${m[0]}; write each unit as the seller's item label`);
    }
  }

  // H7: si la luz es de la referencia, del Director o del usuario, tiene que estar
  // escrita (el ensamblado la usa tal cual; vacía = foto sin dirección de luz).
  // Con estilo, R4 ya devolvió al estilo un "user_instructions" vacío; acá solo
  // llega el caso sin estilo, que va al reintento con el error explicado.
  if (plan.light_owner !== "style" && !plan.light_and_finish.trim()) {
    errors.push(`H7: light_owner is "${plan.light_owner}" but light_and_finish is empty; write the full light, grading, lens and finish`);
  }

  // H9 (F2): persona descrita y distinta de la de la referencia. "new, anonymous
  // model" no alcanzó: la modelo salió casi idéntica a la de la foto de stock.
  if (plan.has_person) {
    if (!plan.person_description.trim()) {
      errors.push("H9: has_person is true but person_description is empty; describe the anonymous model's age range, build, hair color, length and style, and clothing");
    } else if (primaryRef?.person.present) {
      const same = repeatsHairstyle(plan.person_description, primaryRef.person.description);
      if (same) {
        errors.push(
          `H9: person_description repeats the reference person's hairstyle (${same.join(", ")}); give the model a different hairstyle and change at least two of age range, hair length or color, build and clothing`,
        );
      }
    }
    // El peinado de la referencia copiado en la escena ("her dark hair in a low
    // bun") contradice a person_description en el mismo prompt (SCENE la presenta).
    if (primaryRef?.person.present) {
      const inScene = repeatsHairstyle(`${plan.scene_paragraph} ${plan.product_placement}`, primaryRef.person.description);
      if (inScene) {
        errors.push(
          `H9: scene_paragraph or product_placement describes the reference person's hairstyle (${inScene.join(", ")}); there the person is only "the model", and her look lives in person_description`,
        );
      }
    }
  }

  // H10 (F3): lo que R11b no pudo cortar (una unidad extra en la oración principal,
  // o en otro campo). El prompt diría "exactly one" y a la vez "two towels".
  for (const [field, text] of fields) {
    const extra = extraUnitMentions(text, allowedByNoun);
    if (extra.length) {
      errors.push(`H10: ${field} shows more units than items_in_frame ("${extra[0]}"); each item appears exactly once unless the user instructions ask for more`);
    }
  }

  // H11 (F6a): una toma no saca de cuadro un ítem que product_placement pone en
  // escena ("with the mat cropped out" → el modelo lo metió igual, enrollado en
  // otro estante). Se mira por cláusula: "cropping out the shelf" es válido.
  const inFrameItems = plan.items_in_frame.map((f) => itemsById.get(f.item_id)).filter((x): x is NonNullable<typeof x> => !!x);
  const itemNouns = [...new Set([...inFrameItems.map((i) => headNoun(i.label)), "product", "item"])].filter(Boolean);
  const itemWordRe = new RegExp(
    `\\b(?:${[...inFrameItems.map((i) => escapeRegExp(i.label)), ...itemNouns.map(escapeRegExp)].join("|")})(?:e?s)?\\b`,
    "i",
  );
  // Sin gerundios en el medio: "without cropping the handbag" pide lo contrario
  // (mantenerla entera) y disparaba H11.
  const withoutRe = new RegExp(
    `\\bwithout (?:the |any |its )?(?:(?![\\w'-]*ing\\b)[\\w'-]+\\s+){0,3}?(?:${itemNouns.map(escapeRegExp).join("|")})(?:e?s)?\\b`,
    "i",
  );
  plan.shot_variations.forEach((s, i) => {
    if (i === 0) return;
    const clauses = s.instruction.split(/,|;|\bwith\b|\band\b|\bwhile\b/i);
    const cropsItem = clauses.some((c) => CROP_OUT_RE.test(c) && itemWordRe.test(c));
    if (cropsItem || withoutRe.test(s.instruction)) {
      errors.push(
        `H11: shot_variations[${i}].instruction takes a product item out of the image; every item in product_placement stays in every shot (a detail crop keeps it at least partly visible at the edge)`,
      );
    }
  });

  // H12 (F10): sin referencia ni estilo, la foto de catálogo es el producto solo.
  // Una modelo en la calle para las 5 tomas dejaba al catálogo sin foto principal.
  if (!hasRef && !ctx.hasStyle && plan.has_person && !ctx.userPrompt) {
    errors.push("H12: with neither reference nor style the product appears alone; set has_person to false unless the user instructions ask for a person");
  }

  if (plan.shot_variations.length !== SHOT_COUNT) {
    errors.push(`H1: shot_variations must have exactly ${SHOT_COUNT} entries`);
  }

  const unique = [...new Set(errors)];
  if (unique.length) return { ok: false, errors: unique, repairs, plan };

  // R14 (F6b): la imagen 2 es la que más se publica después de la 1: tiene que
  // cambiar al menos dos ejes (en D "stepping back" dio la misma foto). Si la
  // toma 2 cambia uno solo y alguna de las 3-5 cambia dos, se intercambian. Con
  // lock no aplica: el lock fija ángulo y altura. Va AL FINAL y solo sobre un
  // plan que ya pasó: si se intercambiara antes, los errores del reintento
  // nombrarían tomas con otro índice que el que escribió el Director.
  if (!ctx.lockKind && plan.shot_variations.length >= 3 && shotAxes(plan.shot_variations[1].instruction) < 2) {
    const k = plan.shot_variations.findIndex((s, i) => i >= 2 && shotAxes(s.instruction) >= 2);
    if (k > 1) {
      [plan.shot_variations[1], plan.shot_variations[k]] = [plan.shot_variations[k], plan.shot_variations[1]];
      repairs.push(`R14:toma_2_por_toma_${k + 1}`);
    }
  }
  return { ok: true, plan, repairs };
}
