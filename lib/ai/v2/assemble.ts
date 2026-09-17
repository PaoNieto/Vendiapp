/**
 * ENSAMBLADO FINAL (spec §2.6) — el prompt que ve el modelo de imagen. PURO: sin
 * red, sin base, sin reloj. Un dry-run del A/B lo puede correr con notas y plan
 * de mentira y comparar el texto byte a byte.
 *
 * Quién escribe qué en el prompt final:
 *   - roles de imagen, etiquetas "Image N", KEEP OUT, COLOR_LOCK → el CÓDIGO.
 *   - la apariencia del producto → la nota del producto (identity_sentence, hex).
 *   - escena, ubicación, cámara, tomas → el plan (Director o fallback).
 *   - luz → el `look` del estilo TAL CUAL, o el plan si no hay estilo.
 * El nombre del producto, la marca y el user_prompt crudo nunca entran (salvo el
 * fallback, que cita el user_prompt dentro de la escena).
 */

import type { GeminiPart } from "@/lib/ai/gemini-client";
import type { OutputRatio } from "@/lib/constants";
import { deriveColorName, normColorName } from "@/lib/ai/v2/colors";
import { IMAGE_MAX_PRODUCT_PHOTOS, SHOT_COUNT } from "@/lib/ai/v2/constants";
import type { Plan } from "@/lib/ai/v2/director";
import type { BriefItem, ProductBrief, Rigidity } from "@/lib/ai/v2/product-brief";
import type { ReferenceBrief } from "@/lib/ai/v2/reference-brief";
import { capitalizeFirst, joinList, pluralizeLabel, squeeze, stripTrailingPeriod } from "@/lib/ai/v2/sanitize";
import type { LockKind, StyleParts } from "@/lib/ai/v2/style-parts";
import type { CaseKind, InlineImage, ItemId, PlanSource } from "@/lib/ai/v2/types";

export const RATIO_SENTENCE: Record<OutputRatio, string> = {
  "1:1": "Square 1:1 image.",
  "4:5": "Vertical 4:5 image.",
  "9:16": "Tall vertical 9:16 image.",
  "16:9": "Wide horizontal 16:9 image.",
};

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six"];

export type AssembleInput = {
  plan: Plan;
  planSource: PlanSource;
  caseKind: CaseKind;
  productBrief: ProductBrief | null;
  /** Fotos de producto disponibles, en orden (las que vio la nota, máx 8). */
  availablePhotoCount: number;
  /** Referencias usables en el orden de la versión (n = índice + 1). */
  refs: ReferenceBrief[];
  styleParts: StyleParts | null;
  effectiveLock: string | null;
  /** Tipo del lock efectivo. */
  lockKind: LockKind | null;
  ratio: OutputRatio;
  variations: number;
  /**
   * G2 (v2.2): caso con referencia pero `refs` vacío porque la nota de la
   * referencia falló. Su imagen viaja igual como Image P+1 (refN 1) con un rol
   * genérico escrito acá.
   */
  genericRef?: boolean;
};

export type ImageSlot =
  | { role: "product"; photoIndex: number; label: string }
  | { role: "reference"; refN: number; label: string }
  | { role: "supporting_reference"; refN: number; label: string };

export type AssembledBatch = {
  /** Orden de las imágenes en cada llamada (idéntico en las N). */
  slots: ImageSlot[];
  /** Índices (1-based) de las fotos elegidas, en el orden de la nota. */
  selectedPhotos: number[];
  /** Un prompt por imagen; solo cambia el bloque SHOT. */
  prompts: string[];
  shotIndexes: number[];
};

/* -------------------------------------------------------------------------- */
/*  Selección de fotos de producto                                              */
/* -------------------------------------------------------------------------- */

const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from + 1) }, (_, k) => from + k);

/**
 * Spec §2.6 "Selección de imágenes":
 *   1. candidatas = fotos no "poor" cuyos ítems estén TODOS en cuadro;
 *   2. por cada ítem en cuadro su mejor foto (good > partial, foto de un ítem >
 *      foto de grupo, índice menor);
 *   3. se completa hasta 6 con el resto de las candidatas en orden;
 *   4. sin candidatas, las primeras 6 descargadas.
 * Desvío propio: si un ítem en cuadro no tiene NINGUNA candidata (su única foto
 * es "poor" o sale con otro ítem que no está en cuadro), se toma igual su mejor
 * foto: un ítem sin imagen es un ítem que el modelo tiene que inventar.
 */
