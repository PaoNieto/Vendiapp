"use client";

import { useState } from "react";
import { Check, Coins, Loader2 } from "lucide-react";
import { useCreditos } from "@/lib/creditos/use-creditos";

/**
 * Página de compra — primer producto: PASE FUNDADOR (Lifetime Pass).
 *
 * El botón llama a POST /api/checkout, que crea una Preference de Mercado Pago
 * (Checkout Pro) y devuelve el `initPoint` (URL de pago de MP) a la que
 * redirigimos. Al pagar, el webhook /api/webhooks/mercadopago acredita los
 * créditos vía grant_credits — NO se acredita acá.
 *
 * Precio y créditos REALES viven en el catálogo server-side
 * (lib/mercadopago/catalog.ts). Los valores de acá son solo COPY de la vitrina;
 * el cargo siempre se resuelve en el servidor.
 */

// id del producto en el catálogo server-side. Lo que el front puede mandar.
const PRODUCT_ID = "lifetime-pass";

// Copy de vitrina (no es la fuente de verdad del cobro).
const PRICE_SOLES = 37.9;
const CREDITS = 60;
const PERKS = [
  "60 créditos de generación",
  "Soporte constante",
  "Insignia de Fundador",
  "Acceso anticipado a lo nuevo",
];

export default function UpgradePage() {
  const { stats } = useCreditos();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleBuy() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: PRODUCT_ID }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.initPoint) {
        throw new Error(data?.error ?? "No se pudo iniciar el pago");
      }
      // Redirige a la página de pago de Mercado Pago.
      window.location.href = data.initPoint as string;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo iniciar el pago",
      );
      setLoading(false);
    }
  }

  return (
    <div className="px-5 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-md">
        <div className="flex flex-col items-center text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-pill-bg/10 px-3 py-1.5 text-sm font-semibold text-foreground">
            <Coins className="h-4 w-4" />
            Tenés {stats.balance} {stats.balance === 1 ? "crédito" : "créditos"}
          </span>
          <h1 className="mt-4 font-display text-3xl italic text-foreground sm:text-4xl">
            Pase Fundador
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Pago único para los primeros fundadores de Vendí. 1 crédito = 1
            imagen generada. Los créditos no vencen.
          </p>
        </div>

        <div className="mt-10">
          <div className="flex flex-col rounded-2xl border border-pill-bg bg-card p-6 shadow-lg ring-1 ring-pill-bg sm:p-7">
            <span className="mb-3 inline-flex w-fit rounded-full bg-pill-bg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-pill-fg">
              Primeros 30 fundadores
            </span>
            <h2 className="font-display text-2xl italic text-foreground">
              De por vida
            </h2>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-3xl font-bold text-foreground">
                S/ {PRICE_SOLES.toFixed(2)}
              </span>
              <span className="text-sm text-muted-foreground">pago único</span>
            </div>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              {CREDITS} créditos
            </p>

            <ul className="mt-5 flex flex-1 flex-col gap-2.5">
              {PERKS.map((perk) => (
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
              onClick={handleBuy}
              disabled={loading}
              className="mt-6 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-pill-bg px-5 py-3 text-sm font-semibold text-pill-fg transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Redirigiendo a Mercado Pago…
                </>
              ) : (
                "Conseguir el Pase Fundador"
              )}
            </button>

            {error ? (
              <p className="mt-3 text-center text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Pago en soles con tarjeta o saldo vía Mercado Pago. Te redirige a una
          página segura de Mercado Pago para completar el pago.
        </p>
      </div>
    </div>
  );
}
