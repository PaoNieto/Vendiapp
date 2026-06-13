import { redirect } from "next/navigation";

/**
 * Con Clerk, el reset de contraseña vive DENTRO de <SignIn/> (link "Olvidé mi
 * contraseña" → Clerk manda el código por email → setea la nueva, todo inline).
 * Ya no hay flujo /recuperar custom de Supabase.
 *
 * Mantenemos esta ruta (el proxy la marca pública) sólo como atajo: cualquier
 * link viejo a /recuperar redirige al login, donde está el flujo real de Clerk.
 */
export default function RecuperarPage() {
  redirect("/login");
}