export function selectProductPhotos(
  brief: ProductBrief | null,
  inFrameIds: ItemId[],
  availablePhotoCount: number,
): number[] {
  const cap = Math.min(IMAGE_MAX_PRODUCT_PHOTOS, availablePhotoCount);
  if (!brief || brief.photos.length === 0) return range(1, cap);

  const inFrame = new Set(inFrameIds);
  const valid = brief.photos.filter((p) => p.photo_index <= availablePhotoCount);
  const candidates = valid.filter((p) => p.identity_quality !== "poor" && p.item_ids.every((id) => inFrame.has(id)));
  const q = (x: string) => (x === "good" ? 0 : x === "partial" ? 1 : 2);
  const byRank = (a: (typeof valid)[number], b: (typeof valid)[number]) =>
    q(a.identity_quality) - q(b.identity_quality) ||
    (a.item_ids.length === 1 ? 0 : 1) - (b.item_ids.length === 1 ? 0 : 1) ||
    a.photo_index - b.photo_index;

  const chosen = new Set<number>();
  for (const id of inFrameIds) {
    let pool = candidates.filter((p) => p.item_ids.includes(id));
    if (pool.length === 0) pool = valid.filter((p) => p.item_ids.includes(id));
    const best = [...pool].sort(byRank)[0];
    if (best && chosen.size < cap) chosen.add(best.photo_index);
  }
  for (const p of candidates) {
    if (chosen.size >= cap) break;
    chosen.add(p.photo_index);
  }
  if (chosen.size === 0) return range(1, cap);
  return [...chosen].sort((a, b) => a - b);
}

/* -------------------------------------------------------------------------- */
/*  Frases                                                                      */
/* -------------------------------------------------------------------------- */

/** "Image 1" | "Images 1 and 2" | "Images 1–4" | "Images 1, 3 and 4" */
export function imagesPhrase(nums: number[]): string {
  const xs = [...new Set(nums)].sort((a, b) => a - b);
  if (xs.length === 0) return "";
  if (xs.length === 1) return `Image ${xs[0]}`;
  const consecutive = xs.every((n, k) => k === 0 || n === xs[k - 1] + 1);
  if (consecutive && xs.length >= 3) return `Images ${xs[0]}–${xs[xs.length - 1]}`;
  return `Images ${joinList(xs.map(String))}`;
}

