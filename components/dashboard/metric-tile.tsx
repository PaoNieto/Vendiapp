/** Card de KPI con eyebrow, número grande (Instrument Serif), sparkline y delta. */

import { cn } from "@/lib/utils";
import { Sparkline } from "./sparkline";

export type MetricTileProps = {
  /** Eyebrow uppercase tracked (clase `.eyebrow`). Ej: "IMÁGENES ESTE MES". */
  label: string;
  /**
   * Valor principal — número o string ya formateado (ej `47` o `"14 hs"`).
   * Se renderiza en Instrument Serif tabular-nums (44px mobile → 56px desktop).
   */
  value: number | string;
  /**
   * Delta opcional. `value` ya debe traer el signo (`"+23%"`, `"-4%"`).
   * `positive` define el color: `true` = sage-strong (delta-positive),
   * `false` = clay (delta-negative). Default `true`.
   */
  delta?: { value: string; positive?: boolean };
  /** Texto secundario al lado del delta (ej "vs semana anterior"). */
  deltaLabel?: string;
  /** Serie para sparkline interno. Si está, se renderiza a la derecha del número. */
  sparkline?: number[];
  /**
   * Color del sparkline. Por default usa el color del delta cuando hay delta
   * (positive → accent / sage-strong, negative → destructive / clay), o
   * `var(--accent)` si no hay delta.
   */
  sparklineColor?: string;
  /** className passthrough sobre la card. */
  className?: string;
};

/**
 * MetricTile
 *
 * KPI tile premium para el dashboard. Estructura:
 *
 *   ┌─────────────────────────────────────┐
 *   │ EYEBROW UPPERCASE                   │
 *   │                                     │
 *   │  47               ╱╲ ╱╲             │  ← número 44-56px + sparkline 80-100px
 *   │ (Instrument)     ╱  ╳   ╳           │
 *   │                                     │
 *   │ +23%   vs semana anterior           │  ← delta line (opcional)
 *   └─────────────────────────────────────┘
 *
 * - Glass card (`.glass-card`) — el efecto premium ya lo aporta la clase.
 * - Padding 22-24px (p-5 sm:p-6).
 * - Número en `font-display` (Instrument Serif) tabular-nums, escala responsive
 *   (44px → 52px → 56px de mobile a desktop).
 * - Sparkline a la derecha solo si `sparkline` viene con ≥ 2 valores. El SVG
 *   es internamente responsive (viewBox + width=100%); el tamaño físico lo
 *   damos vía clases Tailwind responsive sobre el wrapper.
 * - Server component puro — `<Sparkline>` también es server.
 */
export function MetricTile({
  label,
  value,
  delta,
  deltaLabel,
  sparkline,
  sparklineColor,
  className,
}: MetricTileProps) {
  const deltaPositive = delta?.positive ?? true;
  // Default vivo: accent (sage-strong en light, sage claro en dark). Si hay
  // delta negativo, usamos destructive (clay). Esto le da contexto visual al
  // sparkline sin que el caller tenga que pasar color manual.
  const resolvedSparkColor =
    sparklineColor ??
    (delta && !deltaPositive ? "var(--destructive)" : "var(--accent)");

  return (
    <div className={cn("glass-card p-5 sm:p-6", className)}>
      <span className="eyebrow block">{label}</span>

      <div className="mt-4 flex items-end justify-between gap-4 sm:gap-6">
        <span
          className={cn(
            "display-serif numeric-tabular text-ink leading-none",
            "text-[44px] sm:text-[52px] lg:text-[56px]",
          )}
        >
          {value}
        </span>

        {sparkline && sparkline.length >= 2 ? (
          // Wrapper responsive: 80×36 mobile, 100×44 sm+. El SVG interno usa
          // viewBox y w/h-full para escalar sin reflow ni JS.
          <div className="h-9 w-20 shrink-0 sm:h-11 sm:w-[100px]">
            <Sparkline
              values={sparkline}
              color={resolvedSparkColor}
              className="h-full w-full"
            />
          </div>
        ) : null}
      </div>

      {delta ? (
        <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span
            className={cn(
              "text-sm font-semibold numeric-tabular",
              deltaPositive ? "text-delta-positive" : "text-delta-negative",
            )}
          >
            {delta.value}
          </span>
          {deltaLabel ? (
            <span className="text-xs text-mute">{deltaLabel}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
