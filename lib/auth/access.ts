import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * ¿El usuario tiene ACCESO a la app? (paywall duro, modelo paga-primero).
 * Acceso = PAGÓ ∨ ILIMITADO (señal infalsificable, ambas tablas service_role-only):
 *  - PAGÓ      ⟺ fila en public.mp_processed_payments (clerk_user_id = userId).
 *  - ILIMITADO ⟺ fila en public.unlimited_users (user_id = userId).
 * NO se gatea por credits_remaining: un pagador en 0 créditos conserva acceso.
 * server-only + service_role (bypassa RLS). Lo consume app/(app)/layout.tsx.
 */
export async function hasAppAccess(userId: string): Promise<boolean> {
  if (!userId) return false;
  const admin = createAdminClient();
  // .limit(1).maybeSingle() a propósito: un usuario puede tener VARIAS filas en
  // mp_processed_payments (varias compras); limit(1) evita que maybeSingle tire
  // error por multiplicidad. Solo importa la EXISTENCIA de al menos una fila.
  const [paid, unlimited] = await Promise.all([
    admin
      .from("mp_processed_payments")
      .select("clerk_user_id")
      .eq("clerk_user_id", userId)
      .limit(1)
      .maybeSingle(),
    admin
      .from("unlimited_users")
      .select("user_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle(),
  ]);
  return Boolean(paid.data) || Boolean(unlimited.data);
}
