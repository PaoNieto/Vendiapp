"use client";

/** Touch-friendly − / value / + numeric stepper (48px touch targets). */

import { Minus, Plus } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export type NumberStepperProps = {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Optional label above the stepper. */
  label?: string;
  /** Optional suffix shown after the number (e.g. "imágenes"). */
  suffix?: string;
  /** Disable interaction. */
  disabled?: boolean;
  /** Optional className passthrough. */
  className?: string;
};

export function NumberStepper({
  value,
  onChange,
  min = 0,
  max = 99,
  step = 1,
  label,
  suffix,
  disabled = false,
  className,
}: NumberStepperProps) {
  const decDisabled = disabled || value - step < min;
  const incDisabled = disabled || value + step > max;

  function handleDec() {
    if (decDisabled) return;
    onChange(Math.max(min, value - step));
  }

  function handleInc() {
    if (incDisabled) return;
    onChange(Math.min(max, value + step));
  }

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <div className="text-sm font-medium text-foreground">{label}</div>
      )}
      <div
        role="group"
        aria-label={label ?? "Selector numérico"}
        className="inline-flex items-center gap-1 rounded-2xl border border-border bg-card p-1.5"
      >
        <motion.button
          type="button"
          onClick={handleDec}
          disabled={decDisabled}
          aria-label="Disminuir"
          whileTap={decDisabled ? undefined : { scale: 0.93 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
          className={cn(
            "inline-flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-foreground transition-colors",
            "hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            "disabled:cursor-not-allowed disabled:opacity-40",
          )}
        >
          <Minus className="h-5 w-5" />
        </motion.button>

        <div
          aria-live="polite"
          className="flex min-w-[72px] flex-col items-center justify-center px-2"
        >
          <span className="font-mono text-2xl font-semibold leading-none text-foreground tabular-nums">
            {value}
          </span>
          {suffix && (
            <span className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {suffix}
            </span>
          )}
        </div>

        <motion.button
          type="button"
          onClick={handleInc}
          disabled={incDisabled}
          aria-label="Aumentar"
          whileTap={incDisabled ? undefined : { scale: 0.93 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
          className={cn(
            "inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors",
            "hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            "disabled:cursor-not-allowed disabled:opacity-40",
          )}
        >
          <Plus className="h-5 w-5" />
        </motion.button>
      </div>
    </div>
  );
}
