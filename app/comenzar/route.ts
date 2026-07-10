import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Destino del boton "Comenzar" / "Quiero mi Pase" de la landing. La landing es
 * estatica y vive en otro dominio, asi que NO puede saber si el visitante tiene
 * sesion. Por eso el boton apunta aca (al dominio de la app, donde vive la
 * cookie de Clerk) y este route decide:
 *  - con sesion  -> /dashboard (ya esta adentro; desde ahi llega a /upgrade)
 *  - sin sesion  -> /signup y, apenas se registra, a /upgrade (checkout real)
 *
 * IMPORTANTE: el cobro se hace SIEMPRE por /api/checkout (Checkout Pro), que
 * crea una Preference fresca en soles y adjunta el id de Clerk para que el
 * webhook acredite los creditos. NO usamos links de pago sueltos de Mercado
 * Pago: un pago por un link estatico no lleva el id del usuario, asi que el
 * webhook no sabria a quien acreditar (ademas del que estaba era de PRUEBA y
 * no cobraba). El registro previo es obligatorio para poder acreditar.
 */
export async function GET(request: Request) {
  const { userId } = await auth();
  if (userId) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  // Sin sesion: registro -> checkout real. Clerk respeta `redirect_url` (tiene
  // precedencia sobre el fallback /onboarding) y manda al usuario a /upgrade
  // apenas termina de registrarse, para que pague por el flujo que SI acredita.
  const signup = new URL("/signup", request.url);
  signup.searchParams.set("redirect_url", "/upgrade");
  return NextResponse.redirect(signup);
}
