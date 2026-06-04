import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Handler del email link de Supabase Auth.
 *
 * Cuando el usuario clickea el link del mail de confirmacion (o reset
 * password, o magic link), Supabase redirige a esta ruta con un `code` en
 * query. Lo intercambiamos por una sesion y mandamos al destino correcto.
 *
 * Flujo:
 *  1. Email → "Confirmar cuenta" → https://vendiapp.vercel.app/auth/callback?code=...&type=signup&next=/onboarding
 *  2. Aca: exchangeCodeForSession(code) setea cookies de sesion en la response.
 *  3. Redirect a `next` (o /dashboard por default).
 *
 * Si el code es invalido / expirado: redirect a /login con un error
 * en query para que la UI lo muestre.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";
  const type = searchParams.get("type");

  // Sin code: link malformado. Mandamos a login con error explicito.
  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?error=missing_code`,
    );
  }

  // Construimos la response que vamos a devolver. Las cookies de sesion
  // se setean adentro del cookies.setAll callback que Supabase invoca al
  // hacer exchangeCodeForSession.
  let response = NextResponse.redirect(`${origin}${next}`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Code invalido / expirado. Mandamos a login con error legible.
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  // Caso especial: reset de password. El email "Reset password" usa el
  // mismo handler pero el usuario tiene que ir a la pantalla para setear
  // password nueva, no al dashboard.
  if (type === "recovery") {
    response = NextResponse.redirect(`${origin}/recuperar/nueva`);
    // Re-setear cookies en la nueva response.
    const cookiesToSet = request.cookies.getAll();
    cookiesToSet.forEach(({ name, value }) =>
      response.cookies.set(name, value),
    );
  }

  return response;
}
