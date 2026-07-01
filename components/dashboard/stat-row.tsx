/** Stat row (label eyebrow + large numeric value) for the dashboard Resumen card. */

import { cn } from "@/lib/utils";

export type StatRowProps = {
  /** Label superior en estilo eyebrow (uppercase, tracking). */
  label: string;
  /** Valor — número grande a la derecha. Si es `"—"` no aplica tabular-nums. */
  value: string | number;
  /** Render bottom divider. */
  divider?: boolean;
  /** className passthrough. */
  className?: string;
};

/**
 * StatRow
 *
 * Fila para la card "Resumen". Label a la izquierda en `.eyebrow`, valor a la
 * derecha grande con `tabular-nums`. Divider opcional al fondo.
 */
export function StatRow({ label, value, divider, className }: StatRowProps) {
  const isPlaceholder = value === "—";
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-end justify-between gap-3">
        <span className="eyebrow">{label}</span>
        <span
          className={cn(
            "text-2xl font-semibold text-foreground leading-none",
            !isPlaceholder && "card-value",
          )}
        >
          {value}
        </span>
      </div>
      {divider && <hr className="border-t border-border m-0" />}
    </div>
  );
}
