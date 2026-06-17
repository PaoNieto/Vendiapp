import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Preference } from "mercadopago";
import { getMercadoPagoClient } from "@/lib/mercadopago/client";
import { getProduct } from "@/lib/mercadopago/catalog";
import { ensureProfile } from "@/lib/auth/ensure-profile";
import { checkoutRequestSchema } from "@/lib/validations/checkout";

// El SDK de Mercado Pago + la creación de Preference necesitan runtime Node
// (no Edge). force-dynamic: nunca prerenderizar, siempre correr en el request.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/checkout — crea una Preference de Checkout Pro y devuelve el
 * `init_point` (URL de Mercado Pago a la que el front redirige para pagar).
 *
 * Seguridad: el cliente solo manda `productId`. Precio y créditos se resuelven
 * server-side desde el catálogo — el cliente NUNCA fija el monto. El usuario
 * Clerk viaja como `external_reference` (y en metadata) para que el webhook
 * sepa a quién acreditar sin sesión.
 *
 * El cobro real lo confirma el webhook /api/webhooks/mercadopago (fuente de
 * verdad). Las back_urls son solo UX y NO acreditan créditos.
 */
export async function POST(req: Request) {
  // 1. Auth (Clerk). El id canónico del usuario es el id de Clerk (string).
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  // Garantiza que exista la fila profiles ANTES de pagar: el webhook acredita
  // con grant_credits, que falla si el profile no existe. Idempotente.
  await ensureProfile();

  // 2. Validación del body (solo el id del producto).
  const body = await req.json().catch(() => null);
  const parsed = checkoutRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Request inválido", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  // 3. Resolver el producto del catálogo server-side (precio + créditos).
  const product = getProduct(parsed.data.productId);
  if (!product) {
    return NextResponse.json(
      { error: "Producto no encontrado" },
      { status: 404 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return NextResponse.json(
      { error: "Servicio no configurado" },
      { status: 503 },
    );
  }

  // 4. Crear la Preference. external_reference + metadata llevan el id de Clerk
  // y el pack para que el webhook reconcilie y acredite los créditos correctos.
  try {
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
        back_urls: {
          success: `${appUrl}/upgrade/resultado`,
          failure: `${appUrl}/upgrade/resultado`,
          pending: `${appUrl}/upgrade/resultado`,
        },
        auto_return: "approved",
        // notification_url: MP tiene que poder alcanzarla públicamente. En dev
        // con localhost NO llega → usar un túnel (ngrok) o probar en Vercel.
        notification_url: `${appUrl}/api/webhooks/mercadopago`,
      },
    });

    if (!preference.init_point) {
      return NextResponse.json(
        { error: "No se pudo crear el checkout" },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { initPoint: preference.init_point, preferenceId: preference.id },
      { status: 200 },
    );
  } catch (err) {
    console.error("[checkout] Error creando Preference de MP:", err);
    return NextResponse.json(
      { error: "No se pudo crear el checkout" },
      { status: 502 },
    );
  }
}
