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
 */

export const metadata: Metadata = {
  title: "Tu plan — Vendí",
  robots: { index: false, follow: false },
};

/** S/39 cuando es entero, S/119.90 cuando tiene centavos. */
function formatSoles(amount: number): string {
  return Number.isInteger(amount) ? `S/${amount}` : `S/${amount.toFixed(2)}`;
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

  const packNegocio = getProduct("pack-negocio");

  return (
    <AppBackground>
      <PlanClient
        lifetime={{
          priceLabel: formatSoles(lifetime.priceSoles),
          usdLabel: `≈ US$${lifetime.priceUsdDisplay} · pago único`,
          credits: lifetime.credits,
          analysisCredits: lifetime.analysisCredits ?? 0,
        }}
        packNegocio={
          packNegocio
            ? {
                id: packNegocio.id,
                name: packNegocio.name,
                credits: packNegocio.credits,
                priceLabel: formatSoles(packNegocio.priceSoles),
                perPhotoLabel: `S/${(packNegocio.priceSoles / packNegocio.credits).toFixed(2)}`,
              }
            : null
        }
      />
    </AppBackground>
  );
}
