"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const BUSINESS_TYPES = [
  { id: "dropshipping", label: "Dropshipping", emoji: "📦" },
  { id: "dtc", label: "Marca DTC", emoji: "🏷️" },
  { id: "agency", label: "Agencia", emoji: "🎯" },
  { id: "creator", label: "Creator", emoji: "✨" },
  { id: "other", label: "Otro", emoji: "🌱" },
];

const USE_CASES = [
  { id: "meta_ads", label: "Meta Ads" },
  { id: "shopify", label: "Shopify / Tienda" },
  { id: "temu", label: "Temu / Marketplaces" },
  { id: "catalog", label: "Catálogo / Editorial" },
  { id: "social", label: "Redes sociales" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [businessType, setBusinessType] = useState<string | null>(null);
  const [useCases, setUseCases] = useState<string[]>([]);
  const [projectName, setProjectName] = useState("Mi primer proyecto");
  const [submitting, setSubmitting] = useState(false);

  function toggleUseCase(id: string) {
    setUseCases((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function finish() {
    setSubmitting(true);
    // TODO: persistir businessType, useCases en profiles y crear project con projectName
    await new Promise((r) => setTimeout(r, 500));
    router.push("/mi-negocio");
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-5 py-5">
        <span className="text-lg font-semibold tracking-tight text-foreground">
          Vendí
        </span>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 py-8">
        <div className="w-full max-w-xl">
          {/* Stepper */}
          <div className="mb-6 flex items-center justify-center gap-2">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className={cn(
                  "h-1.5 w-12 rounded-full transition-colors",
                  n <= step ? "bg-primary" : "bg-foreground/15",
                )}
              />
            ))}
          </div>

          <Card className="glass-strong rounded-3xl border-0 p-7 shadow-xl sm:p-9">
            {step === 1 && (
              <>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  ¿A qué te dedicás?
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Para personalizar tu experiencia.
                </p>
                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {BUSINESS_TYPES.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setBusinessType(b.id)}
                      className={cn(
                        "glass flex flex-col items-center gap-1.5 rounded-2xl p-4 text-sm font-medium transition-all hover:scale-[1.02]",
                        businessType === b.id &&
                          "ring-2 ring-primary ring-offset-2 ring-offset-transparent",
                      )}
                    >
                      <span className="text-2xl">{b.emoji}</span>
                      {b.label}
                    </button>
                  ))}
                </div>
                <div className="mt-7 flex justify-end">
                  <button
                    type="button"
                    disabled={!businessType}
                    onClick={() => setStep(2)}
                    className={cn(
                      buttonVariants({ size: "lg" }),
                      "h-12 rounded-xl px-6 text-base disabled:opacity-50",
                    )}
                  >
                    Continuar
                  </button>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  ¿Para qué vas a usar Vendí?
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Elegí todos los que apliquen.
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {USE_CASES.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleUseCase(u.id)}
                      className={cn(
                        "glass rounded-full px-4 py-2.5 text-sm font-medium transition-all hover:scale-[1.02]",
                        useCases.includes(u.id) &&
                          "bg-primary text-primary-foreground",
                      )}
                    >
                      {u.label}
                    </button>
                  ))}
                </div>
                <div className="mt-7 flex justify-between">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className={cn(
                      buttonVariants({ size: "lg", variant: "ghost" }),
                      "h-12 rounded-xl px-6 text-base",
                    )}
                  >
                    Atrás
                  </button>
                  <button
                    type="button"
                    disabled={useCases.length === 0}
                    onClick={() => setStep(3)}
                    className={cn(
                      buttonVariants({ size: "lg" }),
                      "h-12 rounded-xl px-6 text-base disabled:opacity-50",
                    )}
                  >
                    Continuar
                  </button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  Creá tu primer proyecto
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Un proyecto agrupa generaciones del mismo producto o
                  campaña.
                </p>
                <div className="mt-6">
                  <label className="text-sm font-medium text-foreground">
                    Nombre del proyecto
                  </label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    className="mt-2 h-11 w-full rounded-xl border border-input bg-input/50 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Ej: Lanzamiento sneakers verano"
                  />
                </div>
                <div className="mt-7 flex justify-between">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className={cn(
                      buttonVariants({ size: "lg", variant: "ghost" }),
                      "h-12 rounded-xl px-6 text-base",
                    )}
                  >
                    Atrás
                  </button>
                  <button
                    type="button"
                    disabled={!projectName.trim() || submitting}
                    onClick={finish}
                    className={cn(
                      buttonVariants({ size: "lg" }),
                      "h-12 rounded-xl px-6 text-base disabled:opacity-50",
                    )}
                  >
                    {submitting ? "Creando…" : "Empezar a generar"}
                  </button>
                </div>
              </>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}
