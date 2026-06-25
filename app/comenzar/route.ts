import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Destino de los CTA de compra de la landing ("Comenzar", "Quiero mi Lifetime
 * Pass", etc.). La landing es estatica y vive en otro dominio, asi que NO puede
 * saber si el visitante tiene sesion. Por eso apunta aca (al dominio de la app,
 * donde vive la cookie de Clerk) y este route decide:
 *  - con sesion  -> /upgrade  (checkout real por-usuario)
 *  - sin sesion  -> /signup?redirect_url=/upgrade  (registro rapido y, al
 *                   terminar, cae en el checkout real)
 *
 * IMPORTANTE — por que NO hay link estatico de Mercado Pago:
 * un pref_id estatico NO lleva `external_reference` por usuario. Cobraria de
 * verdad pero el webhook NO sabria a quien acreditarle los creditos -> el
 * cliente paga y queda sin nada. El UNICO cobro valido es el per-usuario de
 * /api/checkout: crea la Preference con external_reference = id Clerk, cobra de
 * verdad y el webhook (/api/webhooks/mercadopago) acredita los creditos. Por eso
 * todo el cobro pasa primero por auth y termina en /upgrade.
 *
 * Se usa `redirect_url` (NO `from`): es el query param que el <SignUp> de Clerk
 * lee nativamente para el redirect post-registro (precede a fallbackRedirectUrl).
 */
export async function GET(request: Request) {
  const { userId } = await auth();
  const dest = userId
    ? "/upgrade"
    : `/signup?redirect_url=${encodeURIComponent("/upgrade")}`;
  return NextResponse.redirect(new URL(dest, request.url));
}
