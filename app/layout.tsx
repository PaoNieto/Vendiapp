import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@/components/ui/sonner";
import { clerkAppearance, clerkLocalizationES } from "@/lib/auth/clerk-appearance";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// Instrument Serif — display italic para titulares editoriales + citas inline.
// Sumado a partir del handoff Cuaderno, manteniendo Inter como UI sans-serif.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Vendí — Tu producto, en cualquier escenario",
  description:
    "Generá imágenes profesionales de tu producto sin sesión de fotos. Subí fotos simples + referencias visuales y obtené variaciones listas para Meta Ads, Shopify, Temu y catálogos.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  // Chrome del navegador en el forest casi-negro del modo oscuro — que es
  // ahora el default de marca (Natural OS premium).
  themeColor: "#080a09",
};

/**
 * Script anti-flash: corre síncronamente antes del primer render del body,
 * lee la preferencia guardada y setea el `data-theme` en `<html>`. El default
 * es oscuro (Natural OS premium); el toggle guarda la preferencia del usuario
 * en localStorage. Evita el flash blanco → oscuro en navegación inicial. Tiene
 * que ir como string para que Next no lo difiera.
 */
const themeInitScript = `(function () {
  try {
    var stored = localStorage.getItem('vendi-theme');
    var theme = stored === 'light' || stored === 'dark' ? stored : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // <ClerkProvider> envuelve TODO el árbol (incluido <html>): es el placement
  // recomendado por Clerk en App Router. Expone window.Clerk —de donde
  // lib/supabase/client.ts saca el token para RLS— y habilita los hooks
  // (useUser/useAuth/useClerk) y los componentes <SignIn/>/<SignUp/>.
  //
  // `appearance` + `localization` lo themean con Cuaderno v2 en español, así
  // el login se ve premium y no el default de Clerk. AppProviders/UserProvider
  // quedan anidados adentro (en (app)/layout.tsx) — leen el Clerk de acá.
  return (
    <ClerkProvider appearance={clerkAppearance} localization={clerkLocalizationES}>
      <html
        lang="es"
        className={`${inter.variable} ${instrumentSerif.variable} h-full`}
        suppressHydrationWarning
      >
        <head>
          <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        </head>
        <body className="min-h-dvh">
          {children}
          <Toaster richColors position="top-center" />
        </body>
      </html>
    </ClerkProvider>
  );
}
