"use client";

import { RotateCw } from "lucide-react";

/** Recarga la página entera (vuelve a correr el layout y su chequeo). */
export function RetryButton({ label = "Probar de nuevo" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <RotateCw className="h-4 w-4" aria-hidden />
      {label}
    </button>
  );
}
