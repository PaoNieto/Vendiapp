/**
 * Atribución: de qué anuncio / campaña vino cada persona.
 *
 * El proxy (`proxy.ts`) mira la primera visita que trae `utm_*` o `fbclid` y la
 * guarda en una cookie first-party. Después, al crear el perfil
 * (`ensureProfile`) se copia a `profiles.attribution`, y al armar el checkout
 * viaja en el metadata de Whop. Así una venta se puede atar a su anuncio.
 *
 * FIRST-TOUCH: si la cookie ya existe no se pisa (cuenta el anuncio que trajo a
 * la persona por primera vez).
 *
 * También se arma `_fbc` (formato de Meta `fb.1.<ms>.<fbclid>`), que la API de
 * conversiones usa para atar una compra al clic del anuncio.
 *
 * NOTA: lo importa el proxy, que no corre en la capa "react-server", así que NO
 * lleva `import "server-only"` (igual que lib/auth/paid-access.ts). No toca
 * secretos.
 */

export const ATTRIBUTION_COOKIE = "vendi_attr";
export const FBC_COOKIE = "_fbc";
/** 90 días: la ventana en la que una venta todavía se le atribuye al anuncio. */
export const ATTRIBUTION_MAX_AGE = 60 * 60 * 24 * 90;

const KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
] as const;

export type Attribution = Partial<Record<(typeof KEYS)[number], string>> & {
  /** Primera ruta de la app donde aterrizó. */
  landing_path?: string;
  /** Cuándo (ISO). */
  first_seen?: string;
};

/** Extrae la atribución del query string, o null si no trae nada útil. */
export function attributionFromSearch(
  search: URLSearchParams,
  pathname: string,
): Attribution | null {
  const out: Attribution = {};
  for (const key of KEYS) {
    const value = search.get(key);
    // Tope de largo: es input del usuario y termina en la base y en Whop.
    if (value) out[key] = value.slice(0, 200);
  }
  if (Object.keys(out).length === 0) return null;
  out.landing_path = pathname.slice(0, 200);
  out.first_seen = new Date().toISOString();
  return out;
}

/** Lee la cookie de atribución. Valor corrupto → null (nunca tira). */
export function parseAttributionCookie(
  raw: string | undefined,
): Attribution | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const out: Attribution = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string") (out as Record<string, string>)[k] = v.slice(0, 200);
    }
    return out;
  } catch {
    return null;
  }
}

/** Valor de `_fbc` a partir de un fbclid. */
export function fbcFromFbclid(fbclid: string): string {
  return `fb.1.${Date.now()}.${fbclid}`;
}
