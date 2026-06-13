import { SignIn } from "@clerk/nextjs";

/**
 * Login con el componente prebuilt <SignIn/> de Clerk (themeado vía el
 * `appearance` global del <ClerkProvider> en el root layout).
 *
 * GOTCHA Clerk + App Router: con routing por `path`, <SignIn/> monta subrutas
 * internas (verificación, factor-two, etc.) bajo /login/*. Por eso ESTE archivo
 * vive en `login/[[...rest]]/page.tsx` (ruta catch-all opcional). Sin el
 * catch-all, Clerk tira el error "the <SignIn/> component needs a catch-all
 * route". El proxy ya marca `/login` y `/login/(.*)` como públicas.
 *
 * El "forgot password" lo maneja el propio <SignIn/> (link interno), así que no
 * necesitamos una página /recuperar custom para el flujo principal — pero la
 * mantenemos como atajo con redirect.
 *
 * Redirects post-login: por el env NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL
 * (=/dashboard). Si venimos con ?from=/ruta (lo setea el proxy), Clerk respeta
 * el `redirect_url` que ya viene en la URL.
 */
export default function LoginPage() {
  return (
    <SignIn
      path="/login"
      signUpUrl="/signup"
      fallbackRedirectUrl="/dashboard"
    />
  );
}
