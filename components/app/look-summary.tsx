"use client";

/**
 * LookSummary — el moodboard vivo "Tu look" de la estación de estilo fusionada.
 *
 * Responde de un vistazo "¿cómo va a verse mi foto?" combinando los dos
 * ingredientes de la estación: el Estilo Profesional elegido (polaroid grande)
 * y las referencias propias (polaroids chicas en abanico). Se arma solo a
 * medida que el usuario elige, con 4 estados legibles (nada / estilo / refs /
 * ambos) y una caption que nombra el modo.
 *
 * Dos variantes de la MISMA data:
 *   - variant="panel": columna sticky de desktop (moodboard alto).
 *   - variant="bar":   comanda compacta de mobile (arriba del scroll).
 *
 * 100% tokens del sistema (glass-card / eyebrow / font-display / text-mute /
 * border-border) — cero color nuevo. Las animaciones son baratas: un solo
 * glass blur por instancia, springs cortos con la curva de la casa.
 */

import { AnimatePresence, motion } from "motion/react";
import { ImageIcon, Sparkles } from "lucide-react";
import type { Style } from "@/lib/styles";
import { cn } from "@/lib/utils";

const SPRING = { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const };

type LookSummaryProps = {
  style?: Style;
  referencePreviews: string[];
  variant: "panel" | "bar";
};

/** Texto que nombra el modo activo (el "qué estoy armando"). */
function captionFor(style: Style | undefined, refCount: number): string {
  if (style && refCount > 0) {
    return `${style.label} + ${refCount} ${refCount === 1 ? "referencia tuya" : "referencias tuyas"} — lo mejor de ambos`;
  }
  if (style) return `Luz y composición de ${style.label}`;
  if (refCount > 0) return "Tu inspiración manda la estética";
  return "Nada elegido — el Director va a proponer el look por vos";
}

/** Abanico de referencias (hasta 3 visibles + chip "+N"). */
function RefFan({ previews, size }: { previews: string[]; size: number }) {
  const shown = previews.slice(0, 3);
  const extra = previews.length - shown.length;
  const rot = [-4, 2, -1];
  return (
    <div className="flex items-center">
      <div className="flex">
        <AnimatePresence>
          {shown.map((src, i) => (
            <motion.div
              key={src}
              initial={{ opacity: 0, y: 8, rotate: 0 }}
              animate={{ opacity: 1, y: 0, rotate: rot[i] ?? 0 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={SPRING}
              className={cn(
                "overflow-hidden rounded-md border border-border bg-card p-1 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.4)]",
                i > 0 && "-ml-3",
              )}
              style={{ width: size, height: size, zIndex: 3 - i }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- preview de ref (data URL o signed URL) con fallback implícito. */}
              <img
                src={src}
                alt=""
                className="h-full w-full rounded-sm object-cover"
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {extra > 0 && (
        <span className="ml-1.5 font-mono text-xs font-semibold text-mute">
          +{extra}
        </span>
      )}
    </div>
  );
}

export function LookSummary({
  style,
  referencePreviews,
  variant,
}: LookSummaryProps) {
  const refCount = referencePreviews.length;
  const caption = captionFor(style, refCount);

  /* --------------------------- Comanda mobile --------------------------- */
  if (variant === "bar") {
    return (
      <motion.div
        layout
        transition={SPRING}
        className="glass-card-compact flex flex-col gap-2 p-3.5"
      >
        <div className="flex items-center gap-3">
          <span className="eyebrow shrink-0">Tu look</span>
          <div className="flex flex-1 items-center gap-2 overflow-hidden">
            {style ? (
              <span className="flex items-center gap-1.5 truncate">
                <span
                  aria-hidden
                  className="inline-flex h-6 w-6 shrink-0 overflow-hidden rounded-md border border-border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail estático en /public. */}
                  <img
                    src={style.previewImage}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </span>
                <span className="truncate font-display text-base italic text-foreground">
                  {style.label}
                </span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-mute">
                <Sparkles className="h-4 w-4 dark:text-gold" strokeWidth={1.8} />
                <span className="text-sm">Estilo automático</span>
              </span>
            )}
            {refCount > 0 && (
              <span className="ml-auto shrink-0">
                <RefFan previews={referencePreviews} size={26} />
              </span>
            )}
          </div>
        </div>
        <AnimatePresence mode="wait">
          <motion.p
            key={caption}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
            className="card-caption"
          >
            {caption}
          </motion.p>
        </AnimatePresence>
      </motion.div>
    );
  }

  /* ----------------------------- Panel desktop ----------------------------- */
  return (
    <div className="glass-card sticky top-24 flex flex-col gap-4 p-5">
      <span className="eyebrow">Tu look</span>

      {/* Polaroid del estilo (o placeholder si no hay). */}
      <div className="flex justify-center">
        <AnimatePresence mode="wait">
          {style ? (
            <motion.div
              key={style.id}
              initial={{ opacity: 0, y: 10, rotate: -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, rotate: -1.5, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={SPRING}
              className="w-full max-w-[220px] rounded-xl border border-border bg-card p-2 shadow-[0_10px_34px_-14px_rgba(0,0,0,0.55)]"
            >
              <div className="aspect-[4/5] overflow-hidden rounded-lg">
                {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail estático en /public. */}
                <img
                  src={style.previewImage}
                  alt={style.label}
                  className="h-full w-full object-cover"
                />
              </div>
              <p className="mt-2 text-center font-display text-lg italic text-card-foreground">
                {style.label}
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex aspect-[4/5] w-full max-w-[220px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-mute"
            >
              <Sparkles className="h-7 w-7 dark:text-gold" strokeWidth={1.5} />
              <span className="px-6 text-center text-xs">
                El Director propone el look
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Abanico de referencias. */}
      {refCount > 0 && (
        <div className="flex items-center justify-center gap-2">
          <ImageIcon className="h-4 w-4 text-mute" strokeWidth={1.7} />
          <RefFan previews={referencePreviews} size={44} />
        </div>
      )}

      <div className="border-t border-border pt-3">
        <AnimatePresence mode="wait">
          <motion.p
            key={caption}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
            className="text-center text-sm text-mute"
          >
            {caption}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