/** "a" | "a and b" | "a; b and c" — para COLOR_LOCK. */
function joinSemi(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join("; ")} and ${items[items.length - 1]}`;
}

function endSentence(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return /[.!?]["')\]]*$/.test(t) ? t : `${t}.`;
}

function colorPhrase(item: BriefItem, nameOverride?: string, hexInLabel = false): string {
  const [c1, c2] = item.colors;
  const hex = (h: string | null) => (h ? ` (approx. ${h})` : "");
  const second = c2 ? ` with ${c2.name}${hex(c2.hex)}${c2.where ? ` ${c2.where}` : ""}` : "";
  const label = hexInLabel && c1.hex ? `${item.label} (${c1.hex})` : item.label;
  return `the ${label} stays ${nameOverride ?? c1.name}${hex(c1.hex)}${second}`;
}

/**
 * F12 (v2.1): dos ítems con el MISMO nombre de color principal ("light-blue" y
 * "light-blue", hex distintos) hacían que el modelo mezclara los colores. Acá
 * cada uno recibe un nombre derivado de su hex ("light aqua" / "medium sky
 * blue"); si la derivación no los separa, la etiqueta lleva el hex.
 */
function colorLockPhrases(items: BriefItem[]): string[] {
  const groups = new Map<string, BriefItem[]>();
  for (const it of items) {
    const k = normColorName(it.colors[0]?.name ?? "");
    groups.set(k, [...(groups.get(k) ?? []), it]);
  }
  const override = new Map<ItemId, string>();
  const hexLabel = new Set<ItemId>();
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const derived = g.map((it) => deriveColorName(it.colors[0].hex));
    const distinct = derived.every((d) => !!d) && new Set(derived).size === g.length;
    g.forEach((it, k) => (distinct ? override.set(it.item_id, derived[k] as string) : hexLabel.add(it.item_id)));
  }
  return items.map((it) => colorPhrase(it, override.get(it.item_id), hexLabel.has(it.item_id)));
}

/**
 * F13 (v2.1): la nota escribe "small zipper pulls exactly as in Photo 1" (índice
 * de la NOTA). En el prompt de imagen las fotos van renumeradas según la
 * selección ("Image M"); una foto que no viaja pasa a "the product photos".
 */
function mapPhotoRefs(text: string, selected: number[]): string {
  return text.replace(/\bPhotos? (\d+(?:(?:, | and )\d+)*)/g, (_m, list: string) => {
    const nums = list
      .split(/, | and /)
      .map((n) => selected.indexOf(Number(n)) + 1)
      .filter((n) => n > 0);
    return nums.length ? imagesPhrase(nums) : "the product photos";
  });
}

/** F5 (v2.1): la colchoneta de espuma salió doblada y colgada como un paño. */
const RIGIDITY_SENTENCE: Record<Rigidity, string> = {
  rigid: "It is rigid and keeps its exact shape and real size.",
  semi_rigid: "It is semi-rigid and holds its own shape and real size.",
  soft_drapable: "",
};

/**
 * G2 (v2.2): roles de una referencia SIN nota. No sabemos qué muestra, así que
 * producto y persona van como "any …", y todo lo escribe el código (lugar,
 * superficies, composición, ángulo, pose y uso; el producto es un stand-in que
 * se reemplaza por los ítems del vendedor; la persona es otra y anónima).
 */
function genericReferenceRoles(K: number, caseKind: CaseKind, locked: boolean, labels: string[]): string[] {
  const img = `Image ${K}`;
  const several = labels.length > 1;
  const own = `in ${several ? "their" : "its"} own colors, materials and count`;
  const out: string[] = [];
  if (locked) {
    // El lock (cenital, flotando, macro) manda en el ángulo: de la referencia
    // solo el lugar, las superficies y los props; el lugar del producto de stock
    // ya no existe en la foto nueva, así que manda SCENE.
    out.push(`${img} is a scene reference: use it only for the place, the surfaces and the props; not for its camera angle, light or colors.`);
    out.push(
      `Any product shown in ${img} is a stand-in for the seller's product: ${joinList(labels)} ${several ? "replace" : "replaces"} it, arranged as described in SCENE, ${own}.`,
    );
  } else {
    out.push(
      caseKind === "ref_and_style"
        ? `${img} is a scene reference: use it only for the place, the surfaces, the composition and camera angle, the pose of any person and how the product is used; not for its light or colors.`
        : `${img} is a scene reference: use it for the place, the surfaces, the composition and camera angle, the light and the color mood, the pose of any person and how the product is used.`,
    );
    out.push(
      `Any product shown in ${img} is a stand-in for the seller's product: put ${joinList(labels)} in its place, arranged as described in SCENE, ${own}. From the stand-in take only its position and how it is used.`,
    );
    out.push(`Any person in ${img} becomes a different, anonymous model, with another face, hairstyle and build.`);
  }
  out.push(`Ignore any watermark, logo or text in ${img}.`);
  return out;
}

/** La persona del plan como frase ("a woman in her forties…"), o "" si no hay. */
function personPhrase(plan: Plan): string {
  if (!plan.has_person) return "";
  return stripTrailingPeriod(plan.person_description ?? "").replace(/^(An?)(?=\s)/, (m) => m.toLowerCase());
}

/* -------------------------------------------------------------------------- */
/*  assembleBatch                                                               */
/* -------------------------------------------------------------------------- */

