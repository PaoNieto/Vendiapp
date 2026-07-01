"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { PillButton } from "@/components/dashboard";
import { cn } from "@/lib/utils";

/**
 * WelcomeTour — tutorial guiado dentro de la app (estilo product tour).
 *
 * No es un modal suelto: es un recorrido pantalla por pantalla que ilumina
 * elementos REALES de la interfaz (spotlight) y explica cada uno en un popover
 * anclado, avanzando por las rutas de la app (dashboard → crear producto →
 * estilo) y cerrando con el resto del flujo. Aparece una sola vez (flag en
 * localStorage) la primera vez que el usuario entra al shell; se reabre desde
 * el botón "¿Cómo funciona?" del sidebar (evento `vendi:open-tour`).
 *
 * Diseño: mismo lenguaje del Cuaderno v2 — popover `.glass-card` cream, display
 * serif, `PillButton`, anillo butter, dim verde profundo y morphing del
 * spotlight con Framer Motion (motion/react). El spotlight se dibuja con un
 * box-shadow de spread gigante: el recuadro queda transparente (deja ver el
 * elemento) y la sombra oscurece todo lo demás; animar top/left/width/height
 * hace que el foco "viaje" suave de un elemento al siguiente.
 */

const STORAGE_KEY = "vendi:tour-seen";
const OPEN_EVENT = "vendi:open-tour";

type Placement = "top" | "bottom" | "auto";

type Step = {
  /** Ruta donde vive el paso. Si difiere de la actual, el tour navega. */
  route?: string;
  /** Selector CSS del elemento a iluminar. Si falta, el popover va centrado. */
  selector?: string;
  placement?: Placement;
  eyebrow: string;
  /** Título: la palabra `emphasis` va en serif itálica sage entre `title` y `tail`. */
  title: string;
  emphasis: string;
  tail: string;
  body: string;
  /** Label del CTA final (solo último paso). */
  cta?: string;
};

const STEPS: Step[] = [
  {
    route: "/dashboard",
    selector: '[data-tour="greeting"]',
    placement: "bottom",
    eyebrow: "BIENVENIDO",
    title: "Este es tu ",
    emphasis: "tablero",
    tail: ".",
    body: "Desde acá manejás todo. Te muestro en 30 segundos cómo convertir la foto de tu producto en fotos que venden.",
  },
  {
    route: "/dashboard",
    selector: '[data-tour="metrics"]',
    placement: "bottom",
    eyebrow: "TU PROGRESO",
    title: "Acá ves tus ",
    emphasis: "números",
    tail: ".",
    body: "Fotos generadas, descargas y tiempo ahorrado. Hoy están en cero porque recién arrancás; se llenan solos a medida que creás.",
  },
  {
    route: "/dashboard",
    selector: '[data-tour="workflow"]',
    placement: "bottom",
    eyebrow: "EL CAMINO",
    title: "Siempre los ",
    emphasis: "mismos pasos",
    tail: ".",
    body: "Producto → Estilo → Formato → listo. Cuatro pasos y tenés tus fotos. Vendí te lleva de la mano en cada uno.",
  },
  {
    route: "/dashboard",
    selector: '[data-tour="nueva-imagen"]',
    placement: "bottom",
    eyebrow: "EMPEZÁ ACÁ",
    title: "Tu primera ",
    emphasis: "imagen",
    tail: ".",
    body: "Todo arranca con este botón. Le damos y creamos tu primer producto.",
  },
  {
    route: "/productos/nuevo",
    selector: "#product-name",
    placement: "bottom",
    eyebrow: "PASO 1 · PRODUCTO",
    title: "Ponele un ",
    emphasis: "nombre",
    tail: ".",
    body: "Algo para reconocerlo después, como “Perfume floral” o “Zapatillas blancas”. Nada más.",
  },
  {
    route: "/productos/nuevo",
    selector: "#product-description",
    placement: "bottom",
    eyebrow: "PASO 1 · PRODUCTO",
    title: "Contá qué ",
    emphasis: "es",
    tail: ".",
    body: "Una línea alcanza. Cuanto mejor lo describís, mejor entiende la IA qué está fotografiando. Es opcional, pero suma.",
  },
  {
    route: "/productos/nuevo",
    selector: '[data-tour="product-photo"]',
    placement: "top",
    eyebrow: "PASO 1 · LA FOTO",
    title: "Subí una foto ",
    emphasis: "simple",
    tail: ".",
    body: "Sacala con el celu, sobre una mesa. Nano Banana —nuestra IA— genera las fotos nuevas a partir de ESE producto, no inventa otro. ¿Querés controlar algún detalle puntual? Tranquilo: más adelante tenés “prompt estricto” para ajustar exactamente lo que quieras.",
  },
  {
    route: "/estilo",
    selector: '[data-tour="estilo-grid"]',
    placement: "top",
    eyebrow: "PASO 2 · ESTILO",
    title: "Elegí el ",
    emphasis: "look",
    tail: ".",
    body: "Fondo de estudio, ambiente cálido, aire libre… cada estilo cambia la luz y el mood. Tocás uno y listo — no hace falta saber de fotografía.",
  },
  {
    eyebrow: "Y LISTO",
    title: "A ",
    emphasis: "vender",
    tail: ".",
    body: "Después elegís el formato (cuadrado para el feed, vertical para historias) y cuántas versiones querés. Tocás Generar y en menos de un minuto tenés tus fotos en la Fábrica para descargar. Cada foto usa 1 crédito.",
    cta: "Crear mi primer producto",
  },
];

