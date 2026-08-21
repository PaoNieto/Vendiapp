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
 * Post-signup el nuevo usuario va a /onboarding (3 pasos pre-pago) y de ahí al
 * paywall /plan, que es quien dispara el checkout de Mercado Pago.
 *
 * ⚠️ `forceRedirectUrl` (NO `fallbackRedirectUrl`) a propósito. La precedencia de
 * Clerk es: forceRedirectUrl > query param `redirect_url` > fallbackRedirectUrl >
 * env var. `/comprar` manda al anónimo a `/signup?redirect_url=/comprar`, así que
 * SOLO `force` le gana a ese query param; con `fallback` el recién registrado
 * seguiría yendo derecho a Mercado Pago y el onboarding no se vería nunca.
 *
 * Degradación elegante: si por algún camino el force no aplicara, la cadena cae
 * a `redirect_url=/comprar` → /comprar → Mercado Pago, que es exactamente el
 * comportamiento de hoy. Falla hacia lo que ya funciona.
 */
export default function SignupPage() {
  return (
    <SignUp
      path="/signup"
      signInUrl="/login"
      forceRedirectUrl="/onboarding"
    />
  );
}
