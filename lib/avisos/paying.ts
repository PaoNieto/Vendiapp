import "server-only";
import { isAdmin } from "./admin";
import { adminClientOrNull, errorText } from "./db";

/**
 * ¿Es un cliente que PAGÓ? = tiene al menos una compra en `credit_ledger`
 * (reason 'purchase', la misma señal que abre el paywall) y NO es admin.
 *
 * Se usa para la severidad: una falla de un cliente que pagó es U (mail a
 * Paolo en el momento); la de una cuenta de cortesía o de un admin, M.
 * A diferencia de `userHasPaidAccess`, `unlimited_users` NO cuenta: cortesía no
 * es pago.
 *
 * NUNCA tira: ante error devuelve false (y loguea).
 */
export async function isPayingCustomer(userId: string | null | undefined): Promise<boolean> {
  if (!userId || isAdmin(userId)) return false;
  const admin = adminClientOrNull();
  if (!admin) return false;
  try {
    const { data, error } = await admin
      .from("credit_ledger")
      .select("id")
      .eq("user_id", userId)
      .eq("reason", "purchase")
      .limit(1);
    if (error) {
      console.error("[avisos] isPayingCustomer falló:", error.message);
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  } catch (err) {
    console.error("[avisos] isPayingCustomer tiró:", errorText(err));
    return false;
  }
}
