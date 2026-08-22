import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  createPreference,
  CreatePreferenceError,
} from "@/lib/mercadopago/create-preference";
import { ensureProfile } from "@/lib/auth/ensure-profile";
import { checkCheckoutRateLimit } from "@/lib/mercadopago/checkout-rate-limit";
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
 *
 * RATE LIMIT (G3): cada llamada abre una Preference en la cuenta real de Mercado
 * Pago de Paolo, así que hay un tope por usuario (ver
 * `lib/mercadopago/checkout-rate-limit.ts`). Es lo bastante alto como para que un
 * comprador que duda y vuelve varias veces no lo toque nunca, y falla hacia la
 * VENTA: si el chequeo no puede correr, se deja pagar igual.
 */
export async function POST(req: Request) {
  // 1. Auth (Clerk). El id canónico del usuario es el id de Clerk (string).
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // 2. Tope de checkouts por usuario. Va ACÁ ARRIBA a propósito: es lo primero
  // después de saber quién es, así el loop de abuso tampoco hace trabajar a
  // `ensureProfile()` ni a Mercado Pago. Nunca devuelve un error crudo: el
  // `error` que sale por JSON es el texto que los tres clientes del checkout
  // (/plan, /upgrade, /fundador) ya muestran tal cual en pantalla, y el botón
  // queda habilitado para reintentar.
  const limite = await checkCheckoutRateLimit(userId);
  if (!limite.allowed) {
    return NextResponse.json(
      { error: limite.message, retryAfterSeconds: limite.retryAfterSeconds },
      {
        status: 429,
        headers: { "Retry-After": String(limite.retryAfterSeconds) },
      },
    );
  }

  // Garantiza que exista la fila profiles ANTES de pagar: el webhook acredita
  // con grant_credits, que falla si el profile no existe. Idempotente.
  await ensureProfile();

  // 3. Validación del body (solo el id del producto).
  const body = await req.json().catch(() => null);
  const parsed = checkoutRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Request inválido", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  // 4. Crear la Preference (resuelve producto + appUrl adentro y arma el cobro).
  // Los fallos previsibles vienen como CreatePreferenceError tipado y se mapean
  // a su HTTP status; cualquier otra cosa (incl. fallo de MP) cae en 502.
  try {
    const { initPoint, preferenceId } = await createPreference(
      userId,
      parsed.data.productId,
    );
    return NextResponse.json({ initPoint, preferenceId }, { status: 200 });
  } catch (err) {
    if (err instanceof CreatePreferenceError) {
      if (err.code === "PRODUCT_NOT_FOUND")
        return NextResponse.json(
          { error: "Producto no encontrado" },
          { status: 404 },
        );
      if (err.code === "APP_URL_MISSING")
        return NextResponse.json(
          { error: "Servicio no configurado" },
          { status: 503 },
        );
    }
    console.error("[checkout] Error creando Preference de MP:", err);
    return NextResponse.json(
      { error: "No se pudo crear el checkout" },
      { status: 502 },
    );
  }
}
