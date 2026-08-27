"use client";

/**
 * StyleCard — card seleccionable para elegir un Estilo Profesional.
 *
 * Sistema visual: tema CUADERNO (cards SOLIDAS cream, nunca translucidas).
 *
 * Muestra una mini-foto de ejemplo del estilo (`previewImage`) en la cabecera
 * para que el usuario entienda de un vistazo de qué estilo se trata. Si no hay
 * foto, o si falla la carga, cae a un wash de gradiente derivado del label —
 * así un fallo de imagen NUNCA rompe la estetica de la grilla.
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

import { useState } from "react";
import { motion } from "motion/react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type StyleCardProps = {
  /** Nombre del estilo (h3, font-display). Ej: "Flat lay cenital". */
  label: string;
  /** Descripcion corta (1-2 lineas, font-sans). Color muted. */
  description: string;
  /** Mini-foto de ejemplo del estilo (ruta en /public, ej "/estilos/flat-lay.jpg").
   *  Opcional: si falta o falla la carga, se usa el wash de gradiente. */
  previewImage?: string;
  /** True cuando este estilo esta elegido en el store. */
  selected: boolean;
  /** Callback al togglear seleccion. La grilla decide single vs multi. */
  onSelect: () => void;
  /** className passthrough sobre el button wrapper. */
  className?: string;
};

function inferWashColors(label: string): { start: string; end: string } {
  const text = label.toLowerCase();
  if (/caf[eé]|c[aá]lid|barrio|vintage|retro|terracota|tierra|rustic|artesan/.test(text)) {
    return { start: "var(--vd-clay)", end: "var(--vd-butter)" };
  }
  if (/vibrant|pop|satura|energ|brillan|fiesta|tropical|fondo de color|color/.test(text)) {
    return { start: "var(--vd-butter)", end: "var(--vd-clay)" };
  }
  if (/flot|float|levit|aire|libre|outdoor|fresc/.test(text)) {
    return { start: "var(--vd-sage)", end: "var(--vd-butter)" };
  }
  if (/macro|detalle|textura|editoria|lujo|premium|elegant|sofistic|nocturn|dramatic/.test(text)) {
    return { start: "var(--vd-sage-strong)", end: "var(--vd-clay)" };
  }
  // limpi / minimal / natural / lifestyle / flat lay / knolling / cenital / default
  return { start: "var(--vd-sage)", end: "var(--vd-sage-strong)" };
}

export function StyleCard({
  label,
  description,
  previewImage,
  selected,
  onSelect,
  className,
}: StyleCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const wash = inferWashColors(label);
  const showImage = Boolean(previewImage) && !imgFailed;

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
        // Dark: superficie charcoal top-lit (un pelo más clara arriba) + esquina
        // más generosa (iOS continuous-corner). Light intacto (bg-card sólido).
        "dark:rounded-[18px] dark:bg-gradient-to-b dark:from-[#1b1f19] dark:to-[#0e110e]",
        "ring-1 ring-inset transition-shadow duration-200 ease-out",
        "min-h-[180px] sm:min-h-[200px]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
        "dark:focus-visible:ring-[color:var(--vd-emerald)]",
        selected
          ? "ring-[2px] ring-[var(--vd-pill-bg)] shadow-[0_1px_0_rgba(15,31,22,0.08),0_18px_40px_-16px_rgba(15,31,22,0.32)] dark:ring-[color:var(--vd-emerald)] dark:shadow-[0_0_30px_-6px_var(--vd-emerald-glow),0_20px_46px_-18px_rgba(0,0,0,0.72)]"
          : "ring-[color:var(--border)] shadow-[0_1px_0_rgba(15,31,22,0.06),0_10px_28px_-14px_rgba(15,31,22,0.28)] hover:shadow-[0_1px_0_rgba(15,31,22,0.08),0_18px_40px_-16px_rgba(15,31,22,0.32)] dark:shadow-[0_1px_0_rgba(0,0,0,0.4),0_14px_34px_-16px_rgba(0,0,0,0.66)] dark:hover:ring-[color:var(--vd-emerald)] dark:hover:shadow-[0_0_26px_-8px_var(--vd-emerald-glow),0_18px_42px_-16px_rgba(0,0,0,0.7)]",
        selected
          ? "focus-visible:ring-[var(--vd-pill-bg)]"
          : "focus-visible:ring-[var(--vd-sage-strong)]",
        className,
      )}
    >
      <div aria-hidden className="relative w-full overflow-hidden h-[104px] sm:h-[120px]">
        {showImage ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail estatico en /public con fallback a wash; next/image es innecesario aca. */}
            <img
              src={previewImage}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setImgFailed(true)}
              className={cn(
                "absolute inset-0 h-full w-full object-cover transition-transform duration-300 ease-out",
                selected ? "scale-[1.02]" : "group-hover:scale-[1.03]",
              )}
            />
            {/* Velo inferior para dar profundidad y fundir con la card cream. */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, rgba(15,31,22,0) 45%, rgba(15,31,22,0.18) 100%)",
              }}
            />
          </>
        ) : (
          <>
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
              className="absolute inset-0 mix-blend-soft-light"
              style={{
                background:
                  "linear-gradient(180deg, rgba(250,246,232,0) 0%, rgba(250,246,232,0.4) 100%)",
              }}
            />
          </>
        )}
        {selected && (
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            aria-hidden
            className={cn(
              "absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full",
              "bg-[var(--vd-pill-bg)] text-[var(--vd-pill-fg)]",
              "dark:bg-[var(--vd-emerald)] dark:text-[#04160e]",
              "shadow-[0_2px_8px_-2px_rgba(15,31,22,0.45)] dark:shadow-[0_2px_12px_-2px_var(--vd-emerald-glow)]",
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
