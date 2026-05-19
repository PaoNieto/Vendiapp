"use client";

/** Selectable chip (radio or checkbox-like) with optional lucide icon or color preview. */

import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export type SelectableChipProps = {
  /** Visible label. */
  label: string;
  /** Selected state — parent controls. */
  selected: boolean;
  /** Click handler — parent toggles. */
  onSelect: () => void;
  /** "single" hides the check on selection; "multi" shows it. */
  variant?: "single" | "multi";
  /** Lucide icon (left). Optional. */
  icon?: LucideIcon;
  /** Color preview as filled circle (left). Mutually exclusive with icon. */
  color?: string;
  /** Optional small description below the label. */
  description?: string;
  /** Disable interaction. */
  disabled?: boolean;
  /** Optional className passthrough. */
  className?: string;
};

export function SelectableChip({
  label,
  selected,
  onSelect,
  variant = "single",
  icon: Icon,
  color,
  description,
  disabled = false,
  className,
}: SelectableChipProps) {
  return (
    <motion.button
      type="button"
      role={variant === "multi" ? "checkbox" : "radio"}
      aria-checked={selected}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={onSelect}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className={cn(
        "group relative inline-flex min-h-[44px] items-center gap-2 rounded-2xl border px-4 py-2.5 text-left text-sm font-medium transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        selected
          ? "border-primary/60 bg-white/80 text-foreground shadow-sm ring-2 ring-primary/30"
          : "glass border-white/60 text-foreground/85 hover:bg-white/75 hover:text-foreground",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      {color && (
        <span
          aria-hidden
          className={cn(
            "inline-block h-5 w-5 shrink-0 rounded-full border border-white/80 shadow-inner",
          )}
          style={{ backgroundColor: color }}
        />
      )}
      {!color && Icon && (
        <Icon
          className={cn(
            "h-4 w-4 shrink-0",
            selected ? "text-primary" : "text-muted-foreground",
          )}
        />
      )}

      <span className="flex flex-col leading-tight">
        <span>{label}</span>
        {description && (
          <span className="text-[11px] font-normal text-muted-foreground">
            {description}
          </span>
        )}
      </span>

      {variant === "multi" && selected && (
        <Check className="ml-1 h-4 w-4 shrink-0 text-primary" />
      )}
    </motion.button>
  );
}
