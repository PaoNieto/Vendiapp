import "server-only";
import crypto from "node:crypto";

/**
 * Valida el header `X-Shopify-Hmac-Sha256` de un webhook de Shopify.
 *
 * Shopify firma cada webhook asi:
 *   X-Shopify-Hmac-Sha256 = base64( HMAC-SHA256( rawBody, SHOPIFY_WEBHOOK_SECRET ) )
 *
 * La firma se calcula sobre el CUERPO CRUDO (los bytes exactos que mando
 * Shopify), NO sobre un JSON re-serializado. Si parseas y volves a stringificar,
 * cambia el orden de claves / el espaciado y el HMAC NUNCA coincide. Por eso en
 * el route handler se hace `const raw = await req.text()` y se valida sobre `raw`
 * ANTES de cualquier JSON.parse.
 *
 * El secret de firma es el "API secret key" de la app / el secret del webhook que
 * Shopify muestra al crearlo (env SHOPIFY_WEBHOOK_SECRET). El SDK no valida esto
 * por nosotros: va a mano, igual que con la firma x-signature de Mercado Pago.
 *
 * Comparacion en tiempo constante (crypto.timingSafeEqual) para no filtrar info
 * por timing. Devuelve boolean: true = firma valida, false = invalida/ausente.
 */
export function verifyShopifyWebhook(rawBody: string, secret: string): boolean {
  return verifyShopifyHmac(rawBody, undefined, secret);
}

/**
 * Variante que recibe el header explicito (para llamarla con el `req` del route).
 * `hmacHeader` es el valor de `X-Shopify-Hmac-Sha256`.
 */
export function verifyShopifyHmac(
  rawBody: string,
  hmacHeader: string | null | undefined,
  secret: string,
): boolean {
  if (!hmacHeader || !secret) return false;

  // HMAC-SHA256 del cuerpo crudo, salida en base64 (como lo manda Shopify).
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  // Comparacion timing-safe. Si los largos difieren, timingSafeEqual tira, asi
  // que cortamos antes (un largo distinto ya es firma invalida).
  const a = Buffer.from(expected, "base64");
  const b = Buffer.from(hmacHeader, "base64");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