export function assembleBatch(input: AssembleInput): AssembledBatch {
  const { plan, productBrief: brief } = input;
  const variations = Math.max(1, input.variations);

  // ---- Ítems en cuadro ------------------------------------------------------
  const itemsById = new Map<ItemId, BriefItem>((brief?.items ?? []).map((i) => [i.item_id, i]));
  let inFrame = plan.items_in_frame
    .filter((f) => itemsById.has(f.item_id))
    .map((f) => ({ item: itemsById.get(f.item_id)!, units: f.units }));
  if (brief && inFrame.length === 0) inFrame = brief.items.map((item) => ({ item, units: 1 }));
  const totalUnits = brief ? inFrame.reduce((a, f) => a + f.units, 0) : 1;
  const hasPrintedText = inFrame.some((f) => f.item.printed_text.length > 0);

  // ---- Imágenes -------------------------------------------------------------
  const selected = selectProductPhotos(brief, inFrame.map((f) => f.item.item_id), input.availablePhotoCount);
  const P = selected.length;
  // G3: sin nota y con varias fotos no sabemos cuántos ítems hay (el bloque
  // PRODUCT lo resuelve por ordinal). KEEP OUT y MARGIN no pueden afirmar "un
  // producto": "The only product … is the seller's product" empujaba a fundirlos.
  const unknownItemCount = !brief && P > 1;
  const pip = imagesPhrase(range(1, P)); // productImagesPhrase
  const photoById = new Map((brief?.photos ?? []).map((p) => [p.photo_index, p]));
  const itemImagesPhrase = (id: ItemId) =>
    imagesPhrase(
      selected
        .map((photoIndex, k) => ({ photoIndex, n: k + 1 }))
        .filter((x) => photoById.get(x.photoIndex)?.item_ids.includes(id))
        .map((x) => x.n),
    ) || pip;

  const hasRefCase = input.caseKind === "ref_and_style" || input.caseKind === "ref_only";
  const R = input.refs.length;
  const primaryN = hasRefCase && R > 0 ? Math.min(Math.max(plan.primary_reference, 1), R) : 0;
  const ref = primaryN ? input.refs[primaryN - 1] : null;
  // G2 (v2.2): referencia sin nota → viaja igual como Image P+1 (refN 1).
  const genericRef = hasRefCase && R === 0 && !!input.genericRef;
  const K = ref || genericRef ? P + 1 : null;
  const secondaryN =
    ref && plan.secondary_reference > 0 && plan.secondary_reference !== primaryN && plan.secondary_reference <= R && plan.secondary_use.trim()
      ? plan.secondary_reference
      : 0;
  const K2 = secondaryN ? P + 2 : null;

  const slots: ImageSlot[] = selected.map((photoIndex, k) => ({
    role: "product" as const,
    photoIndex,
    label: `Image ${k + 1}: product photo.`,
  }));
  if (ref && K) slots.push({ role: "reference", refN: primaryN, label: `Image ${K}: scene reference.` });
  else if (genericRef && K) slots.push({ role: "reference", refN: 1, label: `Image ${K}: scene reference.` });
  if (secondaryN && K2) slots.push({ role: "supporting_reference", refN: secondaryN, label: `Image ${K2}: supporting reference.` });

  const inFrameLabels = brief ? inFrame.map((f) => `the ${f.item.label}`) : ["the product"];

  // Desvío propio de la spec §2.6: "in place of the product shown there" / "put …
  // in their place" asumen que el lugar del producto de la referencia existe en
  // la foto nueva. Con un lock (cenital, flotando, macro) o con la persona fuera
  // del plan, ese lugar (el cuerpo de la mujer, el turbante) ya no está: eran dos
  // órdenes opuestas y el modelo podía agregar una persona para "ocupar su
  // lugar". Ahí manda SCENE.
  const standInDisplaced = !!ref && (!!input.effectiveLock || (ref.person.present && !plan.has_person));

  // ---- TASK_LINE --------------------------------------------------------------
  let purpose = stripTrailingPeriod(plan.purpose);
  if (!/^(for|to)\b/i.test(purpose)) purpose = `for ${purpose}`;
  const taskLine =
    (ref || genericRef) && K
      ? `Create one new photorealistic commercial photograph ${purpose}: take the product from ${pip} and place it in the scene of Image ${K}${ref && ref.featured_product.present && !standInDisplaced ? ", in place of the product shown there" : ""}.`
      : `Create one new photorealistic commercial photograph of the product in ${pip}, ${purpose}.`;

  // ---- ROLES ------------------------------------------------------------------
  const roles: string[] = [];
  const s = P === 1 ? "s" : "";
  if (!brief) {
    // G3 (v2.2): con varias fotos y sin nota, "how it looks" (singular) empujaba
    // a fundir ítems distintos en uno; el bloque PRODUCT los separa por ordinal.
    roles.push(
      P === 1
        ? `${pip} shows the product being sold; it is the only source for how it looks.`
        : `${pip} show the product being sold; they are the only source for how each item looks.`,
    );
  } else if (brief.photo_set_kind === "set" && inFrame.length > 1) {
    roles.push(
      `${pip} show${s} the product being sold (${brief.category}): ${NUMBER_WORDS[inFrame.length] ?? String(inFrame.length)} different items sold together; ${P === 1 ? "it is" : "they are"} the only source for how they look.`,
    );
  } else if (P === 1) {
    roles.push(`Image 1 shows the product being sold (${brief.category}); it is the only source for how the product looks.`);
  } else {
    roles.push(`${pip} show the product being sold (${brief.category}), one product seen from different angles; they are the only source for how it looks.`);
  }

  if (ref && K) {
    const personClause = plan.has_person && ref.person.present ? ", the person's pose and how the product is used" : "";
    if (input.caseKind === "ref_and_style" && !input.effectiveLock) {
      roles.push(`Image ${K} is a scene reference: use it only for the setting, the composition and camera angle${personClause}; not for its light or colors.`);
    } else if (input.caseKind === "ref_and_style") {
      roles.push(`Image ${K} is a scene reference: use it only for the place, the surfaces and the props${plan.has_person ? ", and the person" : ""}; not for its camera angle, light or colors.`);
    } else {
      roles.push(`Image ${K} is a scene reference: use it for the setting, the composition and camera angle, the light and the color mood${personClause}.`);
    }
    const fp = ref.featured_product;
    if (fp.present) {
      const many = fp.units > 1;
      const several = inFrameLabels.length > 1;
      const noun = [fp.color_name, many ? fp.category_plural : fp.category].filter(Boolean).join(" ");
      // F1 (v2.1): "stand-in … in their own colors" no alcanzó: la toalla del
      // vendedor salió con el rizo y la guarda tejida de la toalla de stock. De la
      // referencia se toma SOLO la posición y el uso; lo físico es del vendedor.
      // "arranged as described in SCENE" (revisión v2.1): con F3 (una unidad) y F4
      // (el ítem dudoso a un costado) los lugares de los stand-ins ya no son uno a
      // uno con los ítems; sin esto, "take only their position" mandaba el textil
      // al lugar del turbante mientras SCENE lo ponía en el estante.
      const keepOwn = `the seller's ${several ? "items keep their" : "item keeps its"} own material, surface, edges, size and count.`;
      roles.push(
        standInDisplaced
          ? `The ${noun} in Image ${K} ${many ? "are stand-ins" : "is a stand-in"} for the seller's product: ${joinList(inFrameLabels)} ${several ? "replace" : "replaces"} ${many ? "them" : "it"}, arranged as described in SCENE, in ${several ? "their" : "its"} own colors. ${capitalizeFirst(keepOwn)}`
          : `The ${noun} in Image ${K} ${many ? "are stand-ins" : "is a stand-in"} for the seller's product: put ${joinList(inFrameLabels)} in ${many ? "their" : "its"} place, arranged as described in SCENE, in ${several ? "their" : "its"} own colors. From ${many ? "the stand-ins take only their position and how they are" : "the stand-in take only its position and how it is"} used; ${keepOwn}`,
      );
    }
    if (plan.has_person && ref.person.present) {
      // F2 (v2.1): "a new, anonymous model" no alcanzó (salió la misma modelo de
      // stock). El plan trae una persona con otro peinado y otros rasgos.
      const pd = personPhrase(plan);
      roles.push(
        pd
          ? `The person is a different, anonymous model: ${pd}; not the person in Image ${K}.`
          : `The person is a new, anonymous model, not the person in Image ${K}.`,
      );
    }
    if (ref.do_not_copy.length > 0) roles.push(`Ignore any watermark, logo or text in Image ${K}.`);
    if (secondaryN && K2) {
      roles.push(`Image ${K2} is a supporting reference, used only for ${stripTrailingPeriod(plan.secondary_use)}.`);
    }
  } else if (genericRef && K) {
    roles.push(...genericReferenceRoles(K, input.caseKind, !!input.effectiveLock, inFrameLabels));
  }

  // ---- PRODUCT ----------------------------------------------------------------
  let productBlock: string;
  if (brief) {
    const lines = inFrame.map((f) => {
      const it = f.item;
      const imgs = itemImagesPhrase(it.item_id);
      const parts = [`The ${it.label} (${imgs}): ${mapPhotoRefs(it.identity_sentence, selected)}.`];
      const rigidity = it.rigidity ? RIGIDITY_SENTENCE[it.rigidity] : "";
      if (rigidity) parts.push(rigidity);
      // F9: sin el tratamiento, "Verenza" derivó a serif itálica.
      if (it.printed_text.length > 0) {
        const texts = it.printed_text.map((p) => `"${p.text}"${p.style ? ` (${p.style})` : ""}`);
        parts.push(`It carries the printed text ${joinList(texts)}, same size and position as in ${imgs}.`);
      }
      // F8: la nota decía "omit the small clip" y el clip apareció igual.
      if (it.omit_from_product.length > 0) {
        const several = it.omit_from_product.length > 1;
        parts.push(
          `Show the ${it.label} without ${joinList(it.omit_from_product.map((o) => mapPhotoRefs(o, selected)))}; ${several ? "they were only photo props" : "it was only a photo prop"}.`,
        );
      }
      return parts.join(" ");
    });
    lines.push(
      `Keep ${inFrame.length > 1 ? "each item's" : "its"} color, material, texture, shape${hasPrintedText ? ", printed text" : ""} and details identical to ${pip}.`,
    );
    productBlock = lines.join("\n");
  } else if (P === 1) {
    productBlock =
      "Image 1 shows the product being sold. Reproduce it exactly as photographed: same shape, proportions, colors, material and texture. Any printed text or logo on the product is copied letter by letter from Image 1.";
  } else {
    // G3 (v2.2): "the product in Images 1 and 2 … Reproduce it exactly" (en
    // singular) fue la receta del híbrido colchoneta+toalla de v1. Sin nota no
    // sabemos si las fotos son UN ítem desde varios ángulos o VARIOS ítems:
    // cada foto se nombra por su ordinal y la regla de conteo cubre los dos casos.
    productBlock = [
      `${range(1, P)
        .map((n) => `Image ${n} shows a product item`)
        .join("; ")}.`,
      "If they show different items, each item appears exactly once, separately, exactly as photographed; if they show the same item from different angles, that item appears once.",
      "Every item keeps the shape, proportions, colors, material and texture of its photos.",
      "Any printed text or logo on the product is copied letter by letter from the photos.",
    ].join(" ");
  }

  // ---- SCENE ------------------------------------------------------------------
  // F2: la escena arranca presentando a la modelo (el plan la llama "the model").
  const pd = personPhrase(plan);
  const personSentence = pd ? (/^an?\s/i.test(pd) ? `The model is ${pd}.` : endSentence(capitalizeFirst(pd))) : "";
  const sceneBlock = squeeze(
    [personSentence, endSentence(plan.scene_paragraph), endSentence(plan.product_placement)].filter(Boolean).join(" "),
  );

  // ---- LIGHT AND FINISH -------------------------------------------------------
  const lightText =
    plan.light_owner === "user_instructions"
      ? plan.light_and_finish
      : input.styleParts
        ? input.styleParts.look
        : plan.light_and_finish;
  const colorLock = brief
    ? `Light and grading never change the product's colors: ${joinSemi(colorLockPhrases(inFrame.map((f) => f.item)))}.`
    : `Light and grading never change the product's colors, which stay exactly as in ${pip}.`;
  const lightBlock = squeeze([endSentence(lightText), endSentence(plan.light_placement), colorLock].filter(Boolean).join(" "));

  // ---- CAMERA AND FORMAT ------------------------------------------------------
  const cameraBlock = squeeze(
    [input.effectiveLock ? endSentence(input.effectiveLock) : "", endSentence(plan.camera), RATIO_SENTENCE[input.ratio]]
      .filter(Boolean)
      .join(" "),
  );

  // ---- KEEP OUT ---------------------------------------------------------------
  // Sin nota no sabemos si el producto tiene texto impreso: se exceptúa igual,
  // porque "no text anywhere" haría que el modelo le borre la etiqueta.
  const textException = brief
    ? hasPrintedText
      ? ", other than the product's own printed text described above"
      : ""
    : ", other than any text printed on the product itself";
  const allowed = plan.allowed_objects.map((o) => stripTrailingPeriod(o)).filter(Boolean);
  const tail = allowed.length ? `the scene holds only ${joinList(allowed)}.` : "nothing else is in the frame.";
  let objectsLine: string;
  if (input.planSource === "fallback") {
    // G2: con referencia sin nota, SCENE remite al lugar y los props de la
    // imagen; "beyond those described" haría que el modelo los vacíe.
    const besides =
      genericRef && K ? `besides the setting of Image ${K}, add no other objects.` : "add no other objects beyond those described.";
    objectsLine = brief
      ? `The only products in the frame are the seller's items described above; ${besides}`
      : unknownItemCount
        ? `The only product items in the frame are the ones described above; ${besides}`
        : `The only product in the frame is the seller's product described above; ${besides}`;
  } else if (totalUnits === 1 && inFrame[0]) {
    objectsLine = `The only product in the frame is the ${inFrame[0].item.label}; besides it, ${tail}`;
  } else {
    objectsLine = `The only products in the frame are the seller's items described above; besides them, ${tail}`;
  }
  // F3 (v2.1): conteo exacto en positivo. El modelo duplicaba ítems (una segunda
  // toalla en el estante, la colchoneta enrollada y además plana). Bajo lock
  // macro no va: "the image contains exactly one X and exactly one Y" obliga a
  // meter los dos ítems en un primerísimo plano que muestra un solo detalle.
  const countLine =
    brief && inFrame.length > 0 && input.lockKind !== "macro"
      ? `The image contains ${joinList(
          inFrame.map((f) =>
            f.units === 1
              ? `exactly one ${f.item.label}`
              : `exactly ${NUMBER_WORDS[f.units] ?? String(f.units)} ${pluralizeLabel(f.item.label)}`,
          ),
        )}. `
      : "";
  const keepOut = `Every surface is clean and unmarked: no text, letters, logos, watermarks or brand marks anywhere in the image${textException}. ${countLine}${objectsLine}`;

  // ---- Prompts por imagen -----------------------------------------------------
  const macro = input.lockKind === "macro";
  const prompts: string[] = [];
  const shotIndexes: number[] = [];
  for (let i = 0; i < variations; i++) {
    const idx = i % SHOT_COUNT;
    const shot = plan.shot_variations[idx] ?? plan.shot_variations[0];
    const instruction = idx === 0 ? "use the base framing described above." : endSentence(capitalizeFirst(shot.instruction));
    const margin =
      shot.full_product_in_frame && !macro
        ? ` Keep ${totalUnits === 1 && !unknownItemCount ? "the whole product" : "every product item"} fully inside the frame with a clear margin.`
        : "";
    // F6a (v2.1): un recorte de detalle en un set no saca a los otros ítems (el
    // plan de A pedía "the mat cropped out" y el modelo lo reubicó en un estante).
    const partial =
      !shot.full_product_in_frame && !macro && inFrame.length > 1 ? " Every product item stays at least partly in view." : "";
    prompts.push(
      [
        taskLine,
        "",
        "IMAGE ROLES",
        roles.join(" "),
        "",
        "PRODUCT (reproduce exactly as photographed)",
        productBlock,
        "",
        "SCENE",
        sceneBlock,
        "",
        "LIGHT AND FINISH",
        lightBlock,
        "",
        "CAMERA AND FORMAT",
        cameraBlock,
        "",
        "SHOT",
        `For this image: ${instruction}${margin}${partial}`,
        "",
        "KEEP OUT",
        keepOut,
      ].join("\n"),
    );
    shotIndexes.push(idx);
  }

  return { slots, selectedPhotos: selected, prompts, shotIndexes };
}

