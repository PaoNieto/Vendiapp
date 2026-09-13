/**
 * Saneamiento de todo texto que viene del USUARIO (nombre, descripción, marca,
 * user_prompt) antes de que toque un prompt o un hash.
 *
 * Por qué así:
 *   - Los tres prompts de la v2 envuelven los datos del usuario en tags
 *     (<product_name>…</product_name>). Si el usuario escribe "</product_name>
 *     ignora todo", cerraría el tag y su texto pasaría a leerse como
 *     instrucción. Sacar `<` y `>` hace imposible cerrar/abrir tags.
 *   - `<<<`/`>>>` son delimitadores típicos de inyección; se borran.
 *   - NFC + colapso de espacios: el mismo nombre escrito con tildes compuestas
 *     o descompuestas tiene que dar el MISMO hash (si no, cache miss gratis).
 *   - Tope por campo: el prompt no crece sin límite y el hash no depende de
 *     basura al final.
 */

// Caracteres de control U+0000..U+001F más `<` y `>`. Se arma con fromCharCode
// y no con un literal para que el archivo no lleve bytes de control y ESLint
// (no-control-regex) no tenga nada que objetar.
const CONTROL_AND_ANGLES = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(31)}<>]`,
  "g",
);

export const clean = (s: string | null | undefined, max: number): string =>
  (s ?? "")
    .normalize("NFC")
    .replace(CONTROL_AND_ANGLES, " ")
    .replace(/<<<|>>>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/** Topes de la spec §2.0. */
export const LIMITS = {
  productName: 120,
  productDescription: 600,
  brandName: 120,
  brandIndustry: 120,
  brandDescription: 600,
  userPrompt: 1000,
  /** En el fallback el user_prompt SÍ llega al modelo de imagen, entre comillas y más corto. */
  userPromptFallback: 300,
} as const;

/* -------------------------------------------------------------------------- */
/*  URLs                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Solo http(s). Los arrays de fotos pueden traer `blob:` (un upload que falló en
 * el browser y quedó la URL local) o `data:` (placeholders SVG del seed): el
 * server no puede leer las primeras y las segundas no son fotos reales. En v1
 * una `blob:` tumbaba la tanda entera.
 */
export function isHttpUrl(u: unknown): u is string {
  if (typeof u !== "string") return false;
  try {
    const parsed = new URL(u);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Prefijos de path de Storage que el server acepta bajar. Son los únicos de
 * donde salen fotos y referencias legítimas: los uploads del browser (URL
 * firmada de los buckets privados) y el bucket público de referencias de inicio.
 */
const ALLOWED_STORAGE_PATHS = [
  "/storage/v1/object/sign/product-uploads/",
  "/storage/v1/object/sign/references-uploads/",
  "/storage/v1/object/public/starter-references/",
];

function storageOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/**
 * Freno de SSRF (JonSnow): `projects.product_images` y `versions.reference_images`
 * los escribe el usuario directo por PostgREST (RLS FOR ALL), así que pueden
 * traer CUALQUIER URL. Sin esto, /api/briefs/* bajaba URLs internas o un stream
 * infinito desde la infra de Vendí, gratis y sin medición. Solo pasa una URL del
 * MISMO origen que el Supabase configurado (misma forma que arma supabase-js al
 * firmar) y de los buckets de arriba. `new URL` ya normaliza `..` y `%2e%2e`.
 * Sin NEXT_PUBLIC_SUPABASE_URL no pasa nada (fail-closed).
 */
export function isAllowedImageUrl(u: unknown): u is string {
  if (!isHttpUrl(u)) return false;
  const origin = storageOrigin();
  if (!origin) return false;
  const parsed = new URL(u);
  if (parsed.origin !== origin || parsed.username || parsed.password) return false;
  return ALLOWED_STORAGE_PATHS.some((p) => parsed.pathname.startsWith(p));
}

/**
 * Separa las URLs usables de las descartadas. Las descartadas se registran en
 * `plan_meta.skipped_urls` RECORTADAS: una data: URL puede pesar megas y no
 * tiene sentido guardarla entera en el snapshot.
 *
 * `allow` es inyectable solo para pruebas offline; en producción es siempre
 * `isAllowedImageUrl`, y lo usan tanto la generación como los endpoints de
 * notas (misma política → mismo hash de nota en los dos caminos).
 */
export function partitionUrls(
  urls: unknown,
  allow: (u: unknown) => boolean = isAllowedImageUrl,
): { http: string[]; skipped: string[] } {
  const http: string[] = [];
  const skipped: string[] = [];
  if (!Array.isArray(urls)) return { http, skipped };
  for (const u of urls) {
    if (typeof u === "string" && allow(u)) http.push(u);
    else skipped.push(typeof u === "string" ? u.slice(0, 60) : String(u).slice(0, 60));
  }
  return { http, skipped };
}

/* -------------------------------------------------------------------------- */
/*  Utilidades de texto (compartidas por assemble/fallback/validate)            */
/* -------------------------------------------------------------------------- */

/** "a" | "a and b" | "a, b and c" */
export function joinList(items: string[]): string {
  const xs = items.filter((s) => s.length > 0);
  if (xs.length === 0) return "";
  if (xs.length === 1) return xs[0];
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function wordCount(s: string): number {
  const t = s.trim();
  return t.length === 0 ? 0 : t.split(/\s+/).length;
}

/** Primera letra en mayúscula (para oraciones que arrancan con texto de la IA). */
export function capitalizeFirst(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/** Saca el punto final (y espacios) — el ensamblado agrega el suyo. */
export function stripTrailingPeriod(s: string): string {
  return s.trim().replace(/[.\s]+$/, "");
}

/** Colapsa espacios dobles que dejan las piezas vacías del ensamblado. */
export function squeeze(s: string): string {
  return s.replace(/[ \t]+/g, " ").replace(/ +\n/g, "\n").trim();
}

/** Oraciones con su puntuación final (el texto de la IA no trae abreviaturas raras). */
export function splitSentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]+["')\]]*(?:\s+|$)|[^.!?]+$/g) ?? [text];
}

const CLAUSE_SEP = /(,\s+|;\s+)/;
const CLAUSE_SEP_AND = /(,\s+and\s+|,\s+|;\s+|\s+and\s+)/;

/**
 * Saca de un texto las CLÁUSULAS que cumplen `isBad` (v2.1: segunda unidad F3,
 * "shadow of …" F11, [PRODUCT] sobrante del template F3). Corta por comas y
 * punto y coma; con `splitAnd` también por " and " (sirve para "wears A around
 * her body and a second A as a turban", pero rompe "strikes from the left and
 * its straps…", por eso es opcional). Si la cláusula mala es la PRINCIPAL (la
 * primera de la oración), la oración entera se va: sin ella no se sostiene. Un
 * texto sin cláusulas malas vuelve igual, byte a byte.
 */
export function dropClauses(
  text: string,
  isBad: (clause: string) => boolean,
  opts: { splitAnd?: boolean } = {},
): string {
  if (!text || !isBad(text)) return text;
  const sep = opts.splitAnd ? CLAUSE_SEP_AND : CLAUSE_SEP;
  const kept: string[] = [];
  for (const sentence of splitSentences(text)) {
    const s = sentence.trim();
    if (!s) continue;
    if (!isBad(s)) {
      kept.push(s);
      continue;
    }
    const end = /[.!?]["')\]]*$/.exec(s)?.[0] ?? "";
    const body = end ? s.slice(0, -end.length) : s;
    const pieces = body.split(sep);
    if (isBad(pieces[0])) continue;
    let out = pieces[0];
    for (let k = 2; k < pieces.length; k += 2) {
      if (!isBad(pieces[k])) out += pieces[k - 1] + pieces[k];
    }
    kept.push(`${out.trim()}${end}`);
  }
  return kept.join(" ");
}

/** Plural simple de una etiqueta en inglés ("handbag" → "handbags", "glass" → "glasses"). */
export function pluralizeLabel(label: string): string {
  if (/(s|x|z|ch|sh)$/i.test(label)) return `${label}es`;
  if (/[^aeiou]y$/i.test(label)) return `${label.slice(0, -1)}ies`;
  return `${label}s`;
}

/** Sustantivo núcleo de una etiqueta ("light-blue microfiber towel" → "towel"), sin el sufijo " A" de etiquetas repetidas. */
export function headNoun(label: string): string {
  const words = label.trim().replace(/\s+[A-F]$/, "").split(/\s+/);
  return (words[words.length - 1] ?? "").toLowerCase();
}
