import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

// Landing pública mínima: por ahora siempre redirige. Con sesión de Clerk va a
// /dashboard; si no, a /login. `auth()` (server-side) lee el userId del token
// de Clerk sin pegarle a Supabase. Cuando exista landing real (post-launch),
// este componente devolverá la home pública para usuarios anónimos.
export default async function Home() {
  const { userId } = await auth();
  redirect(userId ? "/dashboard" : "/login");
}
