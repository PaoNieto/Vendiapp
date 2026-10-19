import "server-only";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";

/**
 * ¿Quién es admin? (panel /admin/avisos y sus acciones).
 *
 * Fuente: `ADMIN_USER_IDS` (server-only), ids de Clerk separados por coma.
 * Lista EXACTA: sin comodines ni prefijos, y si está vacía NO es admin nadie
 * (JonSnow #2). Cero dependencia de la base: el chequeo no puede fallar por un
 * hipo de Supabase.
 *
 * ⚠️ El layout de /admin NO alcanza (Next no re-ejecuta el layout en una
 * navegación parcial: node_modules/next/dist/docs/01-app/02-guides/
 * authentication.md, "Layouts and auth checks"). `requireAdmin()` va en el
 * page.tsx, en CADA server action y en la función que trae los datos.
 */

/** Ids admin, leídos en cada llamada (cambiar la env en Vercel no requiere más código). */
export function adminUserIds(): ReadonlySet<string> {
  return new Set(
    (process.env.ADMIN_USER_IDS ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  );
}

export function isAdmin(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return adminUserIds().has(userId);
}

/**
 * Id del admin logueado, o null (no logueado o no admin). Para route handlers.
 * Sin try/catch a propósito: `auth()` puede tirar los errores internos de Next
 * (render dinámico) y tragarlos rompería la detección de rutas dinámicas.
 */
export async function getAdminUserId(): Promise<string | null> {
  const { userId } = await auth();
  return isAdmin(userId) ? userId : null;
}

/**
 * Para pages y server actions: devuelve el id del admin o corta con 404
 * (`notFound()`): a un no-admin el panel no le "existe".
 */
export async function requireAdmin(): Promise<string> {
  const userId = await getAdminUserId();
  if (!userId) notFound();
  return userId;
}
