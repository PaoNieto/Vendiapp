import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { DM_Mono, Fraunces, Hanken_Grotesk } from "next/font/google";
import { userHasPaidAccess } from "@/lib/auth/paid-access";
import { LifetimePassButton, SignOutLink } from "./fundador-client";
import "./fundador.css";

/**
 * /fundador — PAYWALL STANDALONE del Lifetime Pass.
 *
 * Vive FUERA del route group (app), así que usa SOLO el root layout
 * (app/layout.tsx, con <ClerkProvider>) y NO hereda el shell con sidebar /
 * bottom-nav de (app). Es una página ENCERRADA: el usuario logueado que todavía
 * no pagó solo puede pagar el Lifetime Pass o cerrar sesión — sin menú, sin
 * links a otras pantallas (modelo paga-primero, estilo onboarding de Arcads).
 *
 * Flujo de acceso (paga-primero):
 *  - sin sesión          -> /signup?redirect_url=/fundador (defensivo: el proxy
 *                           ya manda a /login a los anónimos en rutas no públicas).
 *  - logueado SIN pagar  -> renderiza el paywall (exento del paywall en proxy.ts).
 *  - logueado que pagó   -> /dashboard (ya es cliente).
 *
 * Es el destino de /comenzar?producto=lifetime-pass. La tarjeta es un port 1:1
 * de la sección Lifetime Pass de landing.html (paleta verde+dorado, tipografías
 * Fraunces/Hanken/DM Mono), con sus estilos autocontenidos en fundador.css.
 */

// Tipografías de la LANDING (no las del app shell). next/font expone cada una
// como una CSS var en el wrapper; fundador.css las remapea a --font-display/sans/mono.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap",
});
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-hanken",
  display: "swap",
});
const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lifetime Pass — Vendí",
  robots: { index: false, follow: false },
};

export default async function FundadorPage() {
  const { userId } = await auth();
  if (!userId) redirect("/signup?redirect_url=/fundador");
  if (await userHasPaidAccess(userId)) redirect("/dashboard");

  return (
    <div
      className={`fundador-page ${fraunces.variable} ${hanken.variable} ${dmMono.variable}`}
    >
      <header className="fundador-topbar">
        <span className="fundador-brand">Vendí</span>
        <SignOutLink />
      </header>

      <main className="fundador-main">
        <div className="plans single">
          <div className="plan featured">
            <span className="plan-badge">
              🎟️ Oferta de lanzamiento · por tiempo limitado
            </span>

            <div className="plan-top">
              <h3>Lifetime Pass</h3>
              <p className="plan-sub">Acceso completo a Vendí, de por vida.</p>

              <div className="plan-price">
                <span className="amt-old">$27</span>
                <span className="amt">$10</span>
                <span className="per">USD · pago único</span>
                <span className="plan-save">Ahorrás $17</span>
              </div>

              <div className="plan-tags">
                <span className="plan-tag">⚡ Pago único</span>
                <span className="plan-tag">♾️ Acceso de por vida</span>
              </div>
            </div>

            <ul className="plan-feats">
              <li>Todos los estilos profesionales curados</li>
              <li>Sin marca de agua · alta resolución</li>
              <li>Formatos por canal: feed, story, ecommerce</li>
              <li>
                60 créditos de inicio incluidos{" "}
                <span className="byok">(generás tus imágenes con ellos)</span>
              </li>
              <li>
                10 análisis con IA incluidos{" "}
                <span className="byok">(bolsa aparte de tus créditos)</span>
              </li>
              <li>Mejoras y estilos nuevos, para siempre</li>
            </ul>

            <LifetimePassButton />

            <p className="plan-fine">
              Pago único · Sin mensualidades · Acceso de por vida
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
