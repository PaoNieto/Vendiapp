import { SignUp } from "@clerk/nextjs";

/**
 * Signup con el componente prebuilt <SignUp/> de Clerk. Clerk maneja todo el
 * flujo de registro + verificación de email (manda el código, valida, crea la
 * sesión) — eso es exactamente lo que Paolo quiere delegar a un especialista.
 *
 * Mismo gotcha que login: necesita ruta catch-all → vive en
 * `signup/[[...rest]]/page.tsx`. El proxy marca `/signup` y `/signup/(.*)` como
 * públicas, así la pantalla de verificación de email (subruta interna de Clerk)
 * es accesible sin sesión.
 *
 * Post-signup el nuevo usuario va a /onboarding (vía el env
 * NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL + el prop fallback de acá).
 */
export default function SignupPage() {
  return (
    <SignUp
      path="/signup"
      signInUrl="/login"
      fallbackRedirectUrl="/onboarding"
    />
  );
}
