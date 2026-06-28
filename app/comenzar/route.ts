import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Destino del boton "Comenzar"/"Unirme" de la landing. La landing es estatica y
 * vive en otro dominio, asi que NO puede saber si el visitante tiene sesion. Por
 * eso el boton apunta aca (al dominio de la app, donde vive la cookie de Clerk) y
 * este route lo enruta SIEMPRE por el unico flujo que cobra Y acredita:
 * /upgrade dispara POST /api/checkout, que crea la Preference de Mercado Pago con
 * external_reference = id de Clerk; el webhook (process_mp_payment) acredita los
 * creditos a ese usuario.
 *  - con sesion  -> /upgrade (la vitrina del checkout per-usuario)
 *  - sin sesion  -> /signup?redirect_url=/upgrade (se registra y cae en el checkout)
 *
 * NO volver a un link estatico de Mercado Pago: un pref_id fijo (a) era de PRUEBA
 * y no cobraba real, y (b) aunque fuera productivo, no lleva external_reference por
 * usuario, asi que el webhook no podria acreditarle los creditos a nadie -> el
 * cliente pagaria y quedaria sin nada.
 */
export async function GET(request: Request) {
  const { userId } = await auth();
  if (userId) {
    return NextResponse.redirect(new URL("/upgrade", request.url));
  }
  const signup = new URL("/signup", request.url);
  signup.searchParams.set("redirect_url", "/upgrade");
  return NextResponse.redirect(signup);
}
