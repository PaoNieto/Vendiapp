import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { userHasPaidAccess } from "@/lib/auth/paid-access";

/**
 * Destino del boton "Comenzar"/"Unirme" de la landing. La landing es estatica y
 * vive en otro dominio, asi que NO puede saber si el visitante tiene sesion. Por
 * eso el boton apunta aca (al dominio de la app, donde vive la cookie de Clerk) y
 * este route decide el siguiente paso del embudo PAGA-PRIMERO:
 *
 *  - SIN sesion         -> /signup?redirect_url=<destino> (se registra y cae en el
 *                          checkout per-usuario).
 *  - logueado SIN pagar  -> <destino> (la pagina de checkout). Es el unico flujo
 *                          que cobra Y acredita: dispara POST /api/checkout, que
 *                          crea la Preference de Mercado Pago con external_reference
 *                          = id de Clerk; el webhook (process_mp_payment) acredita
 *                          los creditos a ese usuario.
 *  - logueado que pago   -> /dashboard (ya es cliente, derecho a usar la app).
 *
 * <destino> depende del query `?producto`:
 *   - `producto=lifetime-pass` -> /upgrade/fundador (vende SOLO el Pase Fundador,
 *     S/39, 60 creditos + 10 analisis + plan founder). Es el destino de TODOS los
 *     CTA de compra de la landing, que vende la app via el Lifetime.
 *   - sin `producto` (o cualquier otro) -> /upgrade (la vitrina de packs interna).
 *
 * NO volver a un link estatico de Mercado Pago: un pref_id fijo (a) era de PRUEBA
 * y no cobraba real, y (b) aunque fuera productivo, no lleva external_reference por
 * usuario, asi que el webhook no podria acreditarle los creditos a nadie -> el
 * cliente pagaria y quedaria sin nada.
 *
 * El guardia del proxy (proxy.ts) hace cumplir "solo entra quien pago": al usuario
 * logueado sin pagar lo manda a la landing; desde ahi "Comenzar" lo trae aca y lo
 * encamina a /upgrade a pagar.
 */
export async function GET(request: Request) {
  const { userId } = await auth();

  // Destino del checkout segun el producto pedido. Hoy el unico producto con
  // pagina propia es el Lifetime; el resto cae en la vitrina de packs.
  const producto = new URL(request.url).searchParams.get("producto");
  const destino = producto === "lifetime-pass" ? "/upgrade/fundador" : "/upgrade";

  if (!userId) {
    const signup = new URL("/signup", request.url);
    signup.searchParams.set("redirect_url", destino);
    return NextResponse.redirect(signup);
  }

  if (!(await userHasPaidAccess(userId))) {
    return NextResponse.redirect(new URL(destino, request.url));
  }

  return NextResponse.redirect(new URL("/dashboard", request.url));
}
