import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";

/**
 * Cliente Supabase server-side, autenticado con Clerk.
 *
 * Integración NATIVA third-party auth (NO JWT template, deprecado desde
 * abr-2025): le pasamos a Supabase el session token de Clerk vía la opción
 * `accessToken`. Supabase resuelve la RLS con ese token: `auth.jwt()->>'sub'`
 * (id de Clerk, string `user_xxx`).
 *
 * POR QUÉ `createClient` PLANO DE supabase-js Y NO `createServerClient` DE
 * @supabase/ssr:
 *   `createServerClient` (ssr) llama SIEMPRE `client.auth.onAuthStateChange(...)`
 *   al construir el cliente. Y supabase-js, cuando recibe la opción
 *   `accessToken`, deja `client.auth` como un proxy que LANZA ante CUALQUIER
 *   acceso ("Supabase Client is configured with the accessToken option,
 *   accessing supabase.auth.* is not possible"). Resultado: el cliente explotaba
 *   al instanciarse y TODA ruta/server component server-side tiraba HTTP 500
 *   (rompió generación y análisis tras el cutover a Clerk).
 *   Con Clerk no necesitamos las cookies de sesión de Supabase (Clerk maneja la
 *   auth), así que el cliente plano + `accessToken` es exactamente lo que pide
 *   la integración nativa, sin el adaptador de cookies que causaba el throw.
 *
 * `accessToken` es async; Supabase la invoca en cada request, mandando siempre
 * el token fresco de la sesión activa de Clerk. Sin sesión, `getToken()`
 * devuelve null y la query corre anónima (la RLS la filtra).
 *
 * Se mantiene `async` y la firma `createClient()` para no tocar a los
 * llamadores (que hacen `await createClient()`).
 */
export async function createClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Token de Clerk para RLS. Supabase llama esta fn en cada request.
      async accessToken() {
        return (await auth()).getToken();
      },
    },
  );
}
