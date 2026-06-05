"use client";

import { motion } from "motion/react";
import { Sparkles } from "lucide-react";

/**
 * Overlay full-screen que se muestra mientras una generación está en vuelo
 * (30-60s típico). Le da al usuario una señal visual clara de que algo está
 * pasando, en vez de un botón "Generando…" discreto que parece colgado.
 *
 * Se renderiza condicionalmente desde las pantallas que disparan generación
 * (Fábrica, detalle de versión) cuando `isSubmitting === true`.
 */
export function GeneratingOverlay({ subtitle }: { subtitle?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center px-5"
      style={{
        background: "rgba(13, 27, 18, 0.45)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
      role="status"
      aria-live="polite"
    >
      <motion.div
        initial={{ scale: 0.96, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="glass-card flex w-full max-w-sm flex-col items-center gap-6 p-8 text-center sm:p-10"
      >
        {/* Anillo girando + chispa central */}
        <div className="relative h-16 w-16">
          <span className="absolute inset-0 rounded-full border-[3px] border-pill-bg/15" />
          <motion.span
            className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-sage-strong"
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
          />
          <motion.span
            className="absolute inset-0 flex items-center justify-center text-sage-strong"
            animate={{ scale: [1, 1.15, 1], opacity: [0.7, 1, 0.7] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
          >
            <Sparkles className="h-6 w-6" />
          </motion.span>
        </div>

        <div className="flex flex-col gap-1.5">
          <h3 className="font-display text-2xl italic text-ink">
            Creando tus imágenes…
          </h3>
          <p className="text-sm text-mute">
            {subtitle ??
              "Esto toma entre 30 y 60 segundos. No cierres esta pantalla."}
          </p>
        </div>

        {/* Barra indeterminada */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-pill-bg/10">
          <motion.div
            className="h-full w-1/3 rounded-full bg-sage-strong"
            animate={{ x: ["-110%", "330%"] }}
            transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
          />
        </div>
      </motion.div>
    </motion.div>
  );
}
