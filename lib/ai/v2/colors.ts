/**
 * COLORES del pipeline v2.1 — PURO, sin red.
 *
 *   - F7: familias de color. Un prop de la misma familia que el producto (las
 *     velas teal junto al set celeste del A/B) se lee como parte de lo que se
 *     vende. El validador lo pasa a un neutro.
 *   - F12: nombres derivados del hex. Dos ítems "light-blue" con hex distintos
 *     hacían que el modelo de imagen mezclara los colores (la colchoneta aqua
 *     salió azul como la toalla). El COLOR_LOCK les da nombres distintos.
 *
 * Solo las familias CROMÁTICAS cuentan para F7: un producto blanco en un baño
 * blanco es lo normal, y repintar paredes y azulejos cambiaría la escena de la
 * referencia sin ganar nada (desvío documentado).
 */

import type { BriefItem } from "@/lib/ai/v2/product-brief";
import { escapeRegExp } from "@/lib/ai/v2/sanitize";

export type ColorFamily = "red" | "pink" | "orange" | "yellow" | "green" | "blue" | "purple" | "brown";

/**
 * Palabras de color → familias. Sin palabras que también son objetos de escena
 * ("sky", "forest", "wine", "coffee", "lemon", "olive", "rose", "sage", "mint"):
 * "the blue sky" o "a sprig of sage" no son un prop del color del producto.
 */
const FAMILY_WORDS: Record<string, ColorFamily[]> = {
  red: ["red"], crimson: ["red"], scarlet: ["red"], burgundy: ["red"], maroon: ["red"], ruby: ["red"], vermilion: ["red"], oxblood: ["red"],
  pink: ["pink"], blush: ["pink"], fuchsia: ["pink", "purple"], magenta: ["pink", "purple"], coral: ["pink", "orange"],
  orange: ["orange"], rust: ["orange", "brown"], terracotta: ["orange", "brown"], tangerine: ["orange"], amber: ["orange", "yellow"],
  yellow: ["yellow"], mustard: ["yellow"], gold: ["yellow"], golden: ["yellow"], ochre: ["yellow", "brown"],
  green: ["green"], emerald: ["green"], jade: ["green"], teal: ["green", "blue"], seafoam: ["green", "blue"],
  blue: ["blue"], navy: ["blue"], cobalt: ["blue"], azure: ["blue"], turquoise: ["blue", "green"], aqua: ["blue", "green"],
  cyan: ["blue"], indigo: ["blue", "purple"], sapphire: ["blue"], cerulean: ["blue"], periwinkle: ["blue", "purple"], cornflower: ["blue"],
  purple: ["purple"], violet: ["purple"], lilac: ["purple"], lavender: ["purple"], mauve: ["purple", "pink"],
  brown: ["brown"], tan: ["brown"], camel: ["brown"], cognac: ["brown"], bronze: ["brown"], umber: ["brown"], sienna: ["brown"], mocha: ["brown"],
};

const NEUTRAL_WORDS = new Set([
  "white", "ivory", "cream", "beige", "sand", "taupe", "ecru", "gray", "grey", "charcoal", "silver", "slate", "black", "ebony", "nude", "natural", "clear", "transparent",
]);

/** Modificadores que forman parte del nombre del color ("light blue", "pale-aqua"). */
const COLOR_MODIFIERS = new Set([
  "light", "dark", "pale", "deep", "bright", "soft", "dusty", "muted", "pastel", "vivid", "medium", "baby", "powder", "royal", "electric", "neon", "rich", "faded", "warm", "cool",
]);

/** Sustantivos que un color del producto nunca toca: el cuerpo de la modelo y la naturaleza. */
const KEEP_NOUNS = new Set([
  "hair", "eyes", "eyebrows", "skin", "complexion", "beard", "lips", "cheeks", "nails",
  "sky", "sea", "ocean", "water", "waves", "lake", "river", "pool", "grass", "lawn", "foliage", "leaves", "trees", "plants",
  "garden", "forest", "meadow", "field", "hills", "mountains", "sunset", "sunrise", "horizon",
]);

const parts = (token: string) => token.toLowerCase().replace(/[^a-z-]/g, "").split("-").filter(Boolean);
const bare = (w: string) => w.toLowerCase().replace(/[^a-z-]/g, "");

function tokenFamilies(token: string): ColorFamily[] {
  return parts(token).flatMap((p) => FAMILY_WORDS[p] ?? []);
}

function isColorToken(token: string): boolean {
  return parts(token).some((p) => p in FAMILY_WORDS || NEUTRAL_WORDS.has(p));
}

export function familiesOfColorName(name: string): Set<ColorFamily> {
  return new Set(name.split(/\s+/).flatMap(tokenFamilies));
}

/* -------------------------------------------------------------------------- */
/*  Hex                                                                         */
/* -------------------------------------------------------------------------- */

export function hexToHsl(hex: string | null | undefined): { h: number; s: number; l: number } | null {
  if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return null;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s, l };
}

