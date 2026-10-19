import type { Metadata } from "next";
import { requireAdmin } from "@/lib/avisos/admin";

export const metadata: Metadata = {
  title: "Admin · Vendí",
  robots: { index: false, follow: false },
};

/**
 * Sección /admin: solo ids de ADMIN_USER_IDS (lista exacta; vacía = nadie).
 * A cualquier otro le responde 404.
 *
 * ⚠️ Este layout NO alcanza: Next no lo re-ejecuta en navegaciones parciales.
 * El page, la función que trae los datos y cada server action llaman a
 * `requireAdmin()` por su cuenta.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
