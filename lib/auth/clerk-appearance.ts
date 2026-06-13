import type { ComponentProps } from "react";
import { ClerkProvider } from "@clerk/nextjs";

/**
 * Theming de Clerk con la identidad Cuaderno v2 de Vendí.
 *
 * Los componentes prebuilt de Clerk (<SignIn/>, <SignUp/>) se renderizan con
 * estos tokens para que el login se vea PREMIUM y coherente con la app, no el
 * look default de Clerk. Los hex salen 1:1 de los tokens --vd-* de globals.css
 * (paleta forest/cream/butter/clay) — si Davinci los cambia ahí, replicar acá.
 *
 * Inferimos los tipos directo del componente (ComponentProps) en vez de
 * importarlos de un subpath interno de Clerk: queda estable entre versiones y
 * sin `any`.
 */

type ClerkProviderProps = ComponentProps<typeof ClerkProvider>;
type Appearance = NonNullable<ClerkProviderProps["appearance"]>;
type Localization = NonNullable<ClerkProviderProps["localization"]>;

// Hex de Cuaderno v2 (globals.css :root). Centralizados para legibilidad.
const FOREST = "#0f1f16"; // --vd-pill-bg / primary — botón y acentos
const CREAM = "#f0f4e7"; // --vd-pill-fg — texto sobre forest
const CARD_CREAM = "#faf6e8"; // --vd-card-cream — fondo de la card
const INK = "#0d1b12"; // --vd-ink — texto principal
const MUTE = "#4c5a40"; // --vd-mute — texto secundario
const CLAY = "#a85a3f"; // --vd-clay — errores
const SAGE_STRONG = "#3d5a36"; // --vd-sage-strong — éxito / links

export const clerkAppearance: Appearance = {
  variables: {
    colorPrimary: FOREST,
    colorForeground: INK,
    colorMutedForeground: MUTE,
    colorBackground: CARD_CREAM,
    colorInput: "#ffffff",
    colorInputForeground: INK,
    colorDanger: CLAY,
    colorSuccess: SAGE_STRONG,
    colorPrimaryForeground: CREAM,
    // Tipografía: UI en Inter (var de next/font), botones idem. El display
    // serif queda para los titulares de la app, no para los del form Clerk.
    fontFamily: "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
    fontFamilyButtons: "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
    borderRadius: "0.75rem", // = --radius (12px), radius base de Cuaderno
    spacing: "1rem",
  },
  elements: {
    // La card de Clerk vive DENTRO de nuestra AuthLayout. Le sacamos su sombra
    // y borde propios para que se apoye en el shell glass de la app sin doble
    // marco. Fondo cream cálido en vez del blanco default.
    rootBox: "w-full",
    cardBox: "w-full shadow-none",
    card: "bg-transparent shadow-none border-0 px-0 py-0",
    headerTitle: "font-display italic text-3xl tracking-tight",
    headerSubtitle: "text-sm",
    // Botón primario = pill forest de Cuaderno, alto cómodo (touch ≥44px).
    formButtonPrimary:
      "h-12 text-base font-medium rounded-xl normal-case shadow-sm",
    formFieldInput: "h-11 rounded-xl",
    formFieldLabel: "font-medium",
    footerActionLink: "font-medium",
    // Botón social (Google, si se habilita): mismo radius, alto cómodo.
    socialButtonsBlockButton: "h-11 rounded-xl",
    socialButtonsIconButton: "h-11 w-11 rounded-xl",
    dividerLine: "bg-border",
    dividerText: "text-muted-foreground",
    // Quitamos el branding "Secured by Clerk" del footer para look premium.
    footer: "hidden",
  },
};

/**
 * Localización en español rioplatense de los strings de Clerk que el usuario
 * ve en el flujo. Clerk trae claves en inglés por default; sobreescribimos
 * sólo las que aparecen en sign-in / sign-up / reset para que TODO el flujo
 * esté en castellano. Lo que no cubrimos cae al string default de Clerk.
 *
 * (No usamos @clerk/localizations/esES para no sumar una dependencia fuera de
 * scope; este subset cubre las pantallas reales de Vendí.)
 */
export const clerkLocalizationES: Localization = {
  locale: "es-ES",
  socialButtonsBlockButton: "Continuar con {{provider|titleize}}",
  dividerText: "o",
  formFieldLabel__emailAddress: "Email",
  formFieldLabel__password: "Contraseña",
  formFieldLabel__confirmPassword: "Repetí la contraseña",
  formFieldLabel__firstName: "Nombre",
  formFieldLabel__lastName: "Apellido",
  formFieldInputPlaceholder__emailAddress: "vos@email.com",
  formFieldInputPlaceholder__password: "Tu contraseña",
  formFieldAction__forgotPassword: "Olvidé mi contraseña",
  formButtonPrimary: "Continuar",
  signIn: {
    start: {
      title: "Bienvenido",
      subtitle: "Iniciá sesión en Vendí",
      actionText: "¿Sos nuevo?",
      actionLink: "Creá tu cuenta",
    },
    password: {
      title: "Ingresá tu contraseña",
      subtitle: "Para entrar a tu cuenta de Vendí",
    },
    forgotPasswordAlternativeMethods: {
      label__alternativeMethods: "O entrá de otra forma",
      blockButton__resetPassword: "Restablecer mi contraseña",
    },
    forgotPassword: {
      title: "Restablecé tu contraseña",
      subtitle_email: "Primero ingresá el código que mandamos a tu email",
      formTitle: "Código de restablecimiento",
      resendButton: "¿No te llegó? Reenviar",
    },
    resetPassword: {
      title: "Nueva contraseña",
      formButtonPrimary: "Guardar contraseña",
    },
  },
  signUp: {
    start: {
      title: "Empezá gratis",
      subtitle: "Creá tu cuenta de Vendí",
      actionText: "¿Ya tenés cuenta?",
      actionLink: "Iniciá sesión",
    },
    emailCode: {
      title: "Confirmá tu email",
      subtitle: "Ingresá el código que te mandamos",
      formTitle: "Código de verificación",
      resendButton: "¿No te llegó? Reenviar",
    },
  },
};
