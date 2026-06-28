import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { userHasPaidAccess } from "@/lib/auth/paid-access";

/**
 * Destino del boton "Comenzar" de la landing. La landing es estatica y vive en
 * otro dominio, asi que NO puede saber si el visitante tiene sesion. Por eso el
 * boton apunta aca (al dominio de la app, donde vive la cookie de Clerk) y este
 * route decide el siguiente paso del embudo PAGA-PRIMERO:
 *
 *  - SIN sesion        -> /signup (que se registre; despues paga).
 *  - logueado SIN pagar -> /upgrade (vitrina de packs). Es el unico checkout
 *                          pegado a su cuenta (external_reference = id de Clerk),
 *                          asi el pago desbloquea la app solo. Mandarlo a un link
 *                          de pago generico NO sirve: el webhook no sabria a quien
 *                          acreditarle (mismo problema que un pedido huerfano).
 *  - logueado que pago  -> /dashboard (ya es cliente).
 *
 * El guardia del proxy (proxy.ts) hace cumplir "solo entra quien pago": al
 * usuario logueado sin pagar lo manda a la landing; desde ahi "Comenzar" lo trae
 * aca y lo encamina a /upgrade a pagar.
 */
export async function GET(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.redirect(new URL("/signup", request.url));
  }

  if (!(await userHasPaidAccess(userId))) {
    return NextResponse.redirect(new URL("/upgrade", request.url));
  }

  return NextResponse.redirect(new URL("/dashboard", request.url));
}
