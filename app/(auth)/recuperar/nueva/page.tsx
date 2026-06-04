"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

/**
 * Recuperar contrasena — paso 2: setear password nueva.
 *
 * El usuario llega aca despues de clickear el link del email. El callback
 * en /auth/callback ya intercambio el code por sesion, asi que `updateUser`
 * funciona contra la sesion temporal de recovery.
 */
export default function NuevaPasswordPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirm_password") ?? "");

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      setLoading(false);
      return;
    }

    if (password.length < 8) {
      setError("La contraseña tiene que tener al menos 8 caracteres.");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error: authError } = await supabase.auth.updateUser({ password });

    if (authError) {
      const lower = authError.message.toLowerCase();
      if (lower.includes("session") || lower.includes("expired")) {
        setError(
          "El link expiró. Pedí uno nuevo en Recuperar contraseña.",
        );
      } else {
        setError(authError.message);
      }
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);

    // Auto redirect al dashboard despues de 1.5s.
    setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 1500);
  }

  if (success) {
    return (
      <Card className="glass-strong rounded-3xl border-0 p-7 shadow-xl">
        <div className="space-y-3 text-center">
          <h1 className="font-display text-3xl italic tracking-tight text-foreground">
            Listo
          </h1>
          <p className="text-sm text-muted-foreground">
            Tu contraseña fue actualizada. Te llevamos al dashboard…
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="glass-strong rounded-3xl border-0 p-7 shadow-xl">
      <div className="space-y-1.5 text-center">
        <h1 className="font-display text-3xl italic tracking-tight text-foreground">
          Nueva contraseña
        </h1>
        <p className="text-sm text-muted-foreground">
          Elegí una contraseña nueva para tu cuenta.
        </p>
      </div>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">Contraseña nueva</Label>
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
        <div className="space-y-2">
          <Label htmlFor="confirm_password">Repetí la contraseña</Label>
          <Input
            id="confirm_password"
            name="confirm_password"
            type="password"
            placeholder="Tiene que coincidir"
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
          {loading ? "Guardando…" : "Guardar contraseña"}
        </button>
      </form>
    </Card>
  );
}
