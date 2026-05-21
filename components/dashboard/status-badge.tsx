"use client";

/** Pill badge for generation status (pending | processing | completed | failed). */

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export type StatusBadgeStatus = "pending" | "processing" | "completed" | "failed";
export type StatusBadgeSize = "sm" | "md";

export type StatusBadgeProps = {
  /** Estado actual de la generación. */
  status: StatusBadgeStatus;
  /** Tamaño visual. */
  size?: StatusBadgeSize;
  /** Override del label por defecto. */
  label?: string;
  /** className passthrough. */
  className?: string;
};

const defaultLabels: Record<StatusBadgeStatus, string> = {
  pending: "En cola",
  processing: "Procesando",
  completed: "Listo",
  failed: "Error",
};

const variantClasses: Record<StatusBadgeStatus, string> = {
  // Fondo verde-dark traslúcido + texto verde-dark.
  completed: "bg-green-dark/15 text-green-dark border border-green-dark/20",
  // Fondo amber + texto blanco (estado activo).
  processing: "bg-amber text-white border border-amber/60",
  // Fondo neutral suave.
  pending: "bg-white/60 text-green-text border border-white/80",
  // Fondo destructive suave.
  failed: "bg-destructive/15 text-destructive border border-destructive/30",
};

const sizeClasses: Record<StatusBadgeSize, string> = {
  sm: "px-2 py-0.5 text-[10px]",
  md: "px-2.5 py-1 text-[11px]",
};

/**
 * StatusBadge
 *
 * Badge en forma de píldora para el estado de una generación. La variante
 * `processing` tiene un pulse sutil de opacidad (1 → 0.7 → 1, 1.5s loop).
 */
export function StatusBadge({
  status,
  size = "md",
  label,
  className,
}: StatusBadgeProps) {
  const text = label ?? defaultLabels[status];
  const merged = cn(
    "inline-flex items-center gap-1 rounded-full font-medium leading-none whitespace-nowrap",
    variantClasses[status],
    sizeClasses[size],
    className,
  );

  if (status === "processing") {
    return (
      <motion.span
        className={merged}
        animate={{ opacity: [1, 0.7, 1] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
      >
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full bg-current"
        />
        {text}
      </motion.span>
    );
  }

  return <span className={merged}>{text}</span>;
}
