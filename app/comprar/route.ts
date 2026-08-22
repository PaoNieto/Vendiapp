import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureProfile } from "@/lib/auth/ensure-profile";
import { userHasPaidAccess } from "@/lib/auth/paid-access";
import { createPreference } from "@/lib/mercadopago/create-preference";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Destino universal del embudo. Resuelve el siguiente paso:
 *  - anonimo             -> /signup?redirect_url=/comprar (primero se registra).
 *  - logueado con acceso -> /dashboard (ya pago/ilimitado; no re-cobrar).
 *  - logueado sin acceso -> /plan (el PAYWALL). El boton de /plan es el que
 *    dispara el checkout via POST /api/checkout.
 *
 * ANTES este handler creaba la Preference y saltaba DERECHO a Mercado Pago. Por
 * eso el paywall era inalcanzable: la landing ("Quiero mi Lifetime Pass" ->
 * /comenzar -> /comprar), el login (-> /dashboard -> gate -> /comprar) y
 * cualquier ruta de (app) sin pagar (-> gate -> /comprar) TODAS terminaban en MP
 * sin pasar por la pantalla de precio. El unico camino que veia el onboarding
 * era completar el signup en ese instante exacto.
 *
 * ?direct=1 = ESCOTILLA ANTI-LOOP (y unica forma de conservar el salto directo).
 * `app/plan/page.tsx` la usa como fallback cuando no puede resolver el producto
 * del catalogo: sin esto seria /comprar -> /plan -> /comprar -> ... infinito, y
 * el usuario quedaria SIN camino a pagar. Con ella, cualquier fallo de /plan
 * degrada exactamente al comportamiento viejo (Preference + MP), que funciona.
 *
 * Si crear la Preference falla -> /pago/resultado?status=error: pagina FUERA del
 * gate, con boton de reintento. NO se redirige a /upgrade (vive dentro de (app)
 * y esta gateado -> loop /comprar->/upgrade->gate).
 */
export async function GET(request: Request) {
  // Escotilla explicita: SOLO ?direct=1 saltea el paywall y va derecho a MP.
  const direct =
    new URL(request.url).searchParams.get("direct") === "1";

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.redirect(new URL("/signup?redirect_url=/comprar", request.url));
  }
  await ensureProfile();
  if (await userHasPaidAccess(userId)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Camino NORMAL del no-pagador: ve la pantalla de precio, no el checkout crudo.
  if (!direct) {
    return NextResponse.redirect(new URL("/plan", request.url));
  }

  // Camino de ESCAPE (?direct=1): comportamiento historico intacto.
  try {
    const { initPoint } = await createPreference(userId, "lifetime-pass");
    return NextResponse.redirect(initPoint);
  } catch (err) {
    console.error("[comprar] No se pudo crear la Preference:", err);
    return NextResponse.redirect(
      new URL("/pago/resultado?status=error", request.url),
    );
  }
}
