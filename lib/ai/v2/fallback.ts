/**
 * FALLBACK DETERMINÍSTICO (spec §2.7) — el plan sin Director. Función PURA.
 *
 * Se usa cuando el Director falla dos veces, se corta por tiempo, no pasa la
 * validación, o falta la nota del producto. Produce un `Plan` con la misma forma
 * que el del Director, así el ensamblado es UNO solo. No se cachea: la próxima
 * tanda vuelve a intentar con el Director.
 *
 * Regla de oro: la v2 NUNCA cae en silencio al texto de v1. Si el Director no
 * está, el plan sale de acá y el snapshot lo dice (`plan_source: "fallback"`).
 *
 * v2.1: una unidad por ítem (F3: los [PRODUCT] sobrantes del template se
 * quitan), modelo distinta a la de la referencia (F2), toma 2 que cambia dos
 * ejes (F6b) y el ítem dudoso a un costado, en un lugar a su escala (F4/F5).
 */

import { selectProductPhotos } from "@/lib/ai/v2/assemble";
import { IMAGE_MAX_PRODUCT_PHOTOS } from "@/lib/ai/v2/constants";
import type { Plan, ShotVariation } from "@/lib/ai/v2/director";
import type { BriefItem, ProductBrief } from "@/lib/ai/v2/product-brief";
import type { ReferenceBrief } from "@/lib/ai/v2/reference-brief";
import { capitalizeFirst, clean, dropClauses, joinList, LIMITS, stripTrailingPeriod } from "@/lib/ai/v2/sanitize";
import { STYLE_PARTS, type LockKind, type StyleParts } from "@/lib/ai/v2/style-parts";
import type { CaseKind } from "@/lib/ai/v2/types";
import {
  BASE_SHOT_INSTRUCTION,
  hairstyleKeywords,
  referenceColorTerms,
  stripForbiddenColorClauses,
} from "@/lib/ai/v2/validate-plan";

export type FallbackInput = {
  productBrief: ProductBrief | null;
  /** La primera referencia usable (Reference 1), o null. */
  primaryRef: ReferenceBrief | null;
  caseKind: CaseKind;
  styleParts: StyleParts | null;
  effectiveLock: string | null;
  /** Tipo del lock EFECTIVO (null si no hay lock o la referencia le gana). */
  lockKind: LockKind | null;
  userPrompt: string;
  /**
   * G2 (v2.2): hay referencia pero SIN nota (primaryRef es null). La escena, la
   * cámara y la luz remiten a la imagen por su ordinal en vez de copiar texto.
   */
  genericRef?: boolean;
  /** Fotos de producto disponibles: con `genericRef` da el ordinal de la referencia (P+1). */
  availablePhotoCount?: number;
};

const shot = (instruction: string, full: boolean, label: string): ShotVariation => ({
  label,
  instruction,
  full_product_in_frame: full,
});

// Desvío propio en la toma 2 default: la spec decía "…for a three-quarter view…",
// pero DEFAULT_CAMERA ya ES una vista de tres cuartos, así que la toma 2 pedía la
// misma vista que la base y salía casi igual a la imagen 1 (una imagen paga
// desperdiciada). v2.1 (F6b): además cambia DOS ejes (lado + distancia); con un
// solo eje la imagen 2 salía casi igual a la 1 (caso D del A/B).
export const FALLBACK_SHOTS: Record<"default" | "overhead" | "macro", ShotVariation[]> = {
  default: [
    shot(BASE_SHOT_INSTRUCTION, true, "base"),
    shot("Move the camera about 40 degrees to the left, toward the product's side, and closer so the product fills about 75% of the frame.", true, "side, closer"),
    shot("Move closer so the product fills about 80% of the frame.", true, "closer"),
    shot("Raise the camera slightly to look down about 20 degrees at the product.", true, "higher"),
    shot("Step back for a wider framing with more of the surroundings visible.", true, "wider"),
  ],
  // Bajo lock cenital solo cambian distancia, recorte y ubicación: la toma 2
  // combina las dos cosas que sí puede cambiar.
  overhead: [
    shot(BASE_SHOT_INSTRUCTION, true, "base"),
    shot("Crop tighter and shift the framing so the main item sits on the left third.", true, "tighter, left third"),
    shot("Shift the framing so the main item sits on the right third.", true, "right third"),
    shot("Crop in close on the main item's texture, the other items at the edges of the frame.", false, "texture detail"),
    shot("Slightly wider crop with more empty surface around the arrangement.", true, "wider"),
  ],
  macro: [
    shot(BASE_SHOT_INSTRUCTION, false, "base"),
    shot("Focus on a different distinctive detail of the product.", false, "other detail"),
    shot("Slightly wider macro crop showing where the detail meets the rest of the product.", false, "wider macro"),
    shot("Lower grazing viewpoint across the surface.", false, "grazing"),
    shot("Tighter crop on the finest texture.", false, "tightest"),
  ],
};

