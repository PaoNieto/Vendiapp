import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente Supabase del browser, autenticado con Clerk.
 *
 * Integración NATIVA third-party auth (NO JWT template): le pasamos a Supabase
 * el session token de Clerk vía la opción `accessToken`. RLS resuelve con
 * `auth.jwt()->>'sub'` (id de Clerk).
 *
 * En el browser el token sale de la sesión activa de Clerk, expuesta en
 * `window.Clerk` por el <ClerkProvider> (lo monta Frontero). `accessToken` es
 * async y Supabase la invoca en cada request, así que siempre manda el token
 * vigente. Si Clerk todavía no cargó o no hay sesión, devolvemos null y la
 * query corre como anónima (RLS la filtra).
 *
 * Mantenemos la firma `createClient()` para no romper a los consumidores.
 */

// Tipo mínimo de lo que Clerk expone en `window` (evita `any` y mantiene TS
// estricto sin depender de los tipos globales de @clerk/clerk-js).
type ClerkWindow = {
  Clerk?: {
    session?: {
      getToken: () => Promise<string | null>;
    } | null;
  };
};

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Token de Clerk para RLS. Supabase llama esta fn en cada request.
      async accessToken() {
        if (typeof window === "undefined") return null;
        const clerk = (window as unknown as ClerkWindow).Clerk;
        return (await clerk?.session?.getToken()) ?? null;
      },
    },
  );
}
