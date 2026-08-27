import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Alias del botón "Comenzar"/"Unirme" de la landing. Todo el embudo funnelea por
 * /comprar, que resuelve anónimo→/signup, pagador→/dashboard, no-pagador→Mercado
 * Pago. (Se ignora cualquier ?producto: hoy el único checkout es el lifetime-pass.)
 */
export async function GET(request: Request) {
  return NextResponse.redirect(new URL("/comprar", request.url));
}
