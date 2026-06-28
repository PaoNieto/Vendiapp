"use client";

import { useState } from "react";
import { Check, Coins, Loader2 } from "lucide-react";
import { useCreditos } from "@/lib/creditos/use-creditos";
import type { Product } from "@/lib/mercadopago/catalog";

/**
 * Vitrina de compra (cliente). Recibe los productos del catálogo server-side
 * por props (NO los hardcodea), así precio/créditos salen de la misma fuente
 * que el cobro y no hay drift.
 *
 * Al comprar, POST /api/checkout crea una Preference de Mercado Pago y devuelve
 * el `initPoint` (URL de Checkout Pro) al que redirigimos. La acreditación de
 * créditos la confirma el webhook /api/webhooks/mercadopago — NUNCA acá.
 */
export function UpgradeStore({
  products,
  title = "Sumá créditos",
  subtitle = "1 crédito = 1 imagen generada. Todos los pagos son únicos y los créditos no vencen.",
}: {
  products: Product[];
  /** Encabezado de la vitrina. Permite reusar el componente para la página del Pase Fundador. */
  title?: string;
  subtitle?: string;
}) {
  const { stats } = useCreditos();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleBuy(productId: string) {
    setLoadingId(productId);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.initPoint) {
        throw new Error(data?.error ?? "No se pudo iniciar el pago");
      }
      // Redirige a la página de pago de Mercado Pago.
      window.location.href = data.initPoint as string;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar el pago");
      setLoadingId(null);
    }
  }

  const busy = loadingId !== null;
  const lifetime = products.find((p) => p.kind === "lifetime");
  const packs = products.filter((p) => p.kind === "pack");

  return (
    <div className="px-5 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-col items-center text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-pill-bg/10 px-3 py-1.5 text-sm font-semibold text-foreground">
            <Coins className="h-4 w-4" />
            Tenés {stats.balance} {stats.balance === 1 ? "crédito" : "créditos"}
          </span>
          <h1 className="mt-4 font-display text-3xl italic text-foreground sm:text-4xl">
            {title}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            {subtitle}
          </p>
        </div>

        {/* Pase Fundador — oferta destacada de tiempo limitado. */}
        {lifetime ? (
          <div className="mt-10">
            <div className="flex flex-col gap-6 rounded-2xl border border-pill-bg bg-card p-6 shadow-lg ring-1 ring-pill-bg sm:flex-row sm:items-center sm:p-7">
              <div className="flex-1">
                {lifetime.badge ? (
                  <span className="mb-3 inline-flex w-fit rounded-full bg-pill-bg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-pill-fg">
                    {lifetime.badge}
                  </span>
                ) : null}
                <h2 className="font-display text-2xl italic text-foreground">
                  {lifetime.name}
                </h2>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-foreground">
                    S/ {lifetime.priceSoles.toFixed(2)}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    pago único · {lifetime.credits} créditos
                  </span>
                </div>
                {lifetime.perks?.length ? (
                  <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                    {lifetime.perks.map((perk) => (
                      <li
                        key={perk}
                        className="flex items-center gap-2 text-sm text-foreground"
                      >
                        <Check className="h-4 w-4 shrink-0 text-sage-strong" />
                        {perk}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => handleBuy(lifetime.id)}
                disabled={busy}
                className="inline-flex min-h-[48px] shrink-0 items-center justify-center gap-2 rounded-full bg-pill-bg px-6 py-3 text-sm font-semibold text-pill-fg transition-opacity hover:opacity-90 disabled:opacity-60 sm:w-auto"
              >
                {loadingId === lifetime.id ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Redirigiendo…
                  </>
                ) : (
                  "Conseguir el Pase"
                )}
              </button>
            </div>
          </div>
        ) : null}

        {/* Packs de créditos — recarga pura, sin perks. */}
        {packs.length ? (
          <div className="mt-10">
            <h2 className="font-display text-xl italic text-foreground">
              Packs de créditos
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Recargá cuando quieras. Más volumen, mejor precio por crédito.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              {packs.map((pack) => {
                const perCredit = pack.priceSoles / pack.credits;
                return (
                  <div
                    key={pack.id}
                    className={`flex flex-col rounded-2xl border bg-card p-5 shadow-sm ${
                      pack.highlight
                        ? "border-pill-bg ring-1 ring-pill-bg"
                        : "border-pill-bg/40"
                    }`}
                  >
                    {pack.badge ? (
                      <span className="mb-3 inline-flex w-fit rounded-full bg-pill-bg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-pill-fg">
                        {pack.badge}
                      </span>
                    ) : null}
                    <h3 className="font-display text-lg italic text-foreground">
                      {pack.name}
                    </h3>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-foreground">
                        S/ {pack.priceSoles.toFixed(2)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {pack.credits} créditos
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      S/ {perCredit.toFixed(2)} por crédito
                    </p>
                    <button
                      type="button"
                      onClick={() => handleBuy(pack.id)}
                      disabled={busy}
                      className={`mt-5 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60 ${
                        pack.highlight
                          ? "bg-pill-bg text-pill-fg"
                          : "border border-pill-bg bg-transparent text-foreground"
                      }`}
                    >
                      {loadingId === pack.id ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Redirigiendo…
                        </>
                      ) : (
                        "Comprar"
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="mt-6 text-center text-sm text-destructive">{error}</p>
        ) : null}

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Pago en soles con tarjeta o saldo vía Mercado Pago. Te redirige a una
          página segura de Mercado Pago para completar el pago.
        </p>
      </div>
    </div>
  );
}
