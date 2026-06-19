import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Destino del boton "Comenzar" de la landing. La landing es estatica y vive en
 * otro dominio, asi que NO puede saber si el visitante tiene sesion. Por eso el
 * boton apunta aca (al dominio de la app, donde vive la cookie de Clerk) y este
 * route decide:
 *  - con sesion (usuario registrado y logueado) -> /dashboard
 *  - sin sesion -> link de pago (Mercado Pago)
 *
 * El link de pago es configurable por env `MP_PAYMENT_LINK`. El fallback es el
 * link actual de la landing (preference de PRUEBA). Para produccion: setear
 * MP_PAYMENT_LINK en Vercel con el init_point productivo.
 */
const PAYMENT_LINK =
  process.env.MP_PAYMENT_LINK ??
  "https://www.mercadopago.com.pe/checkout/v1/redirect?pref_id=3480421938-38862917-86bf-4d22-85a9-d50c61ecacf9";

export async function GET(request: Request) {
  const { userId } = await auth();
  if (userId) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  return NextResponse.redirect(PAYMENT_LINK);
}
