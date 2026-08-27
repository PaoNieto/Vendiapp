import "server-only";
import { Preference } from "mercadopago";
import { getMercadoPagoClient } from "./client";
import { getProduct } from "./catalog";

export type CreatePreferenceErrorCode =
  | "PRODUCT_NOT_FOUND"
  | "APP_URL_MISSING"
  | "MP_FAILED";

/**
 * Error tipado de la creación de la Preference. El caller (route de checkout)
 * mapea cada `code` a su HTTP status exacto (404 / 503), y trata cualquier otro
 * fallo (incluido MP_FAILED) como 502.
 */
export class CreatePreferenceError extends Error {
  code: CreatePreferenceErrorCode;
  constructor(code: CreatePreferenceErrorCode, message: string) {
    super(message);
    this.name = "CreatePreferenceError";
    this.code = code;
  }
}

/**
 * Crea una Preference de Checkout Pro para (userId, productId) y devuelve el
 * init_point. Precio/créditos salen SIEMPRE del catálogo server-side; el userId
 * viaja como external_reference + metadata para que el webhook acredite. Lanza
 * CreatePreferenceError en fallos previsibles (producto/appUrl) y en fallo de MP.
 */
export async function createPreference(
  userId: string,
  productId: string,
): Promise<{ initPoint: string; preferenceId?: string }> {
  // Resolver el producto del catálogo server-side (precio + créditos). El
  // cliente NUNCA fija el monto: solo manda el id del pack.
  const product = getProduct(productId);
  if (!product) {
    throw new CreatePreferenceError(
      "PRODUCT_NOT_FOUND",
      "Producto no encontrado",
    );
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    throw new CreatePreferenceError("APP_URL_MISSING", "Servicio no configurado");
  }
  // external_reference + metadata llevan el id de Clerk y el pack para que el
  // webhook reconcilie y acredite los créditos correctos sin sesión.
  const client = getMercadoPagoClient();
  const preference = await new Preference(client).create({
    body: {
      items: [
        {
          id: product.id,
          title: product.title,
          description: product.description,
          quantity: 1,
          unit_price: product.priceSoles,
          currency_id: "PEN",
        },
      ],
      external_reference: userId,
      metadata: {
        clerk_user_id: userId,
        pack_id: product.id,
        credits: product.credits,
      },
      // Pago ÚNICO: los packs no se venden en cuotas. installments: 1 hace que
      // MP solo ofrezca "1x" (sin la grilla de 3/6/12/24 cuotas).
      payment_methods: { installments: 1 },
      back_urls: {
        success: `${appUrl}/pago/resultado`,
        failure: `${appUrl}/pago/resultado`,
        pending: `${appUrl}/pago/resultado`,
      },
      auto_return: "approved",
      // notification_url: MP tiene que poder alcanzarla públicamente. En dev con
      // localhost NO llega → usar un túnel (ngrok) o probar en Vercel.
      notification_url: `${appUrl}/api/webhooks/mercadopago`,
    },
  });
  if (!preference.init_point) {
    throw new CreatePreferenceError("MP_FAILED", "No se pudo crear el checkout");
  }
  return { initPoint: preference.init_point, preferenceId: preference.id };
}
