"use client";

import { Check, Coins } from "lucide-react";
import { useCreditos } from "@/lib/creditos/use-creditos";
import { cn } from "@/lib/utils";

/**
 * Página de compra de créditos / planes.
 *
 * IMPORTANTE: Culqi (la pasarela de pago) todavía NO está conectada — faltan
 * las credenciales. Por eso el botón "Comprar" hoy es un placeholder que NO
 * cobra. Cuando estén las credenciales de Culqi, el handler abre el checkout
 * y, al pagar, un webhook acredita los créditos vía grant_credits.
 *
 * Los precios son DE EJEMPLO — ajustar según el costo real de Gemini (ver
 * BRIEF_modelo_creditos.md) antes de cobrar de verdad.
 */

type Plan = {
  id: string;
  name: string;
  credits: number;
  priceSoles: number;
  highlight?: boolean;
  perks: string[];
};

// Precios DE EJEMPLO (placeholder). Verificar costo real de IA antes de fijar.
const PLANS: Plan[] = [
  {
    id: "inicial",
    name: "Inicial",
    credits: 30,
    priceSoles: 39,
    perks: ["30 imágenes", "Todos los estilos", "Todos los formatos"],
  },
  {
    id: "pro",
    name: "Pro",
    credits: 75,
    priceSoles: 89,
    highlight: true,
    perks: ["75 imágenes", "Todos los estilos", "Todos los formatos", "Soporte prioritario"],
  },
  {
    id: "studio",
    name: "Studio",
    credits: 200,
    priceSoles: 199,
    perks: ["200 imágenes", "Todos los estilos", "Todos los formatos", "Soporte prioritario"],
  },
];

export default function UpgradePage() {
  const { stats } = useCreditos();

  function handleBuy(plan: Plan) {
    // TODO(integral): conectar Culqi. Abrir checkout con plan.priceSoles,
    // y en el webhook llamar grant_credits(user, plan.credits, 'purchase').
    alert(
      `Pronto vas a poder comprar ${plan.credits} créditos por S/ ${plan.priceSoles}.\n\nCulqi todavía no está conectado.`,
    );
  }

  return (
    <div className="px-5 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col items-center text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-pill-bg/10 px-3 py-1.5 text-sm font-semibold text-foreground">
            <Coins className="h-4 w-4" />
            Tenés {stats.balance} {stats.balance === 1 ? "crédito" : "créditos"}
          </span>
          <h1 className="mt-4 font-display text-3xl italic text-foreground sm:text-4xl">
            Comprá créditos
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            1 crédito = 1 imagen generada. Los créditos no vencen. Elegí el pack
            que te sirva.
          </p>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={cn(
                "flex flex-col rounded-2xl border p-6 sm:p-7",
                plan.highlight
                  ? "border-pill-bg bg-card shadow-lg ring-1 ring-pill-bg"
                  : "border-border bg-card",
              )}
            >
              {plan.highlight ? (
                <span className="mb-3 inline-flex w-fit rounded-full bg-pill-bg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-pill-fg">
                  Más elegido
                </span>
              ) : null}
              <h2 className="font-display text-2xl italic text-foreground">
                {plan.name}
              </h2>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-bold text-foreground">
                  S/ {plan.priceSoles}
                </span>
              </div>
              <p className="mt-1 text-sm font-medium text-muted-foreground">
                {plan.credits} créditos
              </p>

              <ul className="mt-5 flex flex-1 flex-col gap-2.5">
                {plan.perks.map((perk) => (
                  <li
                    key={perk}
                    className="flex items-center gap-2 text-sm text-foreground"
                  >
                    <Check className="h-4 w-4 shrink-0 text-sage-strong" />
                    {perk}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => handleBuy(plan)}
                className={cn(
                  "mt-6 inline-flex min-h-[48px] items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition-opacity hover:opacity-90",
                  plan.highlight
                    ? "bg-pill-bg text-pill-fg"
                    : "border border-border bg-card text-foreground",
                )}
              >
                Comprar {plan.credits} créditos
              </button>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Pago en soles con Yape o tarjeta vía Culqi. Precios de ejemplo —
          sujetos a ajuste.
        </p>
      </div>
    </div>
  );
}