// Desvío propio: sin "centered". Con lifestyle (sin lock) la escena dice "framed
// slightly off-center following the rule of thirds" y la cámara decía "the
// product centered": dos órdenes opuestas en el mismo prompt. estudio_limpio y
// fondo_color ya piden el centro en su propio setting.
const DEFAULT_CAMERA = "Eye-level three-quarter view, the product filling about 60% of the frame, in sharp focus.";

/**
 * Una cláusula por cada ítem de confianza baja (safest_rendering). Desvío de la
 * spec §2.7 ("shown exactly as in its photo ({{view}})"): `view` es un ÁNGULO DE
 * CÁMARA ("flat, top view", "label close-up"), no el estado del objeto, y
 * chocaba con CAMERA ("side view") y con "shown whole". Se nombra el estado
 * físico en neutro, sin asumir que es un textil.
 */
function lowConfidenceClauses(items: BriefItem[]): string {
  return items
    .filter((i) => i.category_confidence === "low")
    .map((i) => ` The ${i.label} keeps the same resting shape it has in its product photo.`)
    .join("");
}

/**
 * Ubicación estándar (spec §2.7). Desvío propio bajo lock MACRO: "shown whole"
 * contradice un primerísimo plano (y el ensamblado ya no pone MARGIN), así que
 * ahí el producto es "el sujeto del primer plano".
 */
function standardPlacement(labels: string[], macro: boolean): string {
  if (labels.length <= 1) {
    const l = labels[0] ?? "product";
    return macro
      ? `The ${l} is the clear subject of the close-up.`
      : `The ${l} is the clear subject, shown whole in its natural resting position.`;
  }
  const list = capitalizeFirst(joinList(labels.map((l) => `the ${l}`)));
  return macro
    ? `${list} are the clear subjects of the close-up, side by side.`
    : `${list} appear together side by side as a set, each one fully visible.`;
}

/**
 * G2 (v2.2): ubicación con una referencia SIN nota. No hay template que diga el
 * rol del producto; eso lo pone ROLES ("put … in its place"). Acá solo se nombra
 * el sujeto: "natural resting position" chocaría con un producto puesto o en uso.
 */
function genericPlacement(labels: string[], macro: boolean): string {
  if (macro) return standardPlacement(labels, true);
  if (labels.length <= 1) return `The ${labels[0] ?? "product"} is the clear subject, fully visible.`;
  return `${capitalizeFirst(joinList(labels.map((l) => `the ${l}`)))} are the clear subjects, each one fully visible.`;
}

// Marcas internas (Unicode de uso privado, sin caracteres de control: ESLint
// no-control-regex) para los [PRODUCT] del template.
const USED_OPEN = "\uE000";
const USED_CLOSE = "\uE001";
const EXTRA_TOKEN = "\uE002";

