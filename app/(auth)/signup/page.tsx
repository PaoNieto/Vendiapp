"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

// Errores de signUp: si el usuario ya existe Supabase devuelve un
// mensaje técnico — lo mapeamos a algo legible. Si está activado
// "Enable email confirmations" en el Dashboard, signUp devuelve user
// pero session: null. Ese caso lo manejamos abajo con un banner
// informativo en lugar de tratarlo como error.
function friendlySignupError(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes("already registered") ||
    lower.includes("user already exists") ||
    lower.includes("already been registered")
  ) {
    return "Ya existe una cuenta con ese email. Probá iniciar sesión.";
  }
  if (lower.includes("password") && lower.includes("characters")) {
    return "La contraseña tiene que tener al menos 8 caracteres.";
  }
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "Demasiados intentos. Esperá un minuto y probá de nuevo.";
  }
  return message;
}

export default function SignupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmEmailNotice, setConfirmEmailNotice] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setConfirmEmailNotice(false);

    const formData = new FormData(e.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const displayName = String(formData.get("display_name") ?? "").trim();

    const supabase = createClient();
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // El trigger handle_new_user (migración 0001) lee display_name
        // de raw_user_meta_data y crea el row en public.profiles.
        data: { display_name: displayName || null },
        // Sin esto Supabase usa su URL default y el link del email rompe.
        // Apunta al handler en app/auth/callback que intercambia el code.
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
      },
    });

    if (authError) {
      setError(friendlySignupError(authError.message));
      setLoading(false);
      return;
    }

    // Si la confirmación de email está activada en Supabase, signUp
    // devuelve user pero session: null. El usuario tiene que abrir el
    // link del email antes de poder entrar. Si está desactivada (lo
    // recomendado para fase 1) session viene poblada y entramos
    // directo al onboarding.
    if (data.session === null) {
      setConfirmEmailNotice(true);
      setLoading(false);
      return;
    }

    router.push("/onboarding");
    router.refresh();
  }

  if (confirmEmailNotice) {
    return (
      <Card className="glass-strong rounded-3xl border-0 p-7 shadow-xl">
        <div className="space-y-3 text-center">
          <h1 className="font-display text-3xl italic tracking-tight text-foreground">
            Confirmá tu email
          </h1>
          <p className="text-sm text-muted-foreground">
            Te mandamos un email para confirmar tu cuenta. Revisá tu inbox
            (y la carpeta de spam por las dudas).
          </p>
        </div>
        <Separator className="my-6 bg-border" />
        <p className="text-center text-sm text-muted-foreground">
          ¿Ya lo confirmaste?{" "}
          <Link
            href="/login"
            className="font-medium text-foreground hover:underline"
          >
            Iniciá sesión
          </Link>
        </p>
      </Card>
    );
  }

  return (
    <Card className="glass-strong rounded-3xl border-0 p-7 shadow-xl">
      <div className="space-y-1.5 text-center">
        <h1 className="font-display text-3xl italic tracking-tight text-foreground">
          Empezá gratis
        </h1>
        <p className="text-sm text-muted-foreground">
          Generá fotos de tus productos con tu propia API key de Google.
        </p>
      </div>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="display_name">Tu nombre</Label>
          <Input
            id="display_name"
            name="display_name"
            type="text"
            placeholder="Como te llamamos"
            required
            autoComplete="name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="vos@email.com"
            required
            autoComplete="email"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Contraseña</Label>
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="Mínimo 8 caracteres"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className={cn(
            buttonVariants({ size: "lg" }),
            "h-12 w-full rounded-xl text-base disabled:opacity-50",
          )}
        >
          {loading ? "Creando cuenta…" : "Crear cuenta"}
        </button>

        <p className="text-center text-xs text-muted-foreground">
          Al crear una cuenta aceptás nuestros{" "}
          <Link href="/terminos" className="underline hover:text-foreground">
            Términos
          </Link>{" "}
          y{" "}
          <Link href="/privacidad" className="underline hover:text-foreground">
            Privacidad
          </Link>
          .
        </p>
      </form>

      <Separator className="my-6 bg-border" />

      <p className="text-center text-sm text-muted-foreground">
        ¿Ya tenés cuenta?{" "}
        <Link
          href="/login"
          className="font-medium text-foreground hover:underline"
        >
          Iniciá sesión
        </Link>
      </p>
    </Card>
  );
}
