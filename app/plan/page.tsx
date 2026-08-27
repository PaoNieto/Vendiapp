import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { userHasPaidAccess } from "@/lib/auth/paid-access";
import { getProduct } from "@/lib/mercadopago/catalog";
import { AppBackground } from "@/components/dashboard/app-background";
import { PlanClient } from "./plan-client";

/**
 * /plan — el PAYWALL. Ultimo paso del embudo: signup -> /onboarding -> /plan.
 *
 * Vive FUERA del route group (app) a proposito. Si viviera adentro, el gate de
 * `app/(app)/layout.tsx` rebotaria al no-pagador a /comprar (= Mercado Pago
 * directo) y el paywall no se veria nunca. Tampoco hace falta tocar `proxy.ts`:
 * /plan NO esta en `isPublicRoute`, asi que el proxy ya le exige sesion. Eso es
 * exactamente lo que queremos.
 *
 * Se hizo pantalla NUEVA en vez de rebrandear /fundador: /fundador esta huerfano
 * (nadie lo linkea) -> riesgo cero en dejarlo quieto, mientras que reescribir sus
 * 417 lineas de CSS hardcodeado en light seria tocar codigo vivo del cobro.
 *
 * GUARDAS:
 *  - sin sesion           -> /signup?redirect_url=/plan.
 *  - logueado SIN pagar   -> VE LA PANTALLA. Es su razon de existir.
 *  - logueado que ya pago -> /dashboard (no se le re-cobra).
 *
 * PRECIO: sale del catalogo server-side (`lib/mercadopago/catalog.ts`, que es
 * `server-only`) y baja al cliente ya formateado. NUNCA hardcodeado, y NUNCA
 * viaja desde el cliente hacia el checkout: al POST /api/checkout solo se le
 * manda `productId`.
 *
 * 🔴 DOS MONEDAS EN PANTALLA, UNA SOLA QUE SE COBRA.
 * El numero GRANDE es `US$10` (`priceUsdDisplay`, que ya vivia en el catalogo):
 * es el ancla que el mercado entiende. Pero Mercado Pago cobra SOLES, asi que el
 * monto real (`S/ 39`) aparece TRES veces y ninguna en letra chica —
 * 16px bold debajo del precio, 15px bold en el texto del boton, y 12px en el
 * pie. Nadie puede llegar al checkout sorprendido por la moneda.
 * ⚠️ El monto cobrado NO cambio: `lifetime-pass` sigue siendo S/39 en el
 * catalogo. Esto es SOLO presentacion.
 */

export const metadata: Metadata = {
  title: "Tu plan — Vendí",
  robots: { index: false, follow: false },
};

/**
 * "S/ 39" cuando es entero, "S/ 119.90" cuando tiene centavos.
 *
 * El ESPACIO no es cosmetico: este label ya no es un numero grande al lado de su
 * simbolo, es una frase corrida ("Se cobra S/ 39 en Mercado Pago") y el texto de
 * un boton. Pegado, "S/39" se lee como una sola palabra rara; con espacio se lee
 * como monto.
 */
function formatSoles(amount: number): string {
  return Number.isInteger(amount) ? `S/ ${amount}` : `S/ ${amount.toFixed(2)}`;
}

export default async function PlanPage() {
  const { userId } = await auth();
  if (!userId) redirect("/signup?redirect_url=/plan");
  if (await userHasPaidAccess(userId)) redirect("/dashboard");

  const lifetime = getProduct("lifetime-pass");
  if (!lifetime) {
    // No deberia pasar (el catalogo es un objeto literal), pero si el producto
    // no resolviera no podriamos mostrar un precio.
    //
    // ROMPE-LOOP (critico): tiene que ser `?direct=1`. `/comprar` ahora manda al
    // no-pagador ACA, asi que un `redirect("/comprar")` pelado seria
    // /comprar -> /plan -> /comprar -> ... infinito, y el usuario quedaria SIN
    // camino a pagar. Con ?direct=1 el handler crea la Preference y salta a
    // Mercado Pago: degradamos exactamente al comportamiento historico.
    redirect("/comprar?direct=1");
  }

  return (
    <AppBackground>
      <PlanClient
        lifetime={{
          // El id viaja al cliente para que `startCheckout` siga siendo generica
          // (recibe el productId), en vez de hardcodear el string en el onClick.
          id: lifetime.id,
          // El numero GRANDE. Sale de `priceUsdDisplay` del catalogo, que ya
          // existia — no se invento ni se hardcodeo un dolar nuevo.
          usdBig: `US$${lifetime.priceUsdDisplay}`,
          // Lo que Mercado Pago cobra DE VERDAD. Se muestra 3 veces y ninguna en
          // letra chica (ver el bloque de arriba).
          chargeLabel: formatSoles(lifetime.priceSoles),
          // Aritmetica sobre el precio REAL del catalogo: S/39 / 60 = S/0.65.
          // NUNCA hardcodeado — si cambia el precio o los creditos, cambia solo.
          // ⚠️ Va en SOLES a proposito: US$10 / 60 = US$0.17, y 0.17 × 60 =
          // US$10.20, que NO cierra con el precio mostrado. El soles cierra
          // exacto porque es el monto que se cobra.
          perPhotoLabel: `S/${(lifetime.priceSoles / lifetime.credits).toFixed(2)}`,
          credits: lifetime.credits,
          analysisCredits: lifetime.analysisCredits ?? 0,
        }}
      />
    </AppBackground>
  );
}