/**
 * Reemplaza los [PRODUCT] del template en orden: el 1º por el ítem principal y
 * los siguientes por los ítems que quedan. v2.1 (F3): una unidad por ítem, así
 * que un [PRODUCT] SOBRANTE ya no es "a second <label>": su cláusula se va
 * ("…wearing [PRODUCT] around her body and [PRODUCT] as a turban" → solo el
 * cuerpo). El determinante de adelante ("one", "another") y el plural se
 * consumen. Devuelve qué etiquetas quedaron en la escena.
 */
function fillTemplate(
  template: string,
  labels: string[],
): { text: string; used: Set<string>; droppedWords: Set<string> } {
  let idx = 0;
  const marked = template.replace(
    /(?:\b(?:one|a|an|the|another|two|three|some|several)\s+)?\[PRODUCT\](?:s\b)?/gi,
    () => (idx < labels.length ? `${USED_OPEN}${idx++}${USED_CLOSE}` : EXTRA_TOKEN),
  );
  const trimmed = marked.includes(EXTRA_TOKEN) ? dropClauses(marked, (c) => c.includes(EXTRA_TOKEN), { splitAnd: true }) : marked;
  // Palabras que solo estaban en las cláusulas quitadas ("turban"): el encuadre de
  // la referencia puede nombrarlas ("from the top of the turban") y la cámara
  // pediría la unidad que F3 sacó.
  const wordsOf = (s: string) => new Set(s.toLowerCase().match(/[a-z]{4,}/g) ?? []);
  const kept = wordsOf(trimmed);
  const droppedWords = new Set([...wordsOf(marked)].filter((w) => !kept.has(w) && !DROPPED_STOP.has(w)));
  const used = new Set<string>();
  const text = trimmed.replace(new RegExp(`${USED_OPEN}(\\d+)${USED_CLOSE}`, "g"), (_m, k: string, offset: number, whole: string) => {
    const label = labels[Number(k)];
    used.add(label);
    const phrase = `the ${label}`;
    return /(^|[.!?]\s*)$/.test(whole.slice(0, offset)) ? capitalizeFirst(phrase) : phrase;
  });
  return { text, used, droppedWords };
}

/** Palabras de relleno que no identifican el rol quitado. */
const DROPPED_STOP = new Set(["into", "onto", "over", "with", "from", "around", "their", "each", "both", "other", "another", "second", "while", "that", "this", "under"]);

/**
 * "…with dark hair in a low bun" pegado a la persona del template: es el peinado
 * de la referencia y contradecía al de la modelo nueva en la misma SCENE (F2).
 * Solo se quita si lo que sigue arranca la oración principal (una coma o un verbo
 * conocido); si no ("with her hair wrapped in…", un rol del producto), se deja.
 */
