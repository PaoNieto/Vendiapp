"use client";

import { Sparkles } from "lucide-react";
import { StationShell } from "@/components/app/station-shell";
import { NumberStepper, RatioSelector } from "@/components/fabrica";
import { MAX_VARIATIONS, OUTPUT_RATIOS } from "@/lib/constants";
import { useRecorrido } from "@/lib/recorrido/store";

const RATIO_OPTIONS = OUTPUT_RATIOS.map((r) => ({
  value: r.value,
  label: r.label,
  hint: r.description,
}));

/** Costo estimado por variación. Placeholder visual hasta que conectemos billing. */
const CREDITS_PER_VARIATION = 1;

export default function FormatoPage() {
  const { state, setState, hydrated } = useRecorrido();
  const totalCredits = state.variations * CREDITS_PER_VARIATION;

  return (
    <StationShell
      number="04"
      title="Formato"
      description="Elegí el aspecto (cuadrado, vertical, historia, horizontal) y cuántas variaciones querés generar."
      prevHref="/estilo"
      prevLabel="Volver"
      nextHref="/prompt"
      nextLabel="Continuar a Prompt"
    >
      {!hydrated ? (
        <div
          aria-busy
          className="glass min-h-[300px] animate-pulse rounded-2xl border border-dashed border-white/70"
        />
      ) : (
        <div className="space-y-8">
          <section className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Proporción
              </h2>
              <p className="text-xs text-muted-foreground">
                Elegí el formato según dónde vas a usar la imagen.
              </p>
            </div>
            <RatioSelector
              value={state.ratio}
              onChange={(ratio) => setState({ ratio })}
              options={RATIO_OPTIONS}
            />
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Variaciones
              </h2>
              <p className="text-xs text-muted-foreground">
                Cantidad de imágenes distintas que querés que la IA genere.
              </p>
            </div>
            <NumberStepper
              value={state.variations}
              onChange={(variations) => setState({ variations })}
              min={1}
              max={MAX_VARIATIONS}
              suffix="variaciones"
            />
          </section>

          <div
            className="glass flex items-center gap-3 rounded-2xl border border-white/60 px-4 py-3"
            role="status"
            aria-live="polite"
          >
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="flex-1">
              <div className="text-sm font-medium text-foreground">
                Vas a usar {totalCredits}{" "}
                {totalCredits === 1 ? "crédito" : "créditos"}
              </div>
              <div className="text-xs text-muted-foreground">
                {CREDITS_PER_VARIATION} crédito por variación.
              </div>
            </div>
          </div>
        </div>
      )}
    </StationShell>
  );
}
