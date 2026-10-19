"use client";

import { PauseCircle } from "lucide-react";
import { useAvisos } from "@/lib/avisos/client";
import { AI_DOWN_BANNER } from "@/lib/avisos/textos";

/**
 * Banner de servicio (mockup, caso c): aparece SOLO con la IA caída
 * (service_status.ok = false). Mientras está, las pantallas apagan Generar,
 * Más variaciones, Regenerar y Analizar (leen `useAvisos().ai.down`).
 *
 * Al cliente nunca se le nombra al proveedor: el texto sale de textos.ts.
 */
export function AiDownBanner() {
  const { ai } = useAvisos();
  if (!ai.down) return null;

  return (
    <div className="px-4 pt-3 sm:px-8 lg:px-10 lg:pt-4">
      <div
        role="status"
        aria-live="polite"
        className="flex items-start gap-3.5 rounded-2xl border border-butter/30 bg-butter/10 px-3.5 py-3"
      >
        <span
          aria-hidden
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-butter/20 text-butter"
        >
          <PauseCircle className="h-[17px] w-[17px]" />
        </span>
        <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-foreground sm:text-[13.5px]">
          {AI_DOWN_BANNER}
        </p>
      </div>
    </div>
  );
}
