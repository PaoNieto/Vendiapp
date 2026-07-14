/**
 * Catálogo curado (legacy) — vocabulario de estilos de El Oráculo (análisis con
 * IA) + parseo retrocompat de referencias curadas viejas.
 *
 * ⚠️ Vivía en `app/(app)/referencias/page.tsx` (una page CLIENT), de donde lo
 * importaban módulos SERVER (`lib/ai/image-analyzer.ts`) — el acople más feo del
 * repo. Se movió acá, a `lib/`, para que server y cliente lo consuman sin
 * importar de una page. Valores IDÉNTICOS a los originales: solo cambió el hogar.
 *
 * Consumidores:
 *   - `lib/ai/image-analyzer.ts` (Oráculo): tipa el union de estilos que Gemini
 *     puede devolver (Zod corta si inventa uno).
 *   - `app/(app)/analisis/page.tsx`: dibuja los chips de estilos identificados.
 *   - `lib/analyses/store.tsx`: tipa el resultado del análisis.
 *
 * Los cuadrados de color ya NO se usan como selector en el flujo de creación
 * (la estación de estilo usa los Estilos Profesionales de `lib/styles.ts`);
 * `parseCuratedRef`/`curatedRefDataUrl` sobreviven para reconocer refs curadas
 * de versiones guardadas antes del cambio.
 */

export type CuratedStyleId =
  | "mineral"
  | "calido"
  | "editorial"
  | "mostaza"
  | "nocturno"
  | "pastel"
  | "mint"
  | "mono"
  | "champagne";

export type CuratedStyle = {
  id: CuratedStyleId;
  label: string;
  color: string;
  textOn: "dark" | "white";
};

export const CURATED_STYLES: ReadonlyArray<CuratedStyle> = [
  { id: "mineral", label: "Mineral", color: "#E8DFC8", textOn: "dark" },
  { id: "calido", label: "Cálido", color: "#B8694F", textOn: "white" },
  { id: "editorial", label: "Editorial", color: "#5C6B3F", textOn: "white" },
  { id: "mostaza", label: "Mostaza", color: "#C99A4B", textOn: "dark" },
  { id: "nocturno", label: "Nocturno", color: "#26395A", textOn: "white" },
  { id: "pastel", label: "Pastel", color: "#E8B8C6", textOn: "dark" },
  { id: "mint", label: "Mint", color: "#9ECDB9", textOn: "dark" },
  { id: "mono", label: "Mono", color: "#1B1B1B", textOn: "white" },
  { id: "champagne", label: "Champagne", color: "#DCC59A", textOn: "dark" },
];

/**
 * Construye el dataURI de un estilo curado. Lleva un marker `<!--curated:<id>-->`
 * para que `parseCuratedRef` pueda extraer el id desde cualquier consumer.
 * (Legacy: ya no se generan nuevas refs curadas, pero se conserva por simetría
 * con `parseCuratedRef`.)
 */
export function curatedRefDataUrl(style: CuratedStyle): string {
  const textColor = style.textOn === "white" ? "#FFFFFF" : "#1B1B1B";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><!--curated:${style.id}--><rect width="200" height="200" fill="${style.color}"/><text x="100" y="110" font-family="Georgia,serif" font-style="italic" font-size="22" fill="${textColor}" text-anchor="middle">${style.label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Si la URL pertenece a un estilo curado (versión vieja), devuelve el style.
 * Si no, null. Tolerante a encoding (busca tanto `<!--curated:xxx-->` como su
 * forma url-encoded `%3C!--curated:xxx--%3E`).
 */
export function parseCuratedRef(url: string): CuratedStyle | null {
  if (!url.startsWith("data:image/svg+xml")) return null;
  const rawMatch = url.match(/<!--curated:([a-z]+)-->/);
  const encMatch = url.match(/%3C!--curated:([a-z]+)--%3E/);
  const id = (rawMatch?.[1] ?? encMatch?.[1]) as CuratedStyleId | undefined;
  if (!id) return null;
  return CURATED_STYLES.find((s) => s.id === id) ?? null;
}
