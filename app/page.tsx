import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

// Fallback del root. En la práctica NO se renderiza: `proxy.ts` intercepta `/`
// antes — anónimo → rewrite a `public/landing.html` (la landing pública),
// logueado → redirect a `/dashboard`. Este componente queda como red de
// seguridad por si el proxy no corriera. `auth()` lee el userId del token de
// Clerk sin pegarle a Supabase.
export default async function Home() {
  const { userId } = await auth();
  redirect(userId ? "/dashboard" : "/login");
}
