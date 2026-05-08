import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js 16 renombra `middleware` a `proxy`.
 * Acá vive el refresh de sesión de Supabase para Server Components.
 *
 * TODO: implementar refresh real cuando lleguen las keys de Supabase.
 *   import { createServerClient } from "@supabase/ssr";
 *   const supabase = createServerClient(...);
 *   await supabase.auth.getUser();
 */
export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  // Placeholder — devuelve la respuesta sin tocar.
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
