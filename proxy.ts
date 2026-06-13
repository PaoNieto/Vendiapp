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
 * Reglas de ruta (igual semántica que la versión Supabase):
 *  - PÚBLICAS: `/`, `/login`, `/signup`, `/privacidad`, `/terminos`,
 *    `/onboarding`, `/recuperar` (y subrutas). Visitables por anónimos y
 *    logueados.
 *  - Cualquier otra ruta (todo (app)/*) requiere sesión. Sin sesión →
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
]);

// Form de auth: si ya hay sesión, no tiene sentido mostrarlo.
const isAuthFormRoute = createRouteMatcher(["/login", "/signup"]);

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
