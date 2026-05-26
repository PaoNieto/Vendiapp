"use client";

/**
 * StyleCard — card seleccionable para la estacion "Estilo" de la Fabrica.
 *
 * Sistema visual: tema CUADERNO (cards SOLIDAS cream, nunca translucidas).
 *
 * Tokens esperados (definidos en app/globals.css :root / [data-theme]):
 *   --card                 -> fondo cream solido
 *   --card-foreground      -> texto principal (ink)
 *   --muted-foreground     -> texto secundario (mute)
 *   --border               -> borde ink al 10%
 *   --vd-pill-bg           -> deep forest para ring / badge selected
 *   --vd-pill-fg           -> cream para texto sobre pill
 *   --vd-sage-strong       -> verde forest para accent / wash sage
 *   --vd-sage              -> sage medio
 *   --vd-butter            -> amarillo calido para wash "vibrante/pop"
 *   --vd-clay              -> terracota para wash "calido/cafe"
 *
 * Si los tokens faltan, Tailwind cae a `bg-card`, `border-border`,
 * `text-card-foreground`, etc. y el componente sigue compilando.
 */

import { motion } from "motion/react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type StyleCardProps = {
  /** Nombre del estilo (h3, font-display). Ej: "Cafe de barrio". */
  label: string;
  /** Descripcion corta (1-2 lineas, font-sans). Color muted. */
  description: string;
  /** True cuando este estilo esta elegido en el store. */
  selected: boolean;
  /** Callback al togglear seleccion. La grilla decide single vs multi. */
  onSelect: () => void;
  /** className passthrough sobre el button wrapper. */
  className?: string;
};

function inferWashColors(label: string): { start: string; end: string } {
  const text = label.toLowerCase();
  if (/caf[eé]|c[aá]lid|barrio|vintage|retro|terracota|tierra|rustic/.test(text)) {
    return { start: "var(--vd-clay)", end: "var(--vd-butter)" };
  }
  if (/vibrant|pop|satura|energ|brillan|fiesta|tropical/.test(text)) {
    return { start: "var(--vd-butter)", end: "var(--vd-clay)" };
  }
  if (/limpi|minimal|editoria|lujo|premium|elegant|sofistic|natural|wellness/.test(text)) {
    return { start: "var(--vd-sage)", end: "var(--vd-sage-strong)" };
  }
  return { start: "var(--vd-sage)", end: "var(--vd-sage-strong)" };
}

export function StyleCard({
  label,
  description,
  selected,
  onSelect,
  className,
}: StyleCardProps) {
  const wash = inferWashColors(label);

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      whileHover={selected ? undefined : { y: -2 }}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "group relative flex w-full flex-col overflow-hidden rounded-[14px] bg-card text-left",
        "ring-1 ring-inset transition-shadow duration-200 ease-out",
        "min-h-[180px] sm:min-h-[200px]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
        selected
          ? "ring-[2px] ring-[var(--vd-pill-bg)] shadow-[0_1px_0_rgba(15,31,22,0.08),0_18px_40px_-16px_rgba(15,31,22,0.32)]"
          : "ring-[color:var(--border)] shadow-[0_1px_0_rgba(15,31,22,0.06),0_10px_28px_-14px_rgba(15,31,22,0.28)] hover:shadow-[0_1px_0_rgba(15,31,22,0.08),0_18px_40px_-16px_rgba(15,31,22,0.32)]",
        selected
          ? "focus-visible:ring-[var(--vd-pill-bg)]"
          : "focus-visible:ring-[var(--vd-sage-strong)]",
        className,
      )}
    >
      <div aria-hidden className="relative w-full overflow-hidden h-[104px] sm:h-[120px]">
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-200 ease-out",
            selected ? "opacity-[0.55]" : "opacity-[0.35]",
          )}
          style={{
            background: `linear-gradient(135deg, ${wash.start} 0%, ${wash.end} 100%)`,
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 mix-blend-soft-light"
          style={{
            background:
              "linear-gradient(180deg, rgba(250,246,232,0.0) 0%, rgba(250,246,232,0.4) 100%)",
          }}
        />
        {selected && (
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            aria-hidden
            className={cn(
              "absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full",
              "bg-[var(--vd-pill-bg)] text-[var(--vd-pill-fg)]",
              "shadow-[0_2px_8px_-2px_rgba(15,31,22,0.45)]",
            )}
          >
            <Check className="h-4 w-4" strokeWidth={2.4} />
          </motion.span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 px-4 py-3.5 sm:px-5 sm:py-4">
        <h3
          className={cn(
            "font-display text-[20px] italic leading-tight tracking-[-0.02em] sm:text-[22px]",
            "text-card-foreground",
          )}
        >
          {label}
        </h3>
        <p className={cn("text-[13px] leading-snug sm:text-sm", "text-muted-foreground")}>
          {description}
        </p>
      </div>
    </motion.button>
  );
}
