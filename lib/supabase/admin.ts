import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase con SERVICE ROLE — bypassa RLS.
 *
 * SOLO server-side. El import "server-only" hace fallar el build si alguien
 * lo importa desde un componente cliente (evita filtrar la service key al
 * browser, que daría acceso total a la base).
 *
 * Se usa para operaciones que el usuario NO debe poder hacer por sí mismo:
 *  - `deduct_credits` / `grant_credits` (RPC revocadas para authenticated).
 *  - Acreditar créditos desde el webhook de Culqi.
 *
 * Para todo lo demás (leer/escribir datos del usuario respetando ownership)
 * se usa el cliente normal de `lib/supabase/server.ts`, que respeta RLS.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.",
    );
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
