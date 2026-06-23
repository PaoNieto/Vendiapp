"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Sparkles } from "lucide-react";

/**
 * Card de progreso de generación, fija en la esquina superior derecha (estilo
 * notificación de Facebook). NO bloquea la pantalla: el usuario ve la barra
 * llenarse y el tiempo transcurrido mientras la generación está en vuelo.
 *
 * La barra es de progreso OPTIMISTA: no tenemos eventos de progreso reales del
 * server (la generación es un POST sincrónico), así que avanzamos rápido al
 * principio y desaceleramos, asintótico a ~95% — nunca llega a 100. Al terminar
 * la página recarga y la card desaparece sola.
 *
 * Se renderiza condicionalmente desde las pantallas que disparan generación
 * (Fábrica, detalle de versión) cuando `isSubmitting === true`. Conserva el
 * nombre `GeneratingOverlay` por compatibilidad con esos call-sites.
 */

// Generación típica: 30-60s. Tau controla qué tan rápido sube la barra.
const TICK_MS = 150;
const TAU_MS = 16_000;

export function GeneratingOverlay({ subtitle }: { subtitle?: string }) {
  // El timestamp de inicio se fija en el efecto (post-render), no durante el
  // render: el React Compiler de Next 16 prohíbe llamar Date.now() en render.
  const startedAt = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    startedAt.current = Date.now();
    const id = setInterval(() => {
      if (startedAt.current !== null) {
        setElapsedMs(Date.now() - startedAt.current);
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Curva asintótica: 95 * (1 - e^(-t/τ)). Sube rápido y frena cerca del 95%.
  const progress = Math.min(95, 95 * (1 - Math.exp(-elapsedMs / TAU_MS)));
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const timeLabel = `${Math.floor(totalSeconds / 60)}:${(totalSeconds % 60)
    .toString()
    .padStart(2, "0")}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: -16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="glass-card fixed left-4 right-4 top-4 z-[100] flex flex-col gap-3 p-4 shadow-[0_8px_30px_rgba(15,31,22,.14)] sm:left-auto sm:w-80"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <motion.span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sage-strong/[0.12] text-sage-strong"
          animate={{ scale: [1, 1.12, 1], opacity: [0.75, 1, 0.75] }}
          transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
        >
          <Sparkles className="h-[18px] w-[18px]" />
        </motion.span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[17px] italic leading-tight text-ink">
            Creando tus imágenes…
          </h3>
          <p className="truncate text-xs text-mute">
            {subtitle ?? "Esto toma entre 30 y 60 segundos."}
          </p>
        </div>
        <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-mute">
          {timeLabel}
        </span>
      </div>

      {/* Barra que se va llenando */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-pill-bg/10">
        <div
          className="h-full rounded-full bg-sage-strong transition-[width] duration-150 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </motion.div>
  );
}
