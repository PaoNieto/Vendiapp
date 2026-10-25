import { NextResponse, type NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import {
  ATTRIBUTION_COOKIE,
  ATTRIBUTION_MAX_AGE,
  FBC_COOKIE,
  attributionFromSearch,
  fbcFromFbclid,
} from "@/lib/attribution";

/**
 * Next.js 16 renombra `middleware` a `proxy`. Clerk es compatible: el único
 * cambio es el nombre del archivo. `clerkMiddleware()` devuelve un handler que
 * exportamos como default.
 *
 * Auth = Clerk (login + verificación). Supabase queda como DB con RLS vivo via
 * la integración nativa third-party auth (el token de Clerk se inyecta en el
 * cliente Supabase; ver lib/supabase/{client,server}.ts).
 *
 * Este proxy maneja SOLO sesión: quién está logueado y qué puede visitar sin
 * cuenta. El PAYWALL (modelo PAGA-PRIMERO) ya NO vive acá: se movió a
 * `app/(app)/layout.tsx`, que gatea TODA la sección autenticada con
 * `userHasPaidAccess(userId)` y manda al que no pagó a `/comprar` (embudo directo al
 * Checkout de Mercado Pago). El gate viejo del proxy mandaba al no-pagador a la
 * landing (vendilatam.com): eso contradecía la regla "el que no paga va a pagar,
 * no a la landing" y además cortocircuitaba el gate del layout, así que se quitó.
 *
 * Reglas de ruta:
 *  - PÚBLICAS: `/`, `/login`, `/signup`, `/privacidad`, `/terminos`,
 *    `/onboarding`, `/recuperar`, `/comenzar`, `/comprar`, webhooks y cron (y
 *    subrutas).
 *    Visitables por anónimos y logueados.
 *  - Cualquier otra ruta (todo (app)/* y `/pago/*`) requiere sesión. Sin sesión →
 *    redirect a `/login?redirect_url=<ruta+query original>`: es el param que el
 *    <SignIn/> de Clerk honra para volver al destino post-login.
 *  - Logueado entrando a `/login` o `/signup` → redirect a `/dashboard`.
 *
 * OJO bug Clerk #8302: `auth.protect()` en el proxy de Next 16 redirige a la
 * URL actual en vez del sign-in. Por eso NO usamos `auth.protect()`: leemos el
 * userId con `auth()` y hacemos los redirects a mano con NextResponse.
 */

const isPublicRoute = createRouteMatcher([
  "/",
  "/login",
  "/login/(.*)",
  "/signup",
  "/signup/(.*)",
  "/privacidad",
  "/privacidad/(.*)",
  "/terminos",
  "/terminos/(.*)",
  "/onboarding",
  "/onboarding/(.*)",
  "/recuperar",
  "/recuperar/(.*)",
  // Destino del boton "Comenzar" de la landing: sin sesion va al pago, no al login.
  "/comenzar",
  // Destino universal del embudo paga-primero. Su handler decide el siguiente
  // paso (anonimo→/signup, pagador→/dashboard, no-pagador→Mercado Pago), asi que
  // debe correr para anonimos y logueados-sin-pagar sin que el proxy lo intercepte.
  "/comprar",
  // Webhooks de sistemas externos (Mercado Pago, Shopify): los invoca un server
  // externo SIN sesion Clerk. Cada ruta valida su PROPIA firma HMAC, asi que
  // exponerlas es seguro. Sin esto, el proxy las redirige a /login (307) y la
  // notificacion de pago nunca llega al handler -> los creditos NO se acreditan.
  "/api/webhooks/(.*)",
  // Vercel Cron (avisos diarios): lo invoca Vercel SIN sesion Clerk. Cada ruta
  // valida su PROPIO `Authorization: Bearer CRON_SECRET` (503 si falta el
  // secret, timingSafeEqual). Sin esto el cron recibe un 307 a /login y no corre.
  "/api/cron/(.*)",
  // `/.well-known/*`: archivos de verificacion de dominio que los servidores de
  // terceros leen SIN sesion. Hoy el que importa es
  // `apple-developer-merchantid-domain-association`, el que habilita Apple Pay y
  // Google Pay en el checkout EMBEBIDO (/pagar/[productId]); Whop exige que sea
  // accesible por HTTPS y sin autenticacion.
  //
  // 🔴 SIN ESTA LINEA LA VERIFICACION FALLA EN SILENCIO. El `matcher` de abajo
  // solo excluye assets con extension (svg/png/jpg/...), y este archivo NO tiene
  // extension -> el proxy corre, no lo encuentra en las rutas publicas y le
  // devuelve un 307 a /login. El verificador de Apple recibe el HTML del login
  // en vez del archivo, y las wallets nunca se activan sin decir por que.
  "/.well-known/(.*)",
]);

/**
 * Guarda de qué anuncio vino la persona (ver lib/attribution.ts). Corre en
 * TODAS las respuestas, redirects incluidos: el primer salto de un anuncio es
 * /comenzar → /comprar → /signup, y el query se pierde en el camino.
 * First-touch: no pisa una cookie que ya existe.
 */
function withAttribution(request: NextRequest, response: NextResponse) {
  const attribution = attributionFromSearch(
    request.nextUrl.searchParams,
    request.nextUrl.pathname,
  );
  if (!attribution) return response;

  const cookieOptions = {
    path: "/",
    maxAge: ATTRIBUTION_MAX_AGE,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
  if (!request.cookies.has(ATTRIBUTION_COOKIE)) {
    response.cookies.set(
      ATTRIBUTION_COOKIE,
      JSON.stringify(attribution),
      { ...cookieOptions, httpOnly: true },
    );
  }
  // `_fbc` lo lee también el Pixel de Meta en el browser: sin httpOnly.
  if (attribution.fbclid && !request.cookies.has(FBC_COOKIE)) {
    response.cookies.set(FBC_COOKIE, fbcFromFbclid(attribution.fbclid), cookieOptions);
  }
  return response;
}

// Form de auth: si ya hay sesión, no tiene sentido mostrarlo.
const isAuthFormRoute = createRouteMatcher(["/login", "/signup"]);

export default clerkMiddleware(async (auth, request) => {
  const { userId } = await auth();
  const { pathname } = request.nextUrl;

  // Logueado en /login o /signup → al dashboard.
  if (userId && isAuthFormRoute(request)) {
    return withAttribution(
      request,
      NextResponse.redirect(new URL("/dashboard", request.url)),
    );
  }

  // Sin sesión en ruta protegida → al login, conservando el destino COMPLETO
  // (pathname + querystring). El param tiene que llamarse `redirect_url`: es el
  // que honra el <SignIn/> de Clerk post-login. Antes se mandaba `from=`, que
  // Clerk ignora → todo deep-link terminaba en /dashboard (fallback).
  if (!userId && !isPublicRoute(request)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set(
      "redirect_url",
      pathname + request.nextUrl.search,
    );
    return withAttribution(request, NextResponse.redirect(loginUrl));
  }

  return withAttribution(request, NextResponse.next());
});

export const config = {
  matcher: [
    // Corre en todas las rutas de app salvo assets estáticos / internos de Next.
    // (Las API routes hacen su propia validación con auth() en server.)
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
    // Siempre corre en las rutas de API y en el handshake interno de Clerk.
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
