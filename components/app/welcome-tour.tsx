"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Download,
  LayoutGrid,
  Palette,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { PillButton } from "@/components/dashboard";
import { cn } from "@/lib/utils";

/**
 * WelcomeTour — recorrido explicativo de primera vez.
 *
 * Le enseña al usuario nuevo, en fácil y en 5 pasos, cómo funciona Vendí:
 * subir producto → elegir estilo → formato → generar y descargar. Aparece
 * UNA sola vez (flag en localStorage) la primera vez que el usuario entra al
 * shell autenticado. Se puede reabrir en cualquier momento desde el botón
 * "¿Cómo funciona?" del sidebar, que dispara el evento `vendi:open-tour`.
 *
 * Diseño: mismo lenguaje que <GeneratingOverlay> — backdrop verde translúcido
 * con blur, panel `.glass-card` sólido cream, tipografía display serif, blobs
 * radiales cálidos y animaciones Framer Motion (motion/react). No introduce
 * estilos nuevos: consume los tokens/clases del Cuaderno v2.
 */

const STORAGE_KEY = "vendi:tour-seen";
const OPEN_EVENT = "vendi:open-tour";

type TourStep = {
  eyebrow: string;
  icon: LucideIcon;
  /** Título con la palabra enfatizada entre asteriscos → va en serif itálica. */
  title: string;
  emphasis: string;
  /** Cierre del título después de la palabra enfatizada (ej. "."). */
  tail: string;
  body: string;
};

const STEPS: TourStep[] = [
  {
    eyebrow: "BIENVENIDO A VENDÍ",
    icon: Sparkles,
    title: "Fotos de tu producto que ",
    emphasis: "venden",
    tail: ".",
    body: "Sacá una foto simple con el celular y Vendí te la convierte en fotos profesionales, listas para tu tienda o tus anuncios. Sin estudio y sin fotógrafo.",
  },
  {
    eyebrow: "PASO 1",
    icon: Camera,
    title: "Subí tu ",
    emphasis: "producto",
    tail: ".",
    body: "Una foto clara alcanza: ponelo sobre una mesa con buena luz y listo. Esa foto es la base sobre la que Vendí trabaja.",
  },
  {
    eyebrow: "PASO 2",
    icon: Palette,
    title: "Elegí ",
    emphasis: "cómo se ve",
    tail: ".",
    body: "Pickeás un estilo —fondo de estudio, ambiente cálido, aire libre— o subís una foto de ejemplo que te guste. No hace falta saber nada de fotografía.",
  },
  {
    eyebrow: "PASO 3",
    icon: LayoutGrid,
    title: "Elegí formato y ",
    emphasis: "cantidad",
    tail: ".",
    body: "Cuadrado para el feed, vertical para historias o TikTok. Decís cuántas versiones querés y Vendí las prepara todas juntas.",
  },
  {
    eyebrow: "LISTO",
    icon: Download,
    title: "Generá y ",
    emphasis: "descargá",
    tail: ".",
    body: "En menos de un minuto tenés varias fotos para elegir. Descargás las que más te gusten. Cada foto usa 1 crédito; cuando se te acaban, recargás en un toque.",
  },
];

export function WelcomeTour() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  // Auto-apertura de primera vez: solo en el cliente, después de montar, para
  // no romper la hidratación (el server no conoce localStorage). Si el flag no
  // está, abrimos el tour y renderizamos desde el paso 0.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.localStorage.getItem(STORAGE_KEY)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lectura de localStorage post-mount; el SSR no tiene acceso al flag de "tour visto".
      setOpen(true);
    }
  }, []);

  // Reapertura manual desde el sidebar ("¿Cómo funciona?").
  useEffect(() => {
    function handleOpen() {
      setStep(0);
      setOpen(true);
    }
    window.addEventListener(OPEN_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_EVENT, handleOpen);
  }, []);

  const markSeen = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, "1");
    }
  }, []);

  const close = useCallback(() => {
    markSeen();
    setOpen(false);
  }, [markSeen]);

  const finish = useCallback(() => {
    markSeen();
    setOpen(false);
    router.push("/productos/nuevo");
  }, [markSeen, router]);

  // Bloqueo de scroll + Escape para cerrar mientras el tour está abierto.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];
  const Icon = current.icon;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="welcome-tour"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] flex items-center justify-center px-5"
          style={{
            background: "rgba(13, 27, 18, 0.45)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label="Cómo funciona Vendí"
        >
          <motion.div
            initial={{ scale: 0.96, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.98, y: 6 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="glass-card relative flex w-full max-w-md flex-col gap-6 overflow-hidden p-7 sm:p-9"
          >
            {/* Acentos cálidos decorativos — mismo lenguaje que las cards del
                dashboard (butter + sage). */}
            <span
              aria-hidden
              className="pointer-events-none absolute -right-12 -top-12 z-0 h-48 w-48 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(201,166,64,0.28), transparent 68%)",
              }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute -bottom-16 -left-10 z-0 h-44 w-44 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(126,154,117,0.22), transparent 70%)",
              }}
            />

            {/* Top: eyebrow + Saltar */}
            <div className="relative z-[1] flex items-center justify-between gap-3">
              <span className="eyebrow">{current.eyebrow}</span>
              <button
                type="button"
                onClick={close}
                className="text-xs text-mute underline-offset-4 transition-colors hover:text-ink hover:underline"
              >
                Saltar
              </button>
            </div>

            {/* Contenido del paso — cambia con transición de deslizado suave. */}
            <div className="relative z-[1] min-h-[200px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -14 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="flex flex-col gap-4"
                >
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-pill-bg/10 text-sage-strong">
                    <Icon className="h-7 w-7" strokeWidth={1.6} aria-hidden />
                  </span>
                  <h2 className="display-serif text-[26px] leading-tight text-ink sm:text-3xl">
                    {current.title}
                    <span className="display-serif-italic text-sage-strong">
                      {current.emphasis}
                    </span>
                    {current.tail}
                  </h2>
                  <p className="text-[15px] leading-relaxed text-mute">
                    {current.body}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Progreso: barras (una por paso). */}
            <div className="relative z-[1] flex items-center gap-1.5">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Ir al paso ${i + 1}`}
                  onClick={() => setStep(i)}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-200",
                    i === step
                      ? "w-7 bg-sage-strong"
                      : "w-4 bg-ink/15 hover:bg-ink/25",
                  )}
                />
              ))}
            </div>

            {/* Footer: Atrás + Siguiente/Empezar */}
            <div className="relative z-[1] flex items-center justify-between gap-3">
              {step > 0 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-mute transition-colors hover:text-ink"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Atrás
                </button>
              ) : (
                <span />
              )}

              <PillButton
                size="md"
                onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
              >
                {isLast ? "Crear mi primer producto" : "Siguiente"}
                <ArrowRight className="h-4 w-4" />
              </PillButton>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
