"use client";

/** Large selectable card representing a mood (minimalista, cálido, vibrante…). */

import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export type MoodCardProps = {
  title: string;
  description?: string;
  selected: boolean;
  onSelect: () => void;
  /** Optional lucide icon shown inside the placeholder. */
  icon?: LucideIcon;
  /** Optional CSS gradient (full `background` value) for the placeholder. */
  gradient?: string;
  /** Optional className passthrough. */
  className?: string;
};

export function MoodCard({
  title,
  description,
  selected,
  onSelect,
  icon: Icon,
  gradient,
  className,
}: MoodCardProps) {
  return (
    <motion.button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      whileTap={{ scale: 0.98 }}
      animate={{ y: selected ? -2 : 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-3xl border text-left transition-shadow",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        selected
          ? "border-primary/60 shadow-[0_10px_30px_-12px_rgba(45,95,71,0.35)] ring-2 ring-primary/30"
          : "glass border-white/60 hover:shadow-md",
        className,
      )}
    >
      <div
        className={cn(
          "relative flex h-28 w-full items-center justify-center sm:h-32",
        )}
        style={{
          background:
            gradient ??
            "linear-gradient(135deg, rgba(200,230,213,0.9) 0%, rgba(160,201,176,0.9) 100%)",
        }}
        aria-hidden
      >
        {Icon && (
          <Icon
            className={cn(
              "h-10 w-10 transition-transform duration-200 ease-out group-hover:scale-105",
              selected ? "text-primary" : "text-foreground/70",
            )}
          />
        )}
        {selected && (
          <span className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
            <Check className="h-4 w-4" />
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1 px-4 py-3">
        <span className="text-sm font-semibold text-foreground">{title}</span>
        {description && (
          <span className="text-xs text-muted-foreground">{description}</span>
        )}
      </div>
    </motion.button>
  );
}
