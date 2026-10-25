import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Alias del botón "Comenzar"/"Unirme" de la landing. Todo el embudo funnelea por
 * /comprar, que resuelve anónimo→/signup, pagador→/dashboard, no-pagador→Mercado
 * Pago. (Se ignora cualquier ?producto: hoy el único checkout es el lifetime-pass.)
 */
export async function GET(request: Request) {
  // Conserva el query (utm_*, fbclid): la atribución la guarda el proxy, pero
  // si el salto lo tirara, el próximo paso no lo vería.
  const destino = new URL("/comprar", request.url);
  destino.search = new URL(request.url).search;
  return NextResponse.redirect(destino);
}
