import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Next.js 16 renombra `middleware` a `proxy`.
 * Acá vive el refresh de sesión de Supabase + guards de ruta.
 *
 * Reglas:
 *  - Rutas públicas: `/`, `/login`, `/signup`, `/privacidad`, `/terminos`,
 *    `/onboarding`. Las pueden visitar tanto usuarios anónimos como
 *    logueados (aunque algunas redirijan internamente).
 *  - Cualquier otra ruta (todo (app)/*) requiere sesión. Sin sesión →
 *    redirect a `/login?from=<ruta-original>` para volver post-login.
 *  - Usuarios logueados que vuelvan a `/login` o `/signup` → directo a
 *    `/dashboard` (no tiene sentido mostrarles el form de auth).
 *
 * El refresh de cookies se hace siempre, incluso en rutas públicas:
 * Supabase rota tokens automáticamente y necesitamos que la response
 * lleve los Set-Cookie actualizados.
 */

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/signup",
  "/privacidad",
  "/terminos",
  "/onboarding",
];

const AUTH_REDIRECT_PATHS = ["/login", "/signup"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() valida el JWT contra Supabase. NUNCA usar getSession()
  // acá: solo lee la cookie sin verificar firma, y un atacante podría
  // forjar cookies.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  if (!user && !isPublicPath(pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && AUTH_REDIRECT_PATHS.includes(pathname)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  // Excluimos assets estáticos y /api (las routes de API hacen su
  // propia validación de auth con createClient() de server.ts).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
