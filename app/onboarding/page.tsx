import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { userHasPaidAccess } from "@/lib/auth/paid-access";
import { AppBackground } from "@/components/dashboard/app-background";
import { OnboardingClient } from "./onboarding-client";

/**
 * /onboarding — los 3 pasos PRE-PAGO, entre el signup y el paywall.
 *
 * Vive FUERA del route group (app) a propósito: adentro quedaría detrás del gate
 * de `app/(app)/layout.tsx` (que rebota al que no pagó a `/comprar`) y el
 * recién registrado —que por definición NO pagó— nunca la vería. Usa sólo el
 * root layout (con <ClerkProvider>), sin sidebar ni bottom-nav.
 *
 * GUARDAS (el matiz importa):
 *  - sin sesión            → /signup?redirect_url=/onboarding.
 *  - logueado SIN pagar    → VE LA PANTALLA. Es exactamente su razón de existir;
 *                            no se lo manda a /comprar acá — /comprar es la
 *                            salida (cuando toca el botón de pagar), no la entrada.
 *  - logueado que ya pagó  → /dashboard (no le sirve repetir esto).
 *
 * ⚠️ Este `auth()` server-side no es cosmético: `/onboarding` figura en
 * `isPublicRoute` de `proxy.ts` (archivo congelado, no se toca), así que sin
 * esta guarda la ruta responde 200 a cualquier anónimo. Acá se cierra.
 *
 * El destino final del wizard es el PAYWALL (`/plan`), NUNCA una ruta de (app):
 * el `router.push("/mi-negocio")` de la versión previa de este archivo era un
 * ping-pong infinito contra el gate.
 */

export const metadata: Metadata = {
  title: "Contanos de tu negocio — Vendí",
  robots: { index: false, follow: false },
};

export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) redirect("/signup?redirect_url=/onboarding");

  // MISMA señal fail-closed que usan el gate de (app), /comprar y /fundador.
  // No se inventa otra fuente de verdad de acceso.
  if (await userHasPaidAccess(userId)) redirect("/dashboard");

  return (
    <AppBackground>
      <OnboardingClient />
    </AppBackground>
  );
}
