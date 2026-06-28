import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { userHasPaidAccess } from "@/lib/auth/paid-access";

/**
 * Next.js 16 renombra `middleware` a `proxy`. Clerk es compatible: el único
 * cambio es el nombre del archivo. `clerkMiddleware()` devuelve un handler que
 * exportamos como default.
 *
 * Auth = Clerk (login + verificación). Supabase queda como DB con RLS vivo via
 * la integración nativa third-party auth (el token de Clerk se inyecta en el
 * cliente Supabase; ver lib/supabase/{client,server}.ts).
 *
 * Reglas de ruta:
 *  - PÚBLICAS: `/`, `/login`, `/signup`, `/privacidad`, `/terminos`,
 *    `/onboarding`, `/recuperar`, `/comenzar`, webhooks (y subrutas).
 *    Visitables por anónimos y logueados.
 *  - Cualquier otra ruta (todo (app)/*) requiere sesión. Sin sesión →
 *    redirect a `/login?from=<ruta-original>` para volver post-login.
 *  - Logueado entrando a `/login` o `/signup` → redirect a `/dashboard`.
 *  - PAYWALL (modelo PAGA-PRIMERO): un usuario logueado que NUNCA pagó es
 *    mandado a la LANDING (pitch + precios). La única página de la app que sí
 *    puede ver es la vitrina de packs (`/upgrade`), donde paga pegado a su
 *    cuenta y se desbloquea el resto. Ver más abajo.
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
  // Webhooks de sistemas externos (Mercado Pago, Shopify): los invoca un server
  // externo SIN sesion Clerk. Cada ruta valida su PROPIA firma HMAC, asi que
  // exponerlas es seguro. Sin esto, el proxy las redirige a /login (307) y la
  // notificacion de pago nunca llega al handler -> los creditos NO se acreditan.
  "/api/webhooks/(.*)",
]);

// Form de auth: si ya hay sesión, no tiene sentido mostrarlo.
const isAuthFormRoute = createRouteMatcher(["/login", "/signup"]);

// Única página de la app que un usuario logueado-pero-sin-pagar SÍ puede ver:
// la vitrina de packs, que es el checkout pegado a su cuenta (ahí paga y la app
// se desbloquea sola). Exenta del paywall para no hacer loop de redirects.
const isPaywallExempt = createRouteMatcher(["/upgrade", "/upgrade/(.*)"]);

// A dónde mandamos al usuario logueado que todavía NO pagó: a la LANDING (el
// pitch + precios), no a la grilla pelada de la app. La landing vende; su botón
// "Comenzar" lo trae de vuelta a /comenzar y de ahí a /upgrade a pagar pegado a
// su cuenta. Configurable por env por si cambia el dominio de la landing.
const LANDING_URL =
  process.env.PAYWALL_LANDING_URL ?? "https://www.vendilatam.com";

export default clerkMiddleware(async (auth, request) => {
  const { userId } = await auth();
  const { pathname } = request.nextUrl;

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

  // PAYWALL paga-primero. El usuario está logueado y entra a una página de la
  // app que NO es pública ni la vitrina de packs. Si nunca pagó, lo mandamos a
  // la LANDING (a que vea el pitch y compre). Corre en cada navegación de página
  // (incluidos los requests RSC de la navegación interna), así que es un candado
  // duro: los links del menú rebotan al unpaid de vuelta afuera.
  //
  // Las API routes quedan afuera: validan créditos por su cuenta y un fetch a
  // Supabase por request de API sería caro e innecesario.
  if (
    userId &&
    !isPublicRoute(request) &&
    !isPaywallExempt(request) &&
    !pathname.startsWith("/api")
  ) {
    const hasAccess = await userHasPaidAccess(userId);
    if (!hasAccess) {
      return NextResponse.redirect(LANDING_URL);
    }
  }

  return NextResponse.next();
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