export function familiesOfHex(hex: string | null | undefined): Set<ColorFamily> {
  const c = hexToHsl(hex);
  const out = new Set<ColorFamily>();
  if (!c || c.s < 0.15 || c.l > 0.93 || c.l < 0.08) return out;
  const { h, l } = c;
  const add = (...fs: ColorFamily[]) => fs.forEach((f) => out.add(f));
  if (h < 12 || h >= 345) add(l > 0.7 ? "pink" : "red");
  else if (h < 40) add(...(l < 0.45 ? (["brown", "orange"] as const) : (["orange"] as const)));
  else if (h < 65) add(l < 0.35 ? "brown" : "yellow");
  else if (h < 150) add("green");
  else if (h < 190) add("green", "blue");
  else if (h < 250) add("blue");
  else if (h < 290) add("purple");
  else add("pink", "purple");
  return out;
}

/**
 * Nombre de color derivado del hex ("light aqua", "medium sky blue"). Lo usa el
 * COLOR_LOCK cuando dos ítems comparten el mismo nombre (F12). Determinístico.
 */
export function deriveColorName(hex: string | null | undefined): string | null {
  const c = hexToHsl(hex);
  if (!c) return null;
  const { h, s, l } = c;
  if (s < 0.12) return l > 0.9 ? "white" : l > 0.7 ? "light gray" : l > 0.4 ? "gray" : l > 0.15 ? "charcoal" : "black";
  let hue: string;
  if (h < 12 || h >= 345) hue = l > 0.72 ? "pink" : "red";
  else if (h < 40) hue = l < 0.45 ? "brown" : "orange";
  else if (h < 65) hue = l < 0.35 ? "brown" : "yellow";
  else if (h < 90) hue = "yellow-green";
  else if (h < 150) hue = "green";
  else if (h < 175) hue = "teal";
  else if (h < 195) hue = "aqua";
  else if (h < 215) hue = "sky blue";
  else if (h < 245) hue = "blue";
  else if (h < 275) hue = "violet";
  else if (h < 310) hue = "purple";
  else hue = l > 0.72 ? "pink" : "magenta";
  const lightness = l >= 0.8 ? "pale" : l >= 0.65 ? "light" : l >= 0.45 ? "medium" : l >= 0.3 ? "deep" : "dark";
  return `${lightness} ${hue}`;
}

