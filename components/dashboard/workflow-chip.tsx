/** Chip de paso de workflow — done / active / pending. */

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type WorkflowChipProps = {
  /** Texto del paso (ej "Producto", "Referencias", "Formato", "Versión"). */
  label: string;
  /**
   * Estado del paso:
   *  - `done`:    completado. Mismo fondo + tick butter sólido.
   *  - `active`:  en curso. Mismo fondo + dot butter sólido sin tick.
   *  - `pending`: pendiente. Mismo fondo con opacidad reducida + círculo hueco.
   *
   * Todos los chips comparten la misma paleta base — la jerarquía se comunica
   * por el indicador a la izquierda + opacidad del chip, no por color de
   * fondo. En light, todos verde-dark con texto cream; en dark, todos cream
   * con texto verde-dark (gracias a los tokens `bg-primary` /
   * `text-primary-foreground`, que invierten con la variant `.dark`).
   */
  state: "done" | "active" | "pending";
  /** className passthrough. */
  className?: string;
};

/**
 * WorkflowChip
 *
 * Pill chico (radius 999px) que representa un paso en un flujo lineal. Pensado
 * para una stack horizontal con scroll en mobile. NO es glass — es sólido
 * compacto.
 *
 * El estado se distingue por:
 *  - indicador izquierdo: tick (done) / dot (active) / ring vacío (pending)
 *  - opacidad del chip: 100% (done/active) / 50% (pending)
 */
export function WorkflowChip({ label, state, className }: WorkflowChipProps) {
  // El indicador de estado a la izquierda del label: círculo sólido (done/active)
  // o ring vacío (pending). Tamaño 14px — proporcional a 12.5px de texto.
  const indicator = (() => {
    if (state === "done") {
      return (
        <span
          aria-hidden
          className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-butter"
        >
          <Check
            className="h-2.5 w-2.5 text-ink"
            strokeWidth={3}
            aria-hidden
          />
        </span>
      );
    }
    if (state === "active") {
      return (
        <span
          aria-hidden
          className="inline-block h-3.5 w-3.5 rounded-full bg-butter"
        />
      );
    }
    // pending — círculo vacío con borde sutil para que se vea hueco. El borde
    // usa el color de foreground sobre el primary-bg actual.
    return (
      <span
        aria-hidden
        className="inline-block h-3.5 w-3.5 rounded-full border border-primary-foreground/40"
      />
    );
  })();

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full whitespace-nowrap",
        "px-3 py-1.5 text-[12.5px] font-medium leading-none",
        "transition-opacity duration-150 ease-out",
        // Paleta unificada: en light, primary = forest-dark + fg = cream.
        // En dark, primary = cream + fg = forest-dark. Mismo chip, distinto
        // indicador.
        "bg-primary text-primary-foreground",
        "shadow-[0_1px_2px_rgba(15,31,22,0.18)]",
        state === "pending" ? "opacity-50" : "opacity-100",
        className,
      )}
      data-state={state}
    >
      {indicator}
      {label}
    </span>
  );
}
