"use client";

/** Visual aspect-ratio picker with proportional preview, mobile 2x2 / desktop row. */

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export type RatioValue = "1:1" | "4:5" | "9:16" | "16:9";

export type RatioOption = {
  value: RatioValue;
  label: string;
  /** Optional hint shown below the label. */
  hint?: string;
};

export type RatioSelectorProps = {
  /** Currently selected ratio. */
  value: RatioValue | null;
  /** Notifies parent of new selection. */
  onChange: (value: RatioValue) => void;
  /** Override default options or restrict to a subset. */
  options?: RatioOption[];
  /** Optional className passthrough on the grid. */
  className?: string;
};

const DEFAULT_OPTIONS: RatioOption[] = [
  { value: "1:1", label: "Cuadrado", hint: "Feed clásico" },
  { value: "4:5", label: "Vertical", hint: "Feed alto" },
  { value: "9:16", label: "Historia", hint: "Reel / Story" },
  { value: "16:9", label: "Horizontal", hint: "Web / banner" },
];

/** Returns { w, h } in CSS units that fit inside a 64px-tall canvas. */
function ratioBox(value: RatioValue): { w: number; h: number } {
  const [a, b] = value.split(":").map(Number);
  const maxH = 56;
  const maxW = 64;
  const wByH = (maxH * a) / b;
  if (wByH <= maxW) return { w: wByH, h: maxH };
  const hByW = (maxW * b) / a;
  return { w: maxW, h: hByW };
}

export function RatioSelector({
  value,
  onChange,
  options = DEFAULT_OPTIONS,
  className,
}: RatioSelectorProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Proporción de la imagen"
      className={cn(
        "grid grid-cols-2 gap-3 sm:grid-cols-4",
        className,
      )}
    >
      {options.map((opt) => {
        const selected = value === opt.value;
        const box = ratioBox(opt.value);
        return (
          <motion.button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className={cn(
              "group relative flex min-h-[120px] flex-col items-center justify-between gap-2 rounded-2xl border px-3 py-4 text-center transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              selected
                ? "border-primary/60 bg-white/80 shadow-[0_0_0_3px_rgba(91,174,133,0.25)] ring-2 ring-primary/30"
                : "glass border-white/60 hover:bg-white/75",
            )}
          >
            <div className="flex h-16 w-full items-center justify-center">
              <div
                className={cn(
                  "rounded-md border-2 transition-colors",
                  selected
                    ? "border-primary bg-primary/15"
                    : "border-foreground/30 bg-white/40",
                )}
                style={{ width: `${box.w}px`, height: `${box.h}px` }}
                aria-hidden
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-xs font-semibold text-foreground">
                {opt.value}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {opt.label}
              </span>
              {opt.hint && (
                <span className="text-[10px] text-muted-foreground/70">
                  {opt.hint}
                </span>
              )}
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
