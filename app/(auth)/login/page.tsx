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

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // TODO: reemplazar con Supabase Auth cuando lleguen las keys
    // const supabase = createClient();
    // const { error } = await supabase.auth.signInWithPassword({ email, password });

    await new Promise((r) => setTimeout(r, 500));
    setLoading(false);
    router.push("/dashboard");
  }

  return (
    <Card className="glass-strong rounded-3xl border-0 p-7 shadow-xl">
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
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
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
