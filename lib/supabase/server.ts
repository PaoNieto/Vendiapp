import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";

/**
 * Cliente Supabase server-side, autenticado con Clerk.
 *
 * Integración NATIVA third-party auth (NO JWT template, que está deprecado
 * desde abr-2025): le pasamos a Supabase el session token de Clerk vía la
 * opción `accessToken`. Supabase lo usa para resolver RLS, que pasa de
 * `auth.uid()` (uuid) a `auth.jwt()->>'sub'` (id de Clerk, string `user_xxx`).
 *
 * `accessToken` es una función async; Supabase la llama en cada request, así
 * que siempre manda el token fresco de la sesión activa de Clerk. Si no hay
 * sesión, `getToken()` devuelve null y la query corre como anónima (RLS la
 * filtra).
 *
 * Las cookies de Supabase ya no llevan la sesión (Clerk maneja la auth), pero
 * conservamos el adaptador de cookies de @supabase/ssr para no romper la firma
 * ni el comportamiento del cliente en el contexto de App Router.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Token de Clerk para RLS. Supabase llama esta fn en cada request.
      async accessToken() {
        return (await auth()).getToken();
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component context — handled by middleware/proxy
          }
        },
      },
    },
  );
}
