import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureProfile } from "@/lib/auth/ensure-profile";
import { hasAppAccess } from "@/lib/auth/access";
import { createPreference } from "@/lib/mercadopago/create-preference";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Destino universal del embudo paga-primero. Resuelve el siguiente paso:
 *  - anónimo            → /signup?redirect_url=/comprar (primero se registra).
 *  - logueado con acceso → /dashboard (ya pagó/ilimitado; no re-cobrar).
 *  - logueado sin acceso → Checkout Pro de Mercado Pago (init_point per-usuario,
 *    external_reference = id de Clerk → el webhook le acredita). Si falla, →
 *    /pago/resultado?status=error: una página FUERA del gate (con botón de
 *    reintento a /comprar). NO redirige a /upgrade: /upgrade ahora vive dentro de
 *    (app) y está gateado → un fallo persistente haría loop /comprar→/upgrade→gate.
 */
export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.redirect(new URL("/signup?redirect_url=/comprar", request.url));
  }
  await ensureProfile();
  if (await hasAppAccess(userId)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
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
