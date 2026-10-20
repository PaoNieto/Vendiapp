"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/auth/use-user";
import { useProducts } from "@/lib/products/store";
import { DEMO_SCENES } from "./demo-tour-scenes";

/**
 * Tour in-app: «demo animada» (opción 09 que eligió Paolo el 16/10/2026).
 *
 * Un modal con un mini video hecho en CSS (escenas en demo-tour-scenes.ts) +
 * la línea de 4 capítulos (Producto · Versión · Generar · Descargar) + el texto
 * del guion con la tipografía del saludo del dashboard.
 *
 * Se abre solo la PRIMERA vez que el cliente entra a la app (marca en
 * localStorage). Se puede volver a abrir con `?tour=1` en cualquier ruta de la
 * app o disparando el evento `OPEN_TOUR_EVENT` en window.
 */

const STORAGE_KEY = "vendi:tour-v1";
export const OPEN_TOUR_EVENT = "vendi:abrir-tour";
const CHAPTER_MS = 8500;

type Chapter = {
  eyebrow: string;
  pre: string;
  accent: string;
  post: string;
  body: string;
  tc: string;
  cn: string;
};

const CHAPTERS: Chapter[] = [
  {
    eyebrow: "Bienvenida · Paso 1 de 4",
    pre: "Esto es",
    accent: "Vendí",
    post: ".",
    body: "Subís fotos de celular de tu producto y te devolvemos fotos profesionales. Cargalo una vez: nombre y al menos 1 foto con buena luz.",
    tc: "0:06",
    cn: "Producto",
  },
  {
    eyebrow: "Paso 2 de 4",
    pre: "Armá tu",
    accent: "versión",
    post: ".",
    body: "Es tu sesión de fotos, como «Día de la Madre». Ahí cargás tu referencia, elegís estilo, formato y cuántas fotos por tanda.",
    tc: "0:14",
    cn: "Versión",
  },
  {
    eyebrow: "Paso 3 de 4",
    pre: "Generá tus",
    accent: "fotos",
    post: ".",
    body: "Abajo de todo, tocá «Revisar y generar» y después «Generar primera tanda». En alrededor de un minuto aparecen ahí mismo.",
    tc: "0:22",
    cn: "Generar",
  },
  {
    eyebrow: "Paso 4 de 4",
    pre: "Descargalas en la",
    accent: "Fábrica",
    post: ".",
    body: "Todas tus versiones quedan en la Fábrica: abrí una, tocá una foto y después «Descargar».",
    tc: "0:30",
    cn: "Descargar",
  },
];
const RAIL = ["Producto", "Versión", "Generar", "Descargar"];
const LAST = CHAPTERS.length; // índice del cierre

function markSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, new Date().toISOString());
  } catch {
    /* modo privado: no pasa nada, la próxima vez se vuelve a mostrar */
  }
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function DemoTour() {
  const router = useRouter();
  const { user } = useUser();
  const { state: productsState } = useProducts();
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [replay, setReplay] = useState(0);
  const videoRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const show = useCallback(() => {
    setIdx(0);
    setReplay((r) => r + 1);
    setPlaying(!prefersReducedMotion());
    setOpen(true);
  }, []);

  // Primera visita (o ?tour=1) → se abre sola. También escucha el evento para relanzarla.
  useEffect(() => {
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(STORAGE_KEY);
    } catch {
      seen = null;
    }
    const force = new URLSearchParams(window.location.search).get("tour") === "1";
    const t = !seen || force ? window.setTimeout(show, 700) : undefined;
    window.addEventListener(OPEN_TOUR_EVENT, show);
    return () => {
      if (t) window.clearTimeout(t);
      window.removeEventListener(OPEN_TOUR_EVENT, show);
    };
  }, [show]);

  const close = useCallback(() => {
    markSeen();
    setOpen(false);
  }, []);

  // Bloquea el scroll de atrás, foco inicial y Esc para cerrar.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const f = window.setTimeout(() => nextRef.current?.focus({ preventScroll: true }), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.clearTimeout(f);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  // El video avanza solo de capítulo mientras está en reproducción.
  useEffect(() => {
    if (!open || !playing || idx >= LAST) return;
    const t = window.setTimeout(() => setIdx((i) => Math.min(LAST, i + 1)), CHAPTER_MS);
    return () => window.clearTimeout(t);
  }, [open, playing, idx, replay]);

  // La escena está dibujada a 816×380: la escalamos al ancho real del reproductor.
  useEffect(() => {
    if (!open) return;
    const el = videoRef.current;
    const modal = modalRef.current;
    if (!el || !modal) return;
    const fit = () => modal.style.setProperty("--s", String(Math.min(1, el.clientWidth / 816)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  if (!open) return null;

  const hasProducts = productsState.products.length > 0;
  const cta = hasProducts
    ? { label: "Crear una versión", href: "/productos" }
    : { label: "Subir mi primer producto", href: "/productos/nuevo" };
  const goCta = () => {
    close();
    router.push(cta.href);
  };
  const go = (i: number) => {
    setIdx(Math.max(0, Math.min(LAST, i)));
    setReplay((r) => r + 1);
  };

  const firstName = user?.user_metadata.display_name?.trim().split(/\s+/)[0] || null;
  const supportMailto = `mailto:soporte@vendilatam.com?subject=${encodeURIComponent(
    "Ayuda desde la app de Vendí",
  )}&body=${encodeURIComponent(
    `Hola, necesito ayuda con:\n\n\n\n— — —\nMi cuenta: ${user?.email ?? ""}\n(dejá esta línea, nos ayuda a encontrarte)`,
  )}`;

  const ended = idx >= LAST;
  const ch = CHAPTERS[Math.min(idx, LAST - 1)];

  return (
    <div className={`vd-demo${playing ? "" : " is-paused"}`}>
      <div className="vd-veil" onClick={close} aria-hidden="true" />
      <div className="dm-amb" aria-hidden="true" />
      <div
        ref={modalRef}
        className="dm-modal is-in"
        role="dialog"
        aria-modal="true"
        aria-label="Cómo funciona Vendí"
      >
        <div className="dm-video" ref={videoRef}>
          <div
            key={`${idx}-${replay}`}
            className="dm-scene"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("[data-go]")) go(0);
            }}
            dangerouslySetInnerHTML={{ __html: DEMO_SCENES[idx] }}
          />
          <div className="dm-scrim" />
          <span className="dm-tag dm-mono">
            <i />
            Cómo funciona
          </span>
          <button type="button" className="dm-x" aria-label="Cerrar la demo" onClick={close}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
          <div className="dm-ctrl">
            <button
              type="button"
              className={`dm-pp${playing && !ended ? "" : " play"}`}
              aria-label={playing && !ended ? "Pausar" : "Reproducir"}
              onClick={() => {
                if (ended) go(0);
                else setPlaying((p) => !p);
              }}
            >
              <i />
            </button>
            <span className="dm-tc">
              <b>{ended ? "0:32" : ch.tc}</b> / 0:32
            </span>
            <span className="dm-dot" />
            <span className="dm-cn">{ended ? "Fin" : ch.cn}</span>
          </div>
          <span className="dm-wm" aria-hidden="true">
            Vendí<span>.</span>
          </span>
        </div>

        <nav className="dm-rail" aria-label="Capítulos de la demo">
          {RAIL.map((name, i) => {
            const st = i < idx ? "done" : i === idx ? "on" : "";
            return (
              <button
                key={`${name}-${i === idx ? replay : 0}`}
                type="button"
                className={`dm-chap ${st}`}
                aria-current={i === idx ? "step" : undefined}
                onClick={() => go(i)}
              >
                <span className="dm-bar">
                  <i />
                </span>
                <span className="dm-row">
                  <span className="dm-n">{String(i + 1).padStart(2, "0")}</span>
                  <span className="dm-nm">{name}</span>
                  {st === "done" ? (
                    <span className="dm-ok">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </span>
                  ) : (
                    <span className="dm-d">0:08</span>
                  )}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="dm-txt">
          <div>
            <span className="vt-eyebrow">{ended ? "Listo" : ch.eyebrow}</span>
            {ended ? (
              <h2 className="vt-title">
                Tu turno{firstName ? ", " : ""}
                {firstName ? <span className="vt-acc">{firstName}</span> : null}.
              </h2>
            ) : (
              <h2 className="vt-title">
                {ch.pre} <span className="vt-acc">{ch.accent}</span>
                {ch.post}
              </h2>
            )}
          </div>
          <div className="dm-bd">
            {ended ? (
              <p className="vt-body">
                Para fotos nuevas, arrancá siempre con «Nueva Imagen» en el Dashboard. ¿Dudas?{" "}
                <a className="dm-link" href={supportMailto}>
                  Escribinos
                </a>
                .
              </p>
            ) : (
              <p className="vt-body">{ch.body}</p>
            )}
            <div className="dm-acts">
              {idx > 0 ? (
                <button type="button" className="vt-ghost" onClick={() => go(idx - 1)}>
                  Atrás
                </button>
              ) : null}
              {ended ? (
                <>
                  <button type="button" className="vt-ghost" onClick={close}>
                    Ahora no
                  </button>
                  <button ref={nextRef} type="button" className="vt-next" onClick={goCta}>
                    {cta.label} →
                  </button>
                </>
              ) : (
                <>
                  {idx === 0 ? (
                    <button type="button" className="vt-ghost" onClick={close}>
                      Saltar
                    </button>
                  ) : null}
                  <button type="button" className="dm-try" onClick={goCta}>
                    Probalo vos
                  </button>
                  <button ref={nextRef} type="button" className="vt-next" onClick={() => go(idx + 1)}>
                    Seguir →
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
