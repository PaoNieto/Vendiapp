"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useClerk } from "@clerk/nextjs";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BadgeCheck, Camera, Images, Sparkles } from "lucide-react";
import { PillButton } from "@/components/dashboard/pill-button";
import { STYLE_LIST } from "@/lib/styles";
import { cn } from "@/lib/utils";

/**
 * Paywall de Vendí. Precio y prueba visual EN LA MISMA PANTALLA (es el mecanismo
 * central del patron Arcads): la galeria de estilos vive arriba de la card del
 * plan, no en otra vista.
 *
 * Sin precio tachado, sin chip de "ahorras", sin contador de escasez: el "US$27"
 * de la landing nunca fue un precio real y el descuento enganoso esta registrado
 * como bloqueante para pautar en Meta. El numero grande es el que Mercado Pago va
 * a cobrar dos segundos despues.
 *
 * La galeria es FIJA, la misma para todos. Esta pantalla NO genera ninguna imagen
 * del producto del usuario: no hay estado de "generando tu muestra", y no se
 * llama a /api/generations ni a /api/analyze (devuelven 403 al no-pagador).
 *
 * El precio baja YA FORMATEADO del server (catalogo server-only). Al checkout
 * solo viaja `productId` — nunca un monto.
 */

type LifetimeCopy = {
  priceLabel: string;
  usdLabel: string;
  credits: number;
  analysisCredits: number;
};

type PackNegocioCopy = {
  id: string;
  name: string;
  credits: number;
  priceLabel: string;
  perPhotoLabel: string;
};

export type PlanClientProps = {
  lifetime: LifetimeCopy;
  packNegocio: PackNegocioCopy | null;
};

/** Clave del store de negocio. La escribe /onboarding, la lee el NegocioProvider. */
const NEGOCIO_KEY = "vendi:negocio";

const EASE = [0.16, 1, 0.3, 1] as const;

const EXIT_REASONS = [
  "El precio me parece alto",
  "No entendí bien qué recibo",
  "Quiero ver un ejemplo con mi producto antes de pagar",
  "Ahora no tengo el dinero, lo veo más adelante",
  "Otro",
] as const;

/**
 * STUB — el motivo de abandono todavia NO se persiste (no hay donde guardarlo sin
 * tocar la DB, y eso queda pendiente de la auditoria de seguridad). Engancharlo
 * aca en el PR siguiente; hoy solo cambia la UI.
 */
function recordExitReason(reason: string, detail: string) {
  void reason;
  void detail;
}

