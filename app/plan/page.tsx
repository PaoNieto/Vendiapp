import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { userHasPaidAccess } from "@/lib/auth/paid-access";
import { getProduct } from "@/lib/billing/catalog";
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
 * PRECIO: sale del catalogo server-side (`lib/billing/catalog.ts`, que es
 * `server-only`) y baja al cliente ya formateado. NUNCA hardcodeado, y NUNCA
 * viaja desde el cliente hacia el checkout: al POST /api/checkout solo se le
 * manda `productId`.
 *
 * 🟢 UNA SOLA MONEDA (2026-09-04, migracion Mercado Pago -> Whop).
 * Antes habia DOS: el ancla `US$10` grande y el `S/ 39` que MP cobraba de
 * verdad. Whop cobra en USD (con adaptive pricing: el comprador ve su moneda
 * local), asi que el precio mostrado y el cobrado son el MISMO numero y el
 * bloque de dos monedas ya no tiene razon de existir.
 * ⚠️ PENDIENTE FASE 4 (Frontero/Davinci): `chargeLabel` y `perPhotoLabel`
 * siguen existiendo como props de PlanClient solo para no romper su contrato en
 * este commit; el copy que los rodea todavia dice "Mercado Pago" en
 * `plan-client.tsx`. Colapsar el bloque de cobro y borrar esas props es trabajo
 * de la Fase 4, no de este cambio de riel.
 */

export const metadata: Metadata = {
  title: "Tu plan — Vendí",
  robots: { index: false, follow: false },
};

/**
 * "US$10" cuando es entero, "US$9.50" cuando tiene centavos.
 *
 * Reemplaza al viejo `formatSoles`: el riel es Whop y cobra en dolares.
 */
function formatUsd(amount: number): string {
  return Number.isInteger(amount) ? `US$${amount}` : `US$${amount.toFixed(2)}`;
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
    // camino a pagar. Con ?direct=1 el handler crea el checkout de Whop del
    // Pase Fundador y salta derecho a pagar.
    redirect("/comprar?direct=1");
  }

  return (
    <AppBackground>
      <PlanClient
        lifetime={{
          // El id viaja al cliente para que `startCheckout` siga siendo generica
          // (recibe el productId), en vez de hardcodear el string en el onClick.
          id: lifetime.id,
          // El numero GRANDE. Sale de `priceUsd` del catalogo — que ahora es el
          // precio REAL, no un ancla de vitrina.
          usdBig: formatUsd(lifetime.priceUsd),
          // Lo que se cobra. Con Whop es el MISMO numero que el grande (una sola
          // moneda), asi que este label quedo redundante -> lo colapsa la Fase 4.
          chargeLabel: formatUsd(lifetime.priceUsd),
          // Aritmetica sobre el precio REAL del catalogo: US$10 / 60 = US$0.17.
          // NUNCA hardcodeado — si cambia el precio o los creditos, cambia solo.
          // ⚠️ 0.17 × 60 = US$10.20, o sea que NO cierra exacto contra el precio
          // mostrado (es un redondeo hacia arriba de 0.1666...). La Fase 4 decide
          // si se muestra "aprox." o si se cambia la metrica.
          perPhotoLabel: `US$${(Math.ceil((lifetime.priceUsd / lifetime.credits) * 100) / 100).toFixed(2)}`,
          credits: lifetime.credits,
          analysisCredits: lifetime.analysisCredits ?? 0,
        }}
      />
    </AppBackground>
  );
}