/** "Light-Blue" y "light blue" son el mismo nombre. */
export function normColorName(name: string): string {
  return name.toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

/* -------------------------------------------------------------------------- */
/*  F7 — props en la familia del producto                                       */
/* -------------------------------------------------------------------------- */

/** Familias CROMÁTICAS de todos los colores de los ítems (por nombre y por hex). */
export function productColorFamilies(items: BriefItem[]): Set<ColorFamily> {
  const out = new Set<ColorFamily>();
  for (const it of items) {
    for (const c of it.colors) {
      familiesOfColorName(c.name).forEach((f) => out.add(f));
      familiesOfHex(c.hex).forEach((f) => out.add(f));
    }
  }
  return out;
}

/** El neutro que reemplaza: blanco, salvo que el producto sea blanco (entonces gris claro). */
export function neutralColorFor(items: BriefItem[]): string {
  const names = items.flatMap((i) => i.colors.map((c) => normColorName(c.name)));
  if (!names.some((n) => /\b(white|ivory|cream|off white)\b/.test(n))) return "white";
  if (!names.some((n) => /\b(gray|grey|silver|charcoal)\b/.test(n))) return "light gray";
  return "black";
}

export type NeutralizeResult = {
  text: string;
  changed: boolean;
  span: string;
  head: string;
  /** Las palabras de color que se neutralizaron ("terracotta", "blue"): se llevan al resto del plan. */
  colorWords: string[];
};

/**
 * Pasa a un neutro el color de un prop si es de la familia del producto:
 * "the blue candles" → "the white candles". Solo toca una palabra de color en
 * posición de ADJETIVO (no la última palabra): "a sprig of lavender" queda igual.
 * El cuerpo y la naturaleza no se repintan ("the turquoise sea" queda igual).
 */
export function neutralizeColorPhrase(phrase: string, families: Set<ColorFamily>, neutral: string): NeutralizeResult {
  const tokens = phrase.split(/\s+/);
  const head = tokens[tokens.length - 1] ?? "";
  const none: NeutralizeResult = { text: phrase, changed: false, span: "", head, colorWords: [] };
  if (KEEP_NOUNS.has(bare(head))) return none;
  for (let i = 0; i < tokens.length - 1; i++) {
    if (!tokenFamilies(tokens[i]).some((f) => families.has(f))) continue;
    let start = i;
    while (start > 0 && COLOR_MODIFIERS.has(tokens[start - 1].toLowerCase())) start--;
    let end = i;
    while (end + 1 < tokens.length - 1 && isColorToken(tokens[end + 1])) end++;
    const span = tokens.slice(start, end + 1).join(" ");
    const text = [...tokens.slice(0, start), neutral, ...tokens.slice(end + 1)].join(" ");
    const colorWords = tokens
      .slice(start, end + 1)
      .flatMap(parts)
      .filter((p) => (FAMILY_WORDS[p] ?? []).some((f) => families.has(f)));
    return { text, changed: true, span, head, colorWords };
  }
  return none;
}

/**
 * Palabras que, si siguen a un color en el texto, lo protegen: las palabras de
 * las etiquetas del producto (salvo las de color), el cuerpo, la naturaleza y
 * "product"/"item". Así "the folded blue towel" (el producto nombrado a medias)
 * o "short brown hair" nunca se repintan.
 */
export function productProtectedNouns(labels: string[]): Set<string> {
  const out = new Set<string>([...KEEP_NOUNS, "product", "products", "item", "items"]);
  for (const label of labels) {
    for (const w of label.toLowerCase().split(/[\s-]+/)) {
      if (w && !(w in FAMILY_WORDS) && !NEUTRAL_WORDS.has(w) && !COLOR_MODIFIERS.has(w)) out.add(w);
    }
  }
  return out;
}

// Máscara ASCII de las etiquetas mientras se reescribe el texto. Sin espacios
// (cada etiqueta queda como UNA palabra) y sin caracteres especiales.
const MASK = (k: number) => `@@L${k}@@`;
const MASK_RE = /@@L(\d+)@@/g;

/**
 * Lleva a un texto del plan el mismo neutro que recibió un prop: cada palabra de
 * `colorWords` en posición de ADJETIVO (le sigue otra palabra en la misma
 * cláusula) pasa al neutro, con sus modificadores ("soft terracotta backdrop" →
 * "white backdrop"; en una toma, "the terracotta wall" → "the white wall"). No
 * exige el mismo sustantivo: en vivo el prop era "backdrop" y la toma decía
 * "wall". Las etiquetas se enmascaran y nada que preceda (a 1-3 palabras) a un
 * sustantivo protegido se toca. Un texto sin cambios vuelve igual, byte a byte.
 */
export function neutralizeColorWordsInText(
  text: string,
  colorWords: Set<string>,
  neutral: string,
  labels: string[],
  protect: Set<string>,
): string {
  if (!text || colorWords.size === 0) return text;
  const masks: string[] = [];
  let masked = text;
  for (const label of [...labels].filter(Boolean).sort((a, b) => b.length - a.length)) {
    masked = masked.replace(new RegExp(escapeRegExp(label), "gi"), (m) => {
      masks.push(m);
      return MASK(masks.length - 1);
    });
  }
  const items = (masked.match(/\S+\s*/g) ?? []).map((p) => {
    const m = /^(\S+)(\s*)$/.exec(p);
    return { w: m?.[1] ?? p, sep: m?.[2] ?? "" };
  });
  const endsClause = (w: string) => /[.,;:!?)"]$/.test(w);
  const isMask = (w: string) => /@@L\d+@@/.test(w);
  let changed = false;
  for (let i = 0; i < items.length; i++) {
    const tok = items[i].w;
    if (isMask(tok) || !parts(tok).some((p) => colorWords.has(p))) continue;
    if (endsClause(tok) || i + 1 >= items.length) continue;
    let blocked = false;
    for (const n of items.slice(i + 1, i + 4).map((x) => x.w)) {
      if (isMask(n) || protect.has(bare(n))) {
        blocked = true;
        break;
      }
      if (endsClause(n)) break;
    }
    if (blocked) continue;
    let start = i;
    while (start > 0 && COLOR_MODIFIERS.has(bare(items[start - 1].w)) && !endsClause(items[start - 1].w)) start--;
    const first = items[start].w;
    const leading = /^[^A-Za-z]*/.exec(first)?.[0] ?? "";
    const word = /^[^A-Za-z]*[A-Z]/.test(first) ? neutral[0].toUpperCase() + neutral.slice(1) : neutral;
    // Un hex entre paréntesis detrás del color ("teal (approx. #1E8C8A)") es de
    // ese color y se va con él; si no, quedaba "white (approx. #1E8C8A)".
    let end = i;
    if (/^\((?:approx\.?|#[0-9A-Fa-f]{6})/i.test(items[i + 1]?.w ?? "")) {
      let j = i + 1;
      while (j < items.length - 1 && !items[j].w.includes(")")) j++;
      if (/#[0-9A-Fa-f]{6}\)/.test(items.slice(i + 1, j + 1).map((x) => x.w).join(" "))) end = j;
    }
    const tail = end > i ? (/\)([^A-Za-z]*)$/.exec(items[end].w)?.[1] ?? "") : "";
    items.splice(start, end - start + 1, { w: leading + word + tail, sep: items[end].sep });
    i = start;
    changed = true;
  }
  if (!changed) return text;
  return items
    .map((x) => x.w + x.sep)
    .join("")
    .replace(MASK_RE, (_m, k: string) => masks[Number(k)]);
}
