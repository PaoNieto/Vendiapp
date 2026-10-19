"use client";

import { motion } from "motion/react";
import { AlertCircle, RotateCw, Sparkles } from "lucide-react";
import { messageText } from "@/lib/avisos/textos";
import { splitNotice } from "@/lib/avisos/client";

/**
 * Overlay full-screen mientras una generación está en vuelo.
 *
 * Avisos (variante 08 del mockup, "La espera que cambia"): si la tanda falla,
 * esta MISMA tarjeta se convierte en el aviso, donde el cliente ya estaba
 * mirando, con [Reintentar] y [Cerrar]. Al cerrar, la pantalla deja la tarjeta
 * "No salió" dentro de la tanda (variante 01).
 *
 * `reservedCredits`: créditos que la tanda reserva. null = ilimitado (no se le
 * reserva nada, así que no le prometemos devoluciones).
 */
export type GeneratingOverlayFailure = {
  /** Texto exacto que devolvió la API (o el de textos.ts). */
  message: string;
  onRetry?: () => void;
  onClose: () => void;
  /** «Usa N créditos» debajo de Reintentar. */
  retryCost?: number | null;
};

export function GeneratingOverlay({
  subtitle,
  reservedCredits,
  failure,
}: {
  subtitle?: string;
  reservedCredits?: number | null;
  failure?: GeneratingOverlayFailure | null;
}) {
  const waitingText =
    subtitle ??
    (typeof reservedCredits === "number" && reservedCredits > 0
      ? messageText("generation_reserved", { n: reservedCredits })
      : "No cierres esta pantalla.");

  const failed = failure ? splitNotice(failure.message) : null;

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
      role={failure ? "alertdialog" : "status"}
      aria-live={failure ? "assertive" : "polite"}
      aria-modal={failure ? true : undefined}
    >
      <motion.div
        key={failure ? "failed" : "waiting"}
        initial={{ scale: 0.96, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="glass-card flex w-full max-w-sm flex-col items-center gap-6 p-8 text-center sm:p-10"
      >
        {failure && failed ? (
          <>
            <span className="relative grid h-16 w-16 place-items-center rounded-full border-[3px] border-clay/40 text-clay">
              <AlertCircle className="h-6 w-6" aria-hidden />
            </span>
            <div className="flex flex-col gap-1.5">
              <h3 className="text-2xl text-ink">{failed.title}</h3>
              {failed.body ? <p className="text-sm text-mute">{failed.body}</p> : null}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {failure.onRetry ? (
                <button
                  type="button"
                  onClick={failure.onRetry}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <RotateCw className="h-4 w-4" aria-hidden />
                  Reintentar
                </button>
              ) : null}
              <button
                type="button"
                onClick={failure.onClose}
                className="inline-flex min-h-[44px] items-center rounded-full px-4 text-sm font-semibold text-sage-strong transition-colors hover:text-foreground"
              >
                Cerrar
              </button>
            </div>
            {failure.onRetry && typeof failure.retryCost === "number" && failure.retryCost > 0 ? (
              <p className="-mt-3 font-mono text-[11px] tracking-wide text-mute">
                Usa {failure.retryCost === 1 ? "1 crédito" : `${failure.retryCost} créditos`}
              </p>
            ) : null}
          </>
        ) : (
          <>
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
              <h3 className="text-2xl text-ink">Creando tus imágenes…</h3>
              <p className="text-sm text-mute">{waitingText}</p>
            </div>

            {/* Barra indeterminada */}
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-pill-bg/10">
              <motion.div
                className="h-full w-1/3 rounded-full bg-sage-strong"
                animate={{ x: ["-110%", "330%"] }}
                transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
              />
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