/** Padding del recuadro de foco alrededor del elemento. */
const SPOT_PAD = 8;
/** Separación entre el elemento y el popover. */
const GAP = 14;
/** Margen mínimo del popover contra los bordes de la ventana. */
const MARGIN = 16;

type Rect = { top: number; left: number; width: number; height: number };

/** Primer elemento visible (rect no vacío) que matchea el selector. */
function findVisible(selector: string): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>(selector);
  for (const el of nodes) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

function computePopoverPos(
  rect: Rect,
  pw: number,
  ph: number,
  placement: Placement,
): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const below = rect.top + rect.height + GAP;
  const above = rect.top - GAP - ph;

  let top: number;
  if (placement === "top") {
    top = above >= MARGIN ? above : below;
  } else if (placement === "bottom") {
    top = below + ph + MARGIN <= vh ? below : above;
  } else {
    top = below + ph + MARGIN <= vh ? below : above >= MARGIN ? above : below;
  }

  let left = rect.left + rect.width / 2 - pw / 2;
  left = Math.min(Math.max(left, MARGIN), vw - pw - MARGIN);
  top = Math.min(Math.max(top, MARGIN), vh - ph - MARGIN);
  return { top, left };
}

// useLayoutEffect avisa en SSR; en cliente lo queremos para posicionar sin
// flash. Selección estable por entorno.
const useIso = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function WelcomeTour() {
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  // Rect del elemento iluminado (o null → popover centrado).
  const [rect, setRect] = useState<Rect | null>(null);
  const targetElRef = useRef<HTMLElement | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [viewportTick, setViewportTick] = useState(0);

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;
  const hasSpotlight = Boolean(step.selector) && rect !== null;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- flag de montado para el portal (createPortal es client-only).
    setMounted(true);
  }, []);

  // Auto-apertura de primera vez (post-mount; el SSR no ve localStorage).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.localStorage.getItem(STORAGE_KEY)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lectura de localStorage post-mount; el SSR no tiene acceso al flag.
      setOpen(true);
    }
  }, []);

  // Reapertura manual desde el sidebar.
  useEffect(() => {
    function handleOpen() {
      setStepIndex(0);
      setRect(null);
      setPos(null);
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

  const goNext = useCallback(() => {
    if (isLast) {
      finish();
      return;
    }
    setPos(null); // ocultamos el popover hasta reubicarlo en el próximo target
    setStepIndex((i) => Math.min(STEPS.length - 1, i + 1));
  }, [isLast, finish]);

  const goPrev = useCallback(() => {
    setPos(null);
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  // Localiza el elemento del paso actual: navega si hace falta y reintenta
  // hasta que el target aparezca (el DOM puede montar tras el cambio de ruta).
  useEffect(() => {
    if (!open) return;
    const s = STEPS[stepIndex];

    if (s.route && pathname !== s.route) {
      router.push(s.route);
      return; // al cambiar pathname, el efecto corre de nuevo
    }

    if (!s.selector) {
      targetElRef.current = null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync del target del DOM: paso sin ancla → popover centrado.
      setRect(null);
      return;
    }

    let cancelled = false;
    let tries = 0;
    const tick = () => {
      if (cancelled) return;
      const el = findVisible(s.selector!);
      if (el) {
        el.scrollIntoView({ block: "center", inline: "nearest" });
        requestAnimationFrame(() => {
          if (cancelled) return;
          targetElRef.current = el;
          const r = el.getBoundingClientRect();
          setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
        });
      } else if (tries < 60) {
        tries += 1;
        setTimeout(tick, 50);
      } else {
        // No apareció: caemos a popover centrado sin romper el tour.
        targetElRef.current = null;
        setRect(null);
      }
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [open, stepIndex, pathname, router]);

  // Recalcula el rect del target al hacer scroll / resize (el foco lo sigue).
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const el = targetElRef.current;
      if (el) {
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      }
      setViewportTick((t) => t + 1);
    };
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  // Posiciona el popover una vez medido su tamaño real.
  useIso(() => {
    if (!open) return;
    const pop = popRef.current;
    if (!pop) return;
    const { width: pw, height: ph } = pop.getBoundingClientRect();
    if (step.selector && rect) {
      setPos(computePopoverPos(rect, pw, ph, step.placement ?? "auto"));
    } else {
      setPos({
        top: (window.innerHeight - ph) / 2,
        left: (window.innerWidth - pw) / 2,
      });
    }
    // viewportTick fuerza recomputo en resize.
  }, [open, stepIndex, rect, viewportTick, step.selector, step.placement]);

  // Teclado: Escape cierra, flechas navegan.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight" || e.key === "Enter") goNext();
      else if (e.key === "ArrowLeft") goPrev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, goNext, goPrev]);

  if (!mounted) return null;

  // Recuadro de foco (con padding), clampeado a la ventana.
  const spot = hasSpotlight && rect
    ? {
        top: Math.max(rect.top - SPOT_PAD, 6),
        left: Math.max(rect.left - SPOT_PAD, 6),
        width: Math.min(rect.width + SPOT_PAD * 2, window.innerWidth - 12),
        height: rect.height + SPOT_PAD * 2,
      }
    : null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[95]" aria-live="polite">
          {/* Capa que intercepta clicks del fondo (el tour avanza con sus
              propios botones). Transparente: el oscurecido lo pone el foco. */}
          <div
            className="absolute inset-0 z-0"
            onClick={close}
            aria-hidden
          />

          {/* Spotlight morphing (elemento real) o dim completo (paso centrado). */}
          {spot ? (
            <motion.div
              key="spotlight"
              aria-hidden
              className="pointer-events-none absolute z-[1]"
              initial={false}
              animate={{
                opacity: 1,
                top: spot.top,
                left: spot.left,
                width: spot.width,
                height: spot.height,
              }}
              transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
              style={{
                borderRadius: 16,
                boxShadow:
                  "0 0 0 3px rgba(201,166,64,0.9), 0 0 0 9999px rgba(13,27,18,0.55)",
              }}
            />
          ) : (
            <motion.div
              key="dim"
              aria-hidden
              className="pointer-events-none absolute inset-0 z-[1]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ background: "rgba(13,27,18,0.55)" }}
            />
          )}

          {/* Popover */}
          <motion.div
            key="popover"
            ref={popRef}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: pos ? 1 : 0, scale: pos ? 1 : 0.98 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            style={{ top: pos?.top ?? 0, left: pos?.left ?? 0 }}
            className="glass-card absolute z-[2] flex w-[min(360px,calc(100vw-32px))] flex-col gap-4 p-6"
            role="dialog"
            aria-modal="true"
            aria-label="Cómo funciona Vendí"
          >
            {/* Acento cálido decorativo. */}
            <span
              aria-hidden
              className="pointer-events-none absolute -right-10 -top-10 z-0 h-32 w-32 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(201,166,64,0.26), transparent 70%)",
              }}
            />

            <div className="relative z-[1] flex items-center justify-between gap-3">
              <span className="eyebrow">{step.eyebrow}</span>
              <button
                type="button"
                onClick={close}
                className="text-xs text-mute underline-offset-4 transition-colors hover:text-ink hover:underline"
              >
                Saltar
              </button>
            </div>

            <div className="relative z-[1]">
              <h2 className="display-serif text-[24px] leading-tight text-ink sm:text-[26px]">
                {step.title}
                <span className="display-serif-italic text-sage-strong">
                  {step.emphasis}
                </span>
                {step.tail}
              </h2>
              <p className="mt-2.5 text-[14.5px] leading-relaxed text-mute">
                {step.body}
              </p>
            </div>

            {/* Progreso */}
            <div className="relative z-[1] flex items-center gap-1.5">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  aria-hidden
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-300",
                    i === stepIndex ? "w-6 bg-sage-strong" : "w-3 bg-ink/15",
                  )}
                />
              ))}
              <span className="ml-auto text-[11px] font-medium text-mute">
                {stepIndex + 1} / {STEPS.length}
              </span>
            </div>

            {/* Footer */}
            <div className="relative z-[1] flex items-center justify-between gap-3">
              {stepIndex > 0 ? (
                <button
                  type="button"
                  onClick={goPrev}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-mute transition-colors hover:text-ink"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Atrás
                </button>
              ) : (
                <span />
              )}

              <PillButton size="md" onClick={goNext}>
                {isLast ? step.cta ?? "Empezar" : "Siguiente"}
                <ArrowRight className="h-4 w-4" />
              </PillButton>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
