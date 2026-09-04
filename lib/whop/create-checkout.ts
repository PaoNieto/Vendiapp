import "server-only";
import { getProduct } from "@/lib/billing/catalog";
import { getWhopAccountId, whopFetch, WhopApiError } from "./client";

/**
 * Crea el checkout de Whop para (userId, productId).
 *
 * Espejo exacto del contrato de errores de `lib/mercadopago/create-preference.ts`
 * (el riel anterior), para que `/api/checkout` no cambie su mapeo de HTTP status
 * y los 3 clientes que hacen `window.location.href = data.initPoint` sigan
 * funcionando sin tocar una línea.
 */
export type CreateCheckoutErrorCode =
  | "PRODUCT_NOT_FOUND"
  | "APP_URL_MISSING"
  | "WHOP_FAILED";

/**
 * Error tipado de la creación del checkout. El caller (route de checkout) mapea
 * cada `code` a su HTTP status exacto (404 / 503) y trata cualquier otro fallo
 * (incluido WHOP_FAILED) como 502.
 */
export class CreateCheckoutError extends Error {
  code: CreateCheckoutErrorCode;
  constructor(code: CreateCheckoutErrorCode, message: string) {
    super(message);
    this.name = "CreateCheckoutError";
    this.code = code;
  }
}

/** Forma (parcial) de la respuesta de POST /checkout_configurations. */
type WhopCheckoutConfiguration = {
  id?: string;
  purchase_url?: string | null;
  plan_id?: string | null;
  plan?: { id?: string } | null;
};

/**
 * Crea una CHECKOUT CONFIGURATION de Whop y devuelve su `purchase_url`.
 *
 * Qué es: una configuración de checkout reusable que apunta a un plan YA
 * EXISTENTE y que puede llevar metadata propia. Whop devuelve una URL de la
 * forma `https://whop.com/checkout/plan_XXX/?session=ch_YYY` — el reemplazo 1:1
 * del `init_point` de Mercado Pago. Por eso el campo devuelto se sigue llamando
 * `initPoint`: los clientes no se tocan.
 *
 * 🔴 `plan_id` DE NIVEL SUPERIOR, NUNCA el objeto `plan` inline.
 * Son mutuamente excluyentes: `plan_id` cobra el plan que ya existe en la cuenta
 * de Whop; el objeto `plan` inline CREA UN PLAN NUEVO. Mandar `plan` en cada
 * compra ensuciaría la cuenta con un plan por venta y rompería los reportes.
 *
 * 🔴 EL METADATA ES LA ATRIBUCIÓN. Whop lo copia intacto al pago, y el webhook
 * `payment.succeeded` lo lee de `data.metadata` para saber A QUIÉN acreditar y
 * QUÉ producto se compró. Sin metadata el pago entra pero nadie recibe créditos.
 * Whop solo acepta valores STRING en metadata (tope 40 pares), así que va todo
 * como string; NO se manda `credits` — eso se resuelve del catálogo server-side
 * en el webhook, jamás del payload (si viajara, alguien lo manipularía).
 *
 * Los 4 productos son de PAGO ÚNICO (`mode: "payment"`): el Pase Fundador se
 * compra una vez, y los packs de créditos se pueden recomprar cuantas veces el
 * usuario quiera. Ninguno renueva ni es suscripción.
 */
export async function createWhopCheckout(
  userId: string,
  productId: string,
): Promise<{ initPoint: string; sessionId?: string }> {
  // Producto del catálogo server-side. El cliente NUNCA fija precio ni créditos:
  // solo manda el id del pack.
  const product = getProduct(productId);
  if (!product) {
    throw new CreateCheckoutError(
      "PRODUCT_NOT_FOUND",
      "Producto no encontrado",
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    throw new CreateCheckoutError("APP_URL_MISSING", "Servicio no configurado");
  }

  // La cuenta de Whop que cobra. Si falta la env, es un error de configuración
  // del server: WHOP_FAILED -> 502 (el caller ya loguea el detalle).
  let accountId: string;
  try {
    accountId = getWhopAccountId();
  } catch (err) {
    throw new CreateCheckoutError(
      "WHOP_FAILED",
      err instanceof Error ? err.message : "Whop no configurado",
    );
  }

  let config: WhopCheckoutConfiguration;
  try {
    config = await whopFetch<WhopCheckoutConfiguration>(
      "/checkout_configurations",
      {
        method: "POST",
        body: {
          account_id: accountId,
          // Plan YA EXISTENTE (ver el bloque de arriba). NO usar `plan` inline.
          plan_id: product.whopPlanId,
          // "payment" = cobrar ahora (vs "setup", que solo guarda el medio de pago).
          mode: "payment",
          // Viaja intacto hasta data.metadata del webhook payment.succeeded.
          // `pack_id` y `product_id` llevan el MISMO valor a propósito: el
          // webhook acepta cualquiera de los dos nombres, así un cambio de
          // convención no deja pagos sin atribuir.
          metadata: {
            clerk_user_id: userId,
            pack_id: product.id,
            product_id: product.id,
          },
          // A dónde vuelve el comprador después de pagar. Es SOLO UX: la
          // acreditación la hace el webhook (fuente de verdad).
          redirect_url: `${appUrl}/pago/resultado`,
        },
        // Sin Idempotency-Key: cada intento de compra es un checkout nuevo a
        // propósito (el mismo usuario puede recargar el mismo pack N veces).
      },
    );
  } catch (err) {
    if (err instanceof WhopApiError) {
      console.error(
        "[whop-checkout] Whop rechazó la checkout configuration:",
        err.status,
        err.body,
      );
    }
    throw new CreateCheckoutError(
      "WHOP_FAILED",
      "No se pudo crear el checkout",
    );
  }

  const initPoint = config?.purchase_url;
  if (!initPoint) {
    console.error(
      "[whop-checkout] Respuesta sin purchase_url:",
      JSON.stringify(config),
    );
    throw new CreateCheckoutError(
      "WHOP_FAILED",
      "No se pudo crear el checkout",
    );
  }

  return { initPoint, sessionId: config.id };
}
