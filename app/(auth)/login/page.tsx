"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

// Convierte errores crudos de Supabase Auth en mensajes en español
// amigables. Los códigos vienen de gotrue-js — si Supabase cambia los
// strings en el futuro el fallback siempre devuelve el original.
function friendlyAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) {
    return "Email o contraseña incorrectos.";
  }
  if (lower.includes("email not confirmed")) {
    return "Confirmá tu email antes de entrar. Revisá tu inbox.";
  }
  if (lower.includes("too many requests") || lower.includes("rate limit")) {
    return "Demasiados intentos. Esperá un minuto y probá de nuevo.";
  }
  return message;
}

// useSearchParams() corre en cliente y obliga a Next a hacer CSR bailout
// si no está dentro de un <Suspense>. Aislamos el form en un componente
// separado y lo envolvemos en Suspense en el default export.
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(friendlyAuthError(authError.message));
      setLoading(false);
      return;
    }

    // ?from=/ruta-original viene del proxy cuando redirige a /login
    // por falta de sesión. Volvemos a esa ruta tras login exitoso.
    const from = searchParams.get("from");
    const destination = from && from.startsWith("/") ? from : "/dashboard";
    router.push(destination);
    router.refresh();
  }

  return (
    <Card className="glass-strong rounded-3xl border-0 p-7 shadow-xl">
      <div className="space-y-1.5 text-center">
        <h1 className="font-display text-3xl italic tracking-tight text-foreground">
          Bienvenido
        </h1>
        <p className="text-sm text-muted-foreground">Iniciá sesión en Vendí</p>
      </div>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
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
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Contraseña</Label>
            <Link
              href="/recuperar"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Olvidé mi contraseña
            </Link>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
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
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>

      <Separator className="my-6 bg-border" />

      <p className="text-center text-sm text-muted-foreground">
        ¿Sos nuevo?{" "}
        <Link
          href="/signup"
          className="font-medium text-foreground hover:underline"
        >
          Creá tu cuenta
        </Link>
      </p>
    </Card>
  );
}

// Fallback mínimo durante la hidratación del query string. Mantiene el
// shell de la card para que no salte el layout.
function LoginFormFallback() {
  return (
    <Card className="glass-strong rounded-3xl border-0 p-7 shadow-xl">
      <div className="space-y-1.5 text-center">
        <h1 className="font-display text-3xl italic tracking-tight text-foreground">
          Bienvenido
        </h1>
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </div>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFormFallback />}>
      <LoginForm />
    </Suspense>
  );
}
