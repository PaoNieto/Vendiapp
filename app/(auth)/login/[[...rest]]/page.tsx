import { SignIn } from "@clerk/nextjs";
import { isInAppBrowser, soloMailAppearance } from "@/lib/auth/in-app-browser";

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
 * Redirects post-login: si venimos con `?redirect_url=/ruta` (lo setea el proxy
 * al interceptar un deep-link sin sesión), Clerk lo honra y vuelve ahí. Sin ese
 * param, cae en el fallback `/dashboard` (prop fallbackRedirectUrl de abajo).
 *
 * Dentro de Instagram/Facebook se esconde "Continuar con Google" (Google
 * bloquea su login ahí), igual que en signup. Ver `in-app-browser.ts`.
 */
export default async function LoginPage() {
  const inApp = await isInAppBrowser();
  return (
    <SignIn
      path="/login"
      signUpUrl="/signup"
      fallbackRedirectUrl="/dashboard"
      appearance={inApp ? soloMailAppearance : undefined}
    />
  );
}
