/**
 * Disparadores de las NOTAS del pipeline v2, del lado del browser.
 *
 * Cuando el usuario sube o cambia las fotos de un producto (o las referencias de
 * una versión), avisamos al server para que calcule la nota EN SEGUNDO PLANO.
 * Así, cuando después aprieta "Generar", la nota ya está en cache y la tanda no
 * paga los ~10-20s de analizarla en el momento.
 *
 * Reglas:
 *   - Fire-and-forget: nadie espera la respuesta. `keepalive` deja que el POST
 *     salga aunque el usuario navegue o cierre la pestaña justo después.
 *   - Nunca rompe la UI: cualquier error (red, 4xx, 5xx, un browser sin
 *     keepalive) se traga en silencio. Sin la nota, la generación la calcula
 *     sola; esto es solo una optimización.
 *   - Se llama para TODOS los usuarios: el server responde 204 sin gastar nada a
 *     quien no está en la v2 (el flag es server-only y el cliente no lo conoce).
 *
 * Este archivo NO importa nada de `lib/ai/v2/`: ese código es de server (hashes
 * con node:crypto, cliente admin) y no tiene que colarse en el bundle del browser.
 */

function fireAndForget(path: string, body: Record<string, string>): void {
  try {
    void fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => undefined);
  } catch {
    // fetch puede lanzar sincrónico en entornos raros (p.ej. keepalive no
    // soportado con este body). La nota es opcional: seguimos como si nada.
  }
}

/** Nota del producto: tras el INSERT del alta o un UPDATE de `product_images`. */
export function triggerProductBrief(productId: string): void {
  fireAndForget("/api/briefs/product", { productId });
}

/** Notas de las referencias: tras un UPDATE de `reference_images` de la versión. */
export function triggerReferenceBrief(versionId: string): void {
  fireAndForget("/api/briefs/reference", { versionId });
}
