import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  createWhopCheckout,
  CreateCheckoutError,
} from "@/lib/whop/create-checkout";
import { ensureProfile } from "@/lib/auth/ensure-profile";
import { checkoutRequestSchema } from "@/lib/validations/checkout";

// La creación del checkout necesita runtime Node (no Edge).
// force-dynamic: nunca prerenderizar, siempre correr en el request.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/checkout — crea un checkout de WHOP y devuelve el `initPoint` (la
 * URL a la que el front redirige para pagar).
 *
 * 🔴 EL NOMBRE `initPoint` SE CONSERVA A PROPÓSITO. Era el `init_point` de
 * Mercado Pago; con Whop es el `purchase_url` de la checkout configuration. Al
 * mantener la forma de la respuesta, los 3 clientes que hacen
 * `window.location.href = data.initPoint` (upgrade-store, plan-client,
 * fundador-client) NO se tocan.
 *
 * Seguridad: el cliente solo manda `productId`. Precio y créditos se resuelven
 * server-side desde el catálogo — el cliente NUNCA fija el monto. El usuario
 * Clerk viaja en el `metadata` del checkout para que el webhook sepa a quién
 * acreditar sin sesión.
 *
 * El cobro real lo confirma el webhook /api/webhooks/whop (fuente de verdad).
 * El `redirect_url` es solo UX y NO acredita créditos.
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

  // 3. Crear el checkout (resuelve producto + appUrl adentro y arma el cobro).
  // Los fallos previsibles vienen como CreateCheckoutError tipado y se mapean a
  // su HTTP status; cualquier otra cosa (incl. WHOP_FAILED) cae en 502.
  try {
    const { initPoint, sessionId } = await createWhopCheckout(
      userId,
      parsed.data.productId,
    );
    return NextResponse.json({ initPoint, sessionId }, { status: 200 });
  } catch (err) {
    if (err instanceof CreateCheckoutError) {
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
    console.error("[checkout] Error creando el checkout de Whop:", err);
    return NextResponse.json(
      { error: "No se pudo crear el checkout" },
      { status: 502 },
    );
  }
}
