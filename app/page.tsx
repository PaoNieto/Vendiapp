import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Landing pública mínima: por ahora siempre redirige. Si hay sesión va
// directo a /dashboard; si no, a /login. Cuando exista landing real
// (post-launch), este componente devolverá la home pública para
// usuarios anónimos.
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? "/dashboard" : "/login");
}
