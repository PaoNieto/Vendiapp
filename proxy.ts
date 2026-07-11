import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

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
 * `hasAppAccess(userId)` y manda al que no pagó a `/comprar` (embudo directo al
 * Checkout de Mercado Pago). El gate viejo del proxy mandaba al no-pagador a la
 * landing (vendilatam.com): eso contradecía la regla "el que no paga va a pagar,
 * no a la landing" y además cortocircuitaba el gate del layout, así que se quitó.
 *
 * Reglas de ruta:
 *  - RAÍZ `/`: anónimo → rewrite a la LANDING pública (public/landing.html; la
 *    URL queda en `/`, estilo Arcads); logueado → app/page.tsx lo pasa a /dashboard.
 *  - PÚBLICAS: `/`, `/login`, `/signup`, `/privacidad`, `/terminos`,
 *    `/onboarding`, `/recuperar`, `/comenzar`, `/comprar`, webhooks (y subrutas).
 *    Visitables por anónimos y logueados.
 *  - Cualquier otra ruta (todo (app)/* y `/pago/*`) requiere sesión. Sin sesión →
 *    redirect a `/login?from=<ruta-original>` para volver post-login.
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
]);

// Form de auth: si ya hay sesión, no tiene sentido mostrarlo.
const isAuthFormRoute = createRouteMatcher(["/login", "/signup"]);

export default clerkMiddleware(async (auth, request) => {
  const { userId } = await auth();
  const { pathname } = request.nextUrl;

  // Anónimo en la RAÍZ → servir la LANDING pública (rewrite: la URL queda en `/`).
  // Sin esto, `/` cae en app/page.tsx, que manda al anónimo a /login (sin ver la
  // landing). Es un estático autocontenido en public/landing.html; sus CTAs van a
  // /comenzar (embudo paga-primero: registro → checkout de Mercado Pago → app).
  // Estilo Arcads: la vidriera es pública, el candado vive dentro de (app)/*.
  if (!userId && pathname === "/") {
    return NextResponse.rewrite(new URL("/landing.html", request.url));
  }

  // Logueado en /login o /signup → al dashboard.
  if (userId && isAuthFormRoute(request)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Sin sesión en ruta protegida → al login, conservando el destino.
  if (!userId && !isPublicRoute(request)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Corre en todas las rutas de app salvo assets estáticos / internos de Next.
    // (Las API routes hacen su propia validación con auth() en server.)
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|html)$).*)",
    // Siempre corre en las rutas de API y en el handshake interno de Clerk.
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
