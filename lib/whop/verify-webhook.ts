import "server-only";
import crypto from "node:crypto";

/**
 * Valida la firma de un webhook de Whop (formato "Standard Webhooks").
 *
 * ⚠️ SE HACE A MANO, sin SDK, a propósito: el helper `unwrapWebhook` de
 * `@whop/sdk/helpers` que muestra la doc TODAVÍA NO ESTÁ RELEASEADO. Copiamos la
 * forma ya probada de `lib/shopify/verify-webhook.ts` (HMAC + base64 +
 * timingSafeEqual con guard de longitud) y le sumamos el anti-replay.
 *
 * Cómo firma Whop (docs.whop.com/developer/guides/webhooks, "Verify without an
 * SDK"):
 *   contenido firmado = `{webhook-id}.{webhook-timestamp}.{raw body}`
 *   firma            = base64( HMAC-SHA256( contenido, secret ws_... ) )
 *   header           = `webhook-signature: v1,<firma>`
 *
 * El CUERPO CRUDO importa: la firma se calcula sobre los bytes exactos que mandó
 * Whop. Si parseás y volvés a stringificar, cambia el orden de claves / el
 * espaciado y el HMAC NUNCA coincide. Por eso el route hace
 * `const raw = await req.text()` ANTES de cualquier JSON.parse.
 *
 * El header puede traer VARIAS firmas separadas por espacio (rotación de
 * secreto): se acepta si ALGUNA matchea.
 *
 * ANTI-REPLAY: se rechaza si `webhook-timestamp` está a más de 5 minutos de
 * ahora. Sin esto, alguien que capture un evento válido podría reenviarlo para
 * siempre (la idempotencia de la RPC igual lo frenaría, pero la primera línea de
 * defensa es esta).
 */

/** Headers de firma de Whop, tal como llegan del request. */
export type WhopWebhookHeaders = {
  /** `webhook-id` */
  id: string | null | undefined;
  /** `webhook-timestamp` (segundos unix, como string) */
  timestamp: string | null | undefined;
  /** `webhook-signature` (`v1,<base64>`, puede traer varias separadas por espacio) */
  signature: string | null | undefined;
};

/** Ventana anti-replay: 5 minutos, como especifica la doc de Whop. */
const MAX_SKEW_SECONDS = 5 * 60;

/**
 * ⚠️ TODO (BORRAR ANTES DE PROD, tras la primera prueba en sandbox).
 *
 * Ambigüedad conocida del secreto: el estándar canónico "Standard Webhooks" usa
 * un secreto `whsec_<base64>` y firma con el base64 DECODIFICADO; la doc de Whop
 * dice textual "The key is your `ws_...` secret" (o sea, el string CRUDO) pero
 * también "The helper derives the key", que deja lugar a la otra lectura.
 *
 * Implementamos con el string CRUDO (lo que dice la doc explícita de "verify
 * without an SDK"). Este flag hace que, cuando la validación falla, se calcule
 * también la variante decodificada y se loguee cuál habría coincidido. Con eso,
 * la PRIMERA prueba en sandbox resuelve la duda de una y se borra este bloque.
 */
const DEBUG_SECRET_VARIANT = true;

/** Deriva la clave HMAC "canónica Standard Webhooks": sin prefijo, base64-decodificada. */
function decodedSecretKey(secret: string): Buffer | null {
  const withoutPrefix = secret.startsWith("ws_") ? secret.slice(3) : secret;
  try {
    const buf = Buffer.from(withoutPrefix, "base64");
    return buf.length > 0 ? buf : null;
  } catch {
    return null;
  }
}

/** base64( HMAC-SHA256(content, key) ). */
function sign(content: string, key: crypto.BinaryLike): string {
  return crypto.createHmac("sha256", key).update(content, "utf8").digest("base64");
}

/** Comparación en tiempo constante con guard de longitud (timingSafeEqual tira si difieren). */
function safeEqualBase64(expected: string, received: string): boolean {
  const a = Buffer.from(expected, "base64");
  const b = Buffer.from(received, "base64");
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Extrae las firmas del header `webhook-signature`.
 * Formato: `v1,<base64>` — y puede venir más de una separada por espacios.
 * Se ignoran los esquemas que no sean `v1`.
 */
function parseSignatures(header: string): string[] {
  const out: string[] = [];
  for (const part of header.split(" ")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const comma = trimmed.indexOf(",");
    if (comma === -1) continue;
    const scheme = trimmed.slice(0, comma);
    const value = trimmed.slice(comma + 1);
    if (scheme === "v1" && value) out.push(value);
  }
  return out;
}

/**
 * Verifica la firma de un webhook de Whop.
 *
 * @param rawBody cuerpo CRUDO (string), tal como llegó — nunca re-serializado.
 * @param headers `webhook-id`, `webhook-timestamp`, `webhook-signature`.
 * @param secret  `WHOP_WEBHOOK_SECRET` (`ws_...`), tal como lo dio Whop.
 * @returns true = firma válida y dentro de la ventana anti-replay.
 */
export function verifyWhopWebhook(
  rawBody: string,
  headers: WhopWebhookHeaders,
  secret: string,
): boolean {
  const id = headers.id?.trim();
  const timestamp = headers.timestamp?.trim();
  const signatureHeader = headers.signature?.trim();
  if (!id || !timestamp || !signatureHeader || !secret) return false;

  // --- Anti-replay: el timestamp tiene que ser reciente ---
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const skew = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (skew > MAX_SKEW_SECONDS) {
    console.warn(
      "[whop-webhook] Timestamp fuera de la ventana anti-replay (s):",
      skew,
    );
    return false;
  }

  const signatures = parseSignatures(signatureHeader);
  if (signatures.length === 0) return false;

  // --- Firma: HMAC-SHA256 sobre `{id}.{timestamp}.{raw body}` ---
  const content = `${id}.${timestamp}.${rawBody}`;
  const expected = sign(content, secret);
  for (const received of signatures) {
    if (safeEqualBase64(expected, received)) return true;
  }

  // TODO(whop): borrar este diagnóstico después de la primera prueba en sandbox.
  if (DEBUG_SECRET_VARIANT) {
    const key = decodedSecretKey(secret);
    if (key) {
      const alt = sign(content, key);
      for (const received of signatures) {
        if (safeEqualBase64(alt, received)) {
          console.warn(
            "[whop-webhook] TODO: la firma coincide con el secreto BASE64-DECODIFICADO, " +
              "no con el string crudo. Cambiar `sign(content, secret)` por " +
              "`sign(content, decodedSecretKey(secret))` en lib/whop/verify-webhook.ts " +
              "y borrar este bloque de diagnóstico.",
          );
          return false;
        }
      }
    }
    console.warn(
      "[whop-webhook] Firma inválida con AMBAS variantes del secreto (crudo y base64-decodificado).",
    );
  }

  return false;
}