/* -------------------------------------------------------------------------- */
/*  Parts de la llamada i                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Parts de la llamada `i`: idénticos en las N salvo el último texto. Las
 * etiquetas "Image N: …" intercaladas NO están documentadas por Google; por eso
 * los roles se repiten por ordinal dentro del prompt (forma documentada). La
 * variante B del A/B pasa `labels: false` y manda las mismas imágenes sin ellas.
 *
 * `productPhotos[k]` = foto con photo_index k+1; `refs[n-1]` = referencia usable n.
 */
export function buildImageParts(
  batch: AssembledBatch,
  i: number,
  images: { productPhotos: InlineImage[]; refs: InlineImage[] },
  opts: { labels?: boolean } = {},
): GeminiPart[] {
  const labels = opts.labels ?? true;
  const parts: GeminiPart[] = [];
  for (const slot of batch.slots) {
    const img = slot.role === "product" ? images.productPhotos[slot.photoIndex - 1] : images.refs[slot.refN - 1];
    if (!img) {
      // Si falta una imagen, la numeración "Image N" del prompt quedaría
      // corrida y el modelo tomaría la referencia como producto. Mejor fallar.
      throw new Error(`Falta la imagen del slot "${slot.label}"`);
    }
    if (labels) parts.push({ text: slot.label });
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
  }
  parts.push({ text: batch.prompts[i] });
  return parts;
}