export function PlanClient({ lifetime, packNegocio }: PlanClientProps) {
  const { signOut } = useClerk();
  const reduceMotion = useReducedMotion();

  /** productId en vuelo, o null. El loading NO se apaga en el exito: nos vamos. */
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Marca del paso 1 del onboarding. Se lee POST-MOUNT a proposito: vive en
   * localStorage, el server no la conoce, y leerla durante el render generaria
   * mismatch de hidratacion. Arranca en null -> el headline usa el fallback
   * natural y nunca rompe si el dato no esta.
   */
  const [brandName, setBrandName] = useState<string | null>(null);

  const [exitPanel, setExitPanel] = useState(false);
  const [exitDone, setExitDone] = useState(false);
  const [exitOther, setExitOther] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(NEGOCIO_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { brandName?: unknown };
      if (typeof parsed.brandName === "string" && parsed.brandName.trim()) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- lectura de localStorage post-mount; el SSR no tiene acceso.
        setBrandName(parsed.brandName.trim());
      }
    } catch {
      // Storage bloqueado o JSON corrupto: se queda el headline generico.
    }
  }, []);

  /**
   * Unico camino de salida de esta pantalla: el Checkout Pro de Mercado Pago.
   * Mismo patron que /fundador y /upgrade — el precio y los creditos los resuelve
   * el server desde el catalogo; la acreditacion la confirma el webhook, jamas
   * el cliente.
   */
  async function startCheckout(productId: string) {
    setPending(productId);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const data = (await res.json().catch(() => null)) as
        | { initPoint?: string; error?: string }
        | null;
      if (!res.ok || !data?.initPoint) {
        throw new Error(data?.error ?? "No se pudo iniciar el pago");
      }
      // Nos vamos a la pagina segura de Mercado Pago. `pending` queda en true a
      // proposito: apagarlo hace parpadear el boton justo antes de navegar.
      window.location.href = data.initPoint;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar el pago");
      // El CTA mismo es el reintento: se rehabilita y listo, sin segundo boton.
      setPending(null);
    }
  }

  function chooseExitReason(reason: string) {
    recordExitReason(reason, reason === "Otro" ? exitOther.trim() : "");
    setExitDone(true);
  }

  const headline = brandName
    ? `Listo, ${brandName}. Ahora sí, tus fotos.`
    : "Listo. Ahora sí, tus fotos.";

  const bullets = [
    {
      icon: Camera,
      title: "Tu producto de verdad, no una foto de banco.",
      body: "Vendí trabaja sobre la foto real de lo que vendés: se respetan la forma, el color y la etiqueta. Es tu producto, no uno parecido.",
    },
    {
      icon: Images,
      title: `${lifetime.credits} fotos para arrancar.`,
      body: "Un crédito, una foto. No vencen: las usás cuando quieras.",
    },
    {
      icon: Sparkles,
      title: `${lifetime.analysisCredits} análisis con IA.`,
      body: "Subís una foto y Vendí te dice qué mejorar antes de que la publiques.",
    },
    {
      icon: BadgeCheck,
      title: "Un solo pago.",
      body: "No es suscripción. No se renueva ni se te vuelve a cobrar.",
    },
  ];

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <header className="flex items-center justify-between px-5 pt-5 sm:px-6 sm:pt-6">
        <span className="display-serif-italic text-lg text-ink">Vendí</span>
        {/*
          Unica salida ademas del pago. Va a /login (ruta publica), NUNCA a una
          ruta de (app): el que no pago no entra a la app por ningun camino.
        */}
        <button
          type="button"
          onClick={() => signOut({ redirectUrl: "/login" })}
          className="inline-flex min-h-[44px] items-center rounded-full px-3 text-xs font-medium text-mute-on-bg transition-colors duration-150 ease-out hover:text-ink active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
        >
          Cerrar sesión
        </button>
      </header>

      <main className="mx-auto w-full max-w-[560px] flex-1 px-5 pb-12 pt-6 sm:px-6">
        <p className="eyebrow eyebrow-on-bg">Último paso</p>
        <h1 className="mt-2 text-[30px] leading-[1.12] text-ink sm:text-[36px]">
          {headline}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-mute-on-bg">
          Subís la foto que ya tenés —la del celular sirve— y Vendí te devuelve
          fotos profesionales de tu propio producto, en minutos. Sin estudio, sin
          fotógrafo y sin saber nada de diseño.
        </p>

        <StyleGallery />

        {/*
          UNICA capa de blur de la pantalla (.glass-card = backdrop-filter). El
          Pack Negocio de abajo NO la usa: es deliberadamente subordinado.
        */}
        <section className="glass-card mt-7 p-5 sm:p-6">
          <ul className="space-y-4">
            {bullets.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sage/15"
                >
                  <Icon size={18} className="text-sage-strong" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold leading-snug text-ink">{title}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-mute">{body}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-6 border-t border-ink/10 pt-5">
            {/* card-value + numeric-tabular, NO font-mono: --font-mono apunta a
                Geist Mono, que no se carga en la app. */}
            <p className="card-value text-[40px] leading-none text-ink">
              {lifetime.priceLabel}
            </p>
            <p className="mt-2 text-xs text-mute">{lifetime.usdLabel}</p>
            <p className="mt-1 text-[13px] font-semibold text-ink-soft">
              Pase Fundador — acceso que no vence, {lifetime.credits} fotos +{" "}
              {lifetime.analysisCredits} análisis
            </p>

            <PillButton
              size="lg"
              className="mt-5 w-full"
              disabled={pending !== null}
              aria-busy={pending === "lifetime-pass"}
              onClick={() => startCheckout("lifetime-pass")}
            >
              {pending === "lifetime-pass"
                ? "Redirigiendo…"
                : `Pagar ${lifetime.priceLabel} y entrar`}
            </PillButton>

            {error ? (
              <p className="mt-3 text-[13px] text-destructive" role="alert">
                {error}
              </p>
            ) : null}

            <p className="mt-3 text-[11px] leading-relaxed text-mute">
              Pago seguro con Mercado Pago. Es un solo pago: no se renueva ni se te
              vuelve a cobrar, y los créditos no vencen.
            </p>
          </div>
        </section>

        {packNegocio ? (
          <section className="mt-5 rounded-2xl border border-ink/10 bg-card-cream/60 p-4">
            <p className="text-[13px] font-semibold text-ink">
              ¿Vendés mucho y necesitás más?
            </p>
            <p className="mt-1.5 text-[13px] text-ink-soft">
              <span className="font-semibold">{packNegocio.name}</span> —{" "}
              <span className="numeric-tabular">{packNegocio.credits}</span> fotos ·{" "}
              <span className="numeric-tabular">{packNegocio.priceLabel}</span>
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-mute">
              <span className="numeric-tabular">{packNegocio.perPhotoLabel}</span> por
              foto, el precio más bajo. Solo créditos de generación: sin análisis con
              IA ni perks de fundador.
            </p>
            <button
              type="button"
              disabled={pending !== null}
              aria-busy={pending === packNegocio.id}
              onClick={() => startCheckout(packNegocio.id)}
              className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-full border border-ink/20 px-4 text-[13px] font-medium text-ink transition-colors duration-150 ease-out hover:bg-ink/6 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:pointer-events-none disabled:opacity-50"
            >
              {pending === packNegocio.id
                ? "Redirigiendo…"
                : `Elegir ${packNegocio.name}`}
            </button>
          </section>
        ) : null}

        <ExitPanel
          open={exitPanel}
          done={exitDone}
          otherValue={exitOther}
          reduceMotion={Boolean(reduceMotion)}
          onOpen={() => setExitPanel(true)}
          onOtherChange={setExitOther}
          onChoose={chooseExitReason}
          onBack={() => {
            setExitPanel(false);
            setExitDone(false);
            setExitOther("");
          }}
        />
      </main>
    </div>
  );
}

