"use client";

import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

/**
 * Recuperar contrasena — paso 1: pedir el email.
 *
 * El usuario ingresa su email, Supabase manda un mail con un link tipo
 * /auth/callback?code=...&type=recovery. El callback handler detecta el
 * type=recovery y redirige a /recuperar/nueva donde puede setear su
 * password nueva.
 */
export default function RecuperarPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const email = String(formData.get("email") ?? "").trim();

    const supabase = createClient();
    const { error: authError } = await supabase.auth.resetPasswordForEmail(
      email,
      {
        // El link en el email apunta al callback con type=recovery.
        // El callback redirige a /recuperar/nueva.
        redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
      },
    );

    if (authError) {
      // No revelamos si el email existe o no — siempre mostramos exito.
      // Pero si fue rate limit / problema real, sí lo mostramos.
      const lower = authError.message.toLowerCase();
      if (lower.includes("rate limit") || lower.includes("too many")) {
        setError("Demasiados intentos. Esperá un minuto y probá de nuevo.");
        setLoading(false);
        return;
      }
    }

    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <Card className="glass-strong rounded-3xl border-0 p-7 shadow-xl">
        <div className="space-y-3 text-center">
          <h1 className="font-display text-3xl italic tracking-tight text-foreground">
            Revisá tu email
          </h1>
          <p className="text-sm text-muted-foreground">
            Si existe una cuenta con ese email, te mandamos un link para
            resetear tu contraseña. Revisá tu inbox (y spam por las dudas).
          </p>
        </div>
        <Separator className="my-6 bg-border" />
        <p className="text-center text-sm text-muted-foreground">
          <Link
            href="/login"
            className="font-medium text-foreground hover:underline"
          >
            Volver al login
          </Link>
        </p>
      </Card>
    );
  }

  return (
    <Card className="glass-strong rounded-3xl border-0 p-7 shadow-xl">
      <div className="space-y-1.5 text-center">
        <h1 className="font-display text-3xl italic tracking-tight text-foreground">
          Recuperar contraseña
        </h1>
        <p className="text-sm text-muted-foreground">
          Ingresá tu email y te mandamos un link para resetearla.
        </p>
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
          {loading ? "Mandando…" : "Mandar link de recuperación"}
        </button>
      </form>

      <Separator className="my-6 bg-border" />

      <p className="text-center text-sm text-muted-foreground">
        <Link
          href="/login"
          className="font-medium text-foreground hover:underline"
        >
          Volver al login
        </Link>
      </p>
    </Card>
  );
}