const PERSON_HAIR_TAIL_RE =
  /^,?\s+with\s+(?:[\w'-]+\s+){0,4}?hair(?:\s+(?:in|into)\s+(?:[\w'-]+\s+){0,3}?(?:bun|ponytail|braids?|updo|knot|chignon)|\s+(?:tied|pulled|swept|gathered|worn)(?:\s+(?:back|up))?(?:\s+(?:in|into)\s+(?:[\w'-]+\s+){0,3}?(?:bun|ponytail|braids?|updo|knot|chignon))?)?/i;
const MAIN_CLAUSE_START_RE =
  /^(?:,|\s+(?:stands|sits|leans|walks|lies|poses|holds|wears|is|looks|smiles|kneels|reclines|rests|faces|turns|wearing|holding|standing|sitting)\b)/;

/**
 * F2 (v2.1): la modelo del fallback es VISIBLEMENTE distinta de la persona de la
 * referencia: otro peinado, otro color de pelo y otra contextura (tres rasgos,
 * sin rostro). La edad no se toca: el template de la referencia puede nombrarla
 * y serían dos órdenes opuestas.
 */
export function distinctPersonDescription(refDescription: string): string {
  const d = refDescription.toLowerCase();
  const noun = /\b(woman|female|girl|lady)\b/.test(d) ? "woman" : /\b(man|male|boy|gentleman)\b/.test(d) ? "man" : "person";
  const refHair = hairstyleKeywords(refDescription);
  const options = [
    { kw: ["short", "curly"], text: (c: string) => `short curly ${c} hair` },
    { kw: ["long", "loose"], text: (c: string) => `long loose ${c} hair` },
    { kw: ["ponytail"], text: (c: string) => `${c} hair in a sleek low ponytail` },
  ];
  const hair = options.find((o) => o.kw.every((k) => !refHair.has(k))) ?? options[0];
  const color = /\b(dark|black|brown|brunette|auburn|red)\b/.test(d) ? "light brown" : "dark brown";
  const build = /\b(slim|thin|petite|slender)\b/.test(d) ? "a medium build" : "a slim build";
  return `a ${noun} with ${hair.text(color)} and ${build}`;
}

/** "A woman in her late twenties stands…" → "The model stands…" (la presenta SCENE). */
const PERSON_NP_RE =
  /\b(?:A|An)\s+(?:[\w-]+\s+){0,4}?(?:woman|man|female|male|girl|boy|person|model|lady)\b(?:\s+in\s+(?:her|his|their)\s+(?:early\s+|mid\s+|late\s+|mid-)?(?:teens|twenties|thirties|forties|fifties|sixties|20s|30s|40s|50s|60s))?/;

export function buildFallbackPlan(i: FallbackInput): Plan {
  const brief = i.productBrief;
  const ref = i.primaryRef;
  const hasRef = i.caseKind === "ref_and_style" || i.caseKind === "ref_only";
  const macro = i.lockKind === "macro";

  // Ítems: el principal primero (es el que ocupa el primer [PRODUCT]).
  const items: BriefItem[] = brief
    ? [
        ...brief.items.filter((x) => x.item_id === brief.primary_item_id),
        ...brief.items.filter((x) => x.item_id !== brief.primary_item_id),
      ]
    : [];
  const labels = brief ? items.map((x) => x.label) : ["product"];

  // Desvío propio (regla 8 del Director / safest_rendering): un ítem de confianza
  // BAJA nunca ocupa un [PRODUCT] del template, porque el slot es un ROL (puesto,
  // en la mano, de turbante) y ese rol depende justo de la lectura dudosa (el
  // "mat" no puede terminar de turbante). Queda al costado, como en su foto.
  const slotLabels = brief ? items.filter((x) => x.category_confidence !== "low").map((x) => x.label) : labels;

  // Desvío propio (H4 también para el fallback): el fallback no pasa por
  // validatePlan y pegaba tal cual textos de la nota de referencia. El prompt de
  // esa nota solo le prohíbe el color del producto al scene_template; en framing
  // o location es esperable que lo nombre ("a woman wrapped in a royal blue bath
  // towel…"), y eso le describía al modelo la foto a hacer con la toalla azul
  // rey. Se sacan las cláusulas con el color (mismas reglas que H4) y cualquier
  // [PRODUCT] suelto fuera del template.
  const colorTerms = referenceColorTerms(brief, ref ? [ref] : []);
  const refText = (s: string) => stripForbiddenColorClauses(s, colorTerms).replace(/\[PRODUCT\]/g, `the ${labels[0]}`);
  const refParts = ref
    ? {
        location: refText(ref.scene.location),
        surfaces: refText(ref.scene.surfaces_and_materials),
        cameraAngle: refText(ref.composition.camera_angle),
        framing: refText(ref.composition.framing),
        lighting: refText(ref.lighting),
        template: stripForbiddenColorClauses(ref.scene_template, colorTerms),
      }
    : null;

  // Desvío propio (regla 5 del Director, que acá nadie aplicaba): con un lock
  // efectivo, el template describe el rol del producto en la geometría de la
  // REFERENCIA. Si hay una persona (el producto está puesto) o el lock es cenital
  // o de levitación, el template contradice al lock ("wearing the towel" +
  // "levitates mid-air, no visible supports"). Ahí se usa solo el lugar y sus
  // superficies, y la persona sale del plan.
  const lockBreaksTemplate =
    !!i.effectiveLock && !!ref && (ref.person.present || i.lockKind === "overhead" || i.lockKind === "levitation");
  const hasPerson = hasRef && !lockBreaksTemplate ? (ref?.person.present ?? false) : false;

  const asSentences = (...xs: string[]) =>
    xs
      .map(stripTrailingPeriod)
      .filter(Boolean)
      .map((s) => `${capitalizeFirst(s)}.`)
      .join(" ");
  const neutralScene = `The ${labels[0]} rests on a clean, pale neutral surface in front of a seamless light gray backdrop.`;
  // F4/F5 (v2.1): el ítem dudoso (o el que quedó sin slot) va a un costado, en un
  // lugar a su escala; "beside it" ponía una colchoneta de 180 cm en un estante.
  const aside = (l: string) => `The ${l} rests to one side of the scene in a spot that fits its real size, fully visible.`;

  // ---- Escena + ubicación ---------------------------------------------------
  let scene: string;
  let placement: string;
  let droppedWords = new Set<string>();
  const templateTokens = refParts ? (refParts.template.match(/\[PRODUCT\]/g) ?? []).length : 0;

  // G2 (v2.2): referencia sin nota. Su ordinal es P+1, con P = las fotos que va a
  // elegir el ensamblado para ESTOS ítems (misma función, mismo orden: el
  // principal primero, como en items_in_frame).
  const generic = hasRef && !ref && !!i.genericRef;
  const refImage = generic
    ? `Image ${
        selectProductPhotos(brief, items.map((x) => x.item_id), i.availablePhotoCount ?? IMAGE_MAX_PRODUCT_PHOTOS).length + 1
      }`
    : "";

  if (generic) {
    // Sin nota no hay texto de la referencia que copiar: la escena remite a la
    // imagen. Con lock, solo lugar, superficies y props (el ángulo es del estilo).
    scene = i.effectiveLock
      ? `The new photo takes the place, the surfaces and the props of ${refImage}.`
      : `The new photo recreates the scene of ${refImage}: the same place, surfaces and props, with the same composition and camera angle.`;
    // El ítem dudoso no toma el lugar del producto de la referencia (mismo
    // criterio que con template): va a un costado. Si todos son dudosos, van todos.
    const subjects = slotLabels.length > 0 ? slotLabels : labels;
    placement = [genericPlacement(subjects, macro), ...labels.filter((l) => !subjects.includes(l)).map(aside)].join(" ");
  } else if (hasRef && ref && refParts && !lockBreaksTemplate && ref.template_ok && templateTokens > 0 && slotLabels.length > 0) {
    const filled = fillTemplate(refParts.template, slotLabels);
    scene = filled.text;
    droppedWords = filled.droppedWords;
    placement = labels.filter((l) => !filled.used.has(l)).map(aside).join(" ");
  } else {
    if (hasRef && refParts && lockBreaksTemplate) {
      scene = asSentences(refParts.location, refParts.surfaces) || i.styleParts?.setting || neutralScene;
    } else if (hasRef && ref && refParts && ref.template_ok && refParts.template && templateTokens === 0) {
      // Template sin slot (la referencia no mostraba producto): sirve como escena,
      // y el producto se ubica con la frase estándar.
      scene = refParts.template;
    } else if (hasRef && refParts) {
      scene = asSentences(refParts.location, refParts.framing) || neutralScene;
    } else if (i.styleParts) {
      scene = i.styleParts.setting;
    } else {
      // F10: sin referencia ni estilo, el producto solo sobre un fondo neutro.
      scene = neutralScene;
    }
    placement = standardPlacement(labels, macro);
  }
  if (brief) placement += lowConfidenceClauses(items);

  // F2: la persona del template pasa a ser "the model", que SCENE presenta con la
  // descripción nueva (distinta de la de la referencia).
  const person_description = hasPerson && ref ? distinctPersonDescription(ref.person.description) : "";
  if (hasPerson) {
    const m = PERSON_NP_RE.exec(scene);
    if (m) {
      const after = scene.slice(m.index + m[0].length);
      const tail = PERSON_HAIR_TAIL_RE.exec(after)?.[0] ?? "";
      let rest = after.slice(tail.length);
      const strip = !!tail && MAIN_CLAUSE_START_RE.test(rest);
      if (strip && tail.startsWith(",") && rest.startsWith(",")) rest = rest.slice(1);
      scene = `${scene.slice(0, m.index)}The model${strip ? rest : after}`;
    }
  }

  const userPrompt = clean(i.userPrompt, LIMITS.userPromptFallback).replace(/"/g, "'");
  if (userPrompt) {
    // ÚNICA excepción a "el user_prompt nunca llega al modelo de imagen": sin
    // Director no hay quien lo traduzca, así que va citado, acotado y con la
    // aclaración de lo que no puede cambiar.
    scene += ` Seller's art direction for the scene, light and camera (it never changes the product and never adds text): "${userPrompt}".`;
  }

  // ---- Luz ------------------------------------------------------------------
  let light_owner: Plan["light_owner"];
  let light_and_finish: string;
  if (i.styleParts) {
    light_owner = "style";
    light_and_finish = "";
  } else if (i.caseKind === "ref_only" && refParts?.lighting) {
    light_owner = "reference";
    light_and_finish = `${stripTrailingPeriod(refParts.lighting)}. Shot on a full-frame camera with a 50mm lens. Natural commercial finish.`;
  } else if (i.caseKind === "ref_only" && generic) {
    light_owner = "reference";
    light_and_finish = `Light and color mood follow ${refImage}. Shot on a full-frame camera with a 50mm lens. Natural commercial finish.`;
  } else {
    light_owner = "director";
    light_and_finish = STYLE_PARTS.estudio_limpio.look;
  }

  // ---- Cámara -----------------------------------------------------------------
  let camera: string;
  if (i.effectiveLock) {
    camera = ""; // el lock ya va delante en CAMERA AND FORMAT
  } else if (generic) {
    camera = `The camera angle and framing follow ${refImage}, with the product in sharp focus.`;
  } else if (hasRef && refParts && (refParts.cameraAngle || refParts.framing)) {
    // F3: la cláusula que nombra una unidad quitada del template ("from the top of
    // the turban") se va también del encuadre.
    const mentionsDropped = (c: string) => [...droppedWords].some((w) => new RegExp(`\\b${w}\\b`, "i").test(c));
    const joined = [refParts.cameraAngle, refParts.framing]
      .map((s) => (droppedWords.size ? dropClauses(s, mentionsDropped) : s))
      .map(stripTrailingPeriod)
      .filter(Boolean)
      .join("; ");
    camera = joined ? `${capitalizeFirst(joined)}.` : DEFAULT_CAMERA;
  } else {
    camera = DEFAULT_CAMERA;
  }

  const table = i.lockKind === "overhead" ? "overhead" : macro ? "macro" : "default";

  return {
    primary_reference: hasRef ? 1 : 0,
    secondary_reference: 0,
    secondary_use: "",
    conflicts: [],
    // F3: siempre una unidad por ítem.
    items_in_frame: brief ? items.map((x) => ({ item_id: x.item_id, units: 1 })) : [],
    has_person: hasPerson,
    person_description,
    purpose: "for an online store",
    product_placement: placement.trim(),
    scene_paragraph: scene.trim(),
    allowed_objects: [],
    light_owner,
    light_and_finish,
    light_placement: "",
    camera,
    shot_variations: FALLBACK_SHOTS[table].map((s) => ({ ...s })),
    user_instructions_applied: userPrompt ? "quoted verbatim in the scene (fallback)" : "",
    rejected_requests: [],
    summary_es: "Plan de respaldo determinístico (sin Director).",
  };
}