/* ──────────────────────────── Prueba visual ──────────────────────────── */

/**
 * Galeria FIJA de los 10 estilos que ya existen en /public/estilos. Reusa el
 * catalogo `STYLE_LIST` para no duplicar rutas ni nombres.
 *
 * Fila con scroll horizontal (no grilla) para que el precio quede a un scroll de
 * distancia en mobile 375px: la prueba visual y el precio tienen que convivir en
 * la misma pantalla. El scroll horizontal esta contenido en su propio
 * `overflow-x-auto` — el body nunca scrollea de costado.
 */
function StyleGallery() {
  return (
    <section className="mt-7" aria-label="Ejemplos de estilos">
      <p className="eyebrow eyebrow-on-bg">Así se ven los estilos</p>
      <div className="-mx-5 mt-3 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
        <ul className="flex w-max gap-2.5 pb-1">
          {STYLE_LIST.map((style) => (
            <li key={style.id} className="w-[132px] shrink-0">
              <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-ink/10 bg-card-cream/40">
                <Image
                  src={style.previewImage}
                  alt={`Ejemplo del estilo ${style.label}`}
                  fill
                  sizes="132px"
                  className="object-cover"
                />
              </div>
              <p className="mt-1.5 text-[11px] font-medium text-mute-on-bg">
                {style.label}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ────────────────────── "Ahora no puedo" (salida suave) ────────────────────── */

type ExitPanelProps = {
  open: boolean;
  done: boolean;
  otherValue: string;
  reduceMotion: boolean;
  onOpen: () => void;
  onOtherChange: (v: string) => void;
  onChoose: (reason: string) => void;
  onBack: () => void;
};

/**
 * Panel inline (no modal): evita focus-trap y scroll-lock, y sobre todo NO tiene
 * ningun camino a /dashboard ni a ninguna ruta de (app). La unica salida sigue
 * siendo el pago; esto solo baja la friccion emocional de no pagar hoy.
 */
function ExitPanel({
  open,
  done,
  otherValue,
  reduceMotion,
  onOpen,
  onOtherChange,
  onChoose,
  onBack,
}: ExitPanelProps) {
  const transition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.22, ease: EASE };

  return (
    <div className="mt-6">
      <AnimatePresence mode="wait" initial={false}>
        {!open ? (
          <motion.div
            key="trigger"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
            className="text-center"
          >
            <button
              type="button"
              onClick={onOpen}
              className="inline-flex min-h-[44px] items-center rounded-full px-3 text-xs font-medium text-mute-on-bg underline underline-offset-4 transition-colors duration-150 ease-out hover:text-ink active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
            >
              Ahora no puedo
            </button>
          </motion.div>
        ) : (
          <motion.section
            key="panel"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={transition}
            className="rounded-2xl border border-ink/10 bg-card-cream/60 p-4"
          >
            {done ? (
              <>
                <p className="text-[13px] leading-relaxed text-ink">
                  Gracias, de verdad. Tu cuenta y tus datos quedan guardados: cuando
                  quieras entrar, está todo acá.
                </p>
                <button
                  type="button"
                  onClick={onBack}
                  className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-full border border-ink/20 px-4 text-[13px] font-medium text-ink transition-colors duration-150 ease-out hover:bg-ink/6 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                >
                  Volver al pago
                </button>
              </>
            ) : (
              <>
                <p className="text-[13px] font-semibold text-ink">
                  Antes de irte: ¿qué te frenó?
                </p>
                <ul className="mt-3 space-y-2">
                  {EXIT_REASONS.map((reason) => (
                    <li key={reason}>
                      <button
                        type="button"
                        onClick={() => onChoose(reason)}
                        className={cn(
                          "flex min-h-[44px] w-full items-center rounded-xl border border-ink/10 bg-card-cream/70 px-3 py-2 text-left text-[13px] text-ink",
                          "transition-colors duration-150 ease-out hover:border-ink/20 hover:bg-card-cream/90 active:translate-y-px",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
                        )}
                      >
                        {reason}
                      </button>
                    </li>
                  ))}
                </ul>
                <label htmlFor="exitOther" className="sr-only">
                  Contanos qué te frenó
                </label>
                <input
                  id="exitOther"
                  type="text"
                  value={otherValue}
                  onChange={(e) => onOtherChange(e.target.value)}
                  placeholder="Si querés, contanos en una línea"
                  maxLength={200}
                  className="mt-3 min-h-[44px] w-full rounded-xl border border-ink/12 bg-card-cream/70 px-3 py-2 text-[13px] text-ink placeholder:text-mute outline-none transition-colors duration-150 ease-out focus-visible:border-sage-strong focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                />
                <button
                  type="button"
                  onClick={onBack}
                  className="mt-3 inline-flex min-h-[44px] items-center rounded-full px-3 text-xs font-medium text-mute-on-bg transition-colors duration-150 ease-out hover:text-ink active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                >
                  Volver al pago
                </button>
              </>
            )}
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
