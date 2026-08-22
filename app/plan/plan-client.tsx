"use client";

import { useEffect, useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";
import { PillButton } from "@/components/dashboard/pill-button";
import { RUBROS_FILA_A, RUBROS_FILA_B, type Rubro } from "./rubros";
import { cn } from "@/lib/utils";

/**
 * Paywall de Vendí. Precio y prueba visual EN LA MISMA PANTALLA (es el mecanismo
 * central del patron Arcads).
 *
 * ORDEN DE LA CARD (esto es lo que decide la venta, no es gusto):
 *   PRECIO (US$10) -> capsula "Pago único" -> BLOQUE DE COBRO (S/ 39) -> CTA ->
 *   reaseguro -> hairline -> 6 beneficios -> letra chica.
 * El "resumen" suelto que iba entre la capsula y el CTA se ABSORBIO dentro del
 * bloque de cobro (`.vd-plan-charge-note`): duplicarlo costaba ~40px verticales
 * y esos 40px son justo los que tiran el boton fuera del fold del iPhone SE.
 * Antes iba al reves (4 bullets largos primero) y el S/39 arrancaba a ~900px del
 * tope: en un iPhone SE habia que scrollear una pantalla entera para ver el
 * precio. Ahora el precio y el boton entran sin scrollear en 375x667.
 *
 * Sin precio tachado, sin chip de "ahorras", sin contador de escasez, sin
 * promesas de "mas fotos = mas ventas": el "US$27" de la landing nunca fue un
 * precio real y el descuento enganoso esta registrado como bloqueante para
 * pautar en Meta. El unico numero derivado permitido es S/39 / 60 = S/0.65 por
 * foto, que es aritmetica sobre el precio real.
 *
 * 🔴 LAS DOS MONEDAS. El numero grande es `US$10` (el ancla que el mercado
 * entiende), pero Mercado Pago cobra SOLES. Por eso el `S/ 39` aparece TRES
 * veces y ninguna en letra chica: 16px bold en el bloque de cobro que va pegado
 * debajo del precio, 15px bold en el TEXTO DEL BOTON, y 12px en el pie. El que
 * toca "Pagar" ya vio el monto real tres veces; no puede sorprenderse.
 *
 * ⚠️ La capsula al lado del precio dice "Pago único" y NO "S/0.65 por foto".
 * Motivo: en un rubro que es 100% suscripcion, un `US$10` suelto se lee como
 * `US$10/mes`. La capsula pegada al numero es el unico lugar donde ese
 * malentendido se mata antes de nacer. El S/0.65 no se pierde: baja al pie.
 *
 * La prueba visual es FIJA (las 33 fotos de /public/catalogo, las mismas de la
 * landing). Esta pantalla NO genera ninguna imagen del producto del usuario: no
 * hay estado de "generando tu muestra", y no se llama a /api/generations ni a
 * /api/analyze (devuelven 403 al no-pagador).
 *
 * UNA sola oferta: el Pase Fundador. El Pack Negocio se saco a proposito
 * (decision comercial) — /upgrade lo sigue vendiendo por su cuenta desde
 * `listProducts()`, asi que el catalogo NO se toco.
 *
 * El precio baja YA FORMATEADO del server (catalogo server-only). Al checkout
 * solo viaja `productId` — nunca un monto.
 */

type LifetimeCopy = {
  /** id del catalogo. `startCheckout` es generica: el id sale de aca, no de un literal. */
  id: string;
  /** "US$10" — el NUMERO GRANDE. Sale de `priceUsdDisplay` del catalogo. */
  usdBig: string;
  /**
   * "S/ 39" — lo que Mercado Pago cobra de verdad. Se muestra TRES veces
   * (bloque de cobro 16px bold · texto del boton 15px bold · pie 12px) y ninguna
   * en letra chica. NO lo escondas.
   */
  chargeLabel: string;
  /** S/39 / 60 = "S/0.65". Lo calcula el server desde el catalogo. Vive en el pie. */
  perPhotoLabel: string;
  credits: number;
  analysisCredits: number;
};

export type PlanClientProps = {
  lifetime: LifetimeCopy;
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

/** Ancho maximo de los bloques de texto/card. La lluvia va a ancho COMPLETO. */
const COLUMN = "mx-auto w-full max-w-[560px] px-5 sm:px-6";

/**
 * STUB — el motivo de abandono todavia NO se persiste (no hay donde guardarlo sin
 * tocar la DB, y eso queda pendiente de la auditoria de seguridad). Engancharlo
 * aca en el PR siguiente; hoy solo cambia la UI.
 */
function recordExitReason(reason: string, detail: string) {
  void reason;
  void detail;
}

export function PlanClient({ lifetime }: PlanClientProps) {
  const { signOut } = useClerk();
  const prefersReduced = Boolean(useReducedMotion());

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

  /**
   * Gate de hidratacion. `useReducedMotion()` devuelve null en el server y el
   * valor real ya en el PRIMER render del cliente: decidir con eso CUANTOS nodos
   * pintar romperia la hidratacion (66 divs en el HTML del server vs 33 en el
   * cliente). Por eso el conteo de nodos de la lluvia se decide POST-MOUNT. El
   * resto de la coreografia no necesita este gate: usa `prefersReduced` solo en
   * `transition`, que no se serializa.
   */
  const [hydrated, setHydrated] = useState(false);

  const [exitPanel, setExitPanel] = useState(false);
  const [exitDone, setExitDone] = useState(false);
  const [exitOther, setExitOther] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- gate de hidratacion: el server no conoce prefers-reduced-motion.
    setHydrated(true);
  }, []);

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

  /**
   * ⚠️ TRUNCADO A 24 CARACTERES — no es capricho, es presupuesto vertical.
   * El nombre lo escribe el usuario en el paso 1 del onboarding y no tiene tope
   * util. Un nombre largo empuja el H1 a una TERCERA linea (+26px) y eso solo
   * alcanza para tirar el CTA fuera del fold de un iPhone SE, que es la unica
   * pantalla donde el presupuesto no tiene aire.
   */
  const headline = brandName
    ? `Listo, ${brandName.slice(0, 24)}. Ahora sí, tus fotos.`
    : "Listo. Ahora sí, tus fotos.";

  /**
   * Coreografia de entrada: precio 0.08 · CTA 0.20 · badge 0.26 · beneficios
   * escalonados (stagger 0.045, delayChildren 0.16). Todo termina antes de 900ms.
   *
   * Con movimiento reducido la transicion dura 0 y sin delay: el elemento aparece
   * ya puesto. Se hace por `transition` y NO por `initial={false}` porque
   * `initial` SI se serializa en el HTML del server — cambiarlo segun la
   * preferencia del usuario rompe la hidratacion, y esta es exactamente la
   * pantalla donde no se puede romper nada.
   */
  const rise = (delay: number) => ({
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: prefersReduced
      ? { duration: 0, delay: 0 }
      : { duration: 0.42, ease: EASE, delay },
  });

  /**
   * Variante SIN entrada para el PRECIO, el resumen y el CTA.
   *
   * ⚠️ NO cambiar a `rise()`. Framer-motion SERIALIZA `initial` como style inline
   * en el HTML del server (`use-visual-state`/`useInitialMotionValues`), asi que
   * un `initial:{opacity:0}` hace que el precio y el boton nazcan INVISIBLES y la
   * card se vea vacia hasta que hidrata. En una 3G eso son segundos de tarjeta en
   * blanco en la pantalla que decide la venta, y castiga el LCP.
   *
   * `initial={false}` monta directo en el estado final => el S/39 y el boton
   * estan en el HTML, visibles sin JS. La card igual "llega": el badge y los
   * beneficios siguen animando, y el barrido dorado del precio es CSS puro
   * (@keyframes vd-price-sheen), asi que tampoco depende de JS.
   */
  const noRise = { initial: false as const, animate: { opacity: 1, y: 0 } };

  const featuresContainer = {
    hidden: {},
    show: {
      transition: prefersReduced
        ? { staggerChildren: 0, delayChildren: 0 }
        : { staggerChildren: 0.045, delayChildren: 0.16 },
    },
  };
  const featureItem = {
    hidden: { opacity: 0, y: 8 },
    show: {
      opacity: 1,
      y: 0,
      transition: prefersReduced ? { duration: 0 } : { duration: 0.3, ease: EASE },
    },
  };

  /**
   * Los 6 beneficios, en formato "linea + aclaracion entre parentesis".
   * Los numeros salen del catalogo (`lifetime.credits` / `analysisCredits`),
   * NUNCA hardcodeados.
   */
  const features = [
    {
      title: "Tu producto de verdad, no una foto de banco",
      note: "se respetan la forma, el color y la etiqueta de tu foto",
    },
    {
      // Sube al puesto 2 a proposito: es lo UNICO que ninguno de los 10
      // competidores del rubro puede decir (todos son suscripcion). Y la nota usa
      // la formula de Depositphotos —"no se renuevan y no vencen"— que acota el
      // costo y mata la ansiedad del comprador en una sola linea.
      title: "Un solo pago",
      note: "no es suscripción: no se renueva ni se te vuelve a cobrar, y los créditos no vencen",
    },
    {
      title: `${lifetime.credits} fotos para arrancar`,
      note: "1 crédito = 1 foto",
    },
    {
      title: `${lifetime.analysisCredits} análisis con IA`,
      note: "bolsa aparte de tus fotos",
    },
    {
      title: "Motor Nano Banana, el modelo de imagen de Google",
      note: "la dirección de arte y la fidelidad de tu producto las pone Vendí",
    },
    {
      title: "Todos los estilos profesionales, sin marca de agua",
      note: "alta resolución, listo para publicar",
    },
  ];

  const busy = pending === lifetime.id;
  const singleSet = hydrated && prefersReduced;

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <header className="flex items-center justify-between px-5 pt-4 sm:px-6 sm:pt-6">
        <span className="display-serif-italic text-lg text-ink">Vendí</span>
        {/*
          Unica salida ademas del pago. Va a /login (ruta publica), NUNCA a una
          ruta de (app): el que no pago no entra a la app por ningun camino.
        */}
        <button
          type="button"
          onClick={() => signOut({ redirectUrl: "/login" })}
          className="vd-onbg inline-flex min-h-[44px] items-center rounded-full px-3 text-xs font-medium transition-colors duration-150 ease-out hover:text-ink active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
        >
          Cerrar sesión
        </button>
      </header>

      {/*
        <main> a ancho COMPLETO: las dos filas de lluvia son hijas directas y
        sangran de borde a borde. Cada bloque de texto/card se centra con su
        propio wrapper (COLUMN). El body nunca scrollea de costado: el
        `.dashboard-shell` de AppBackground ya tiene overflow:hidden.
      */}
      <main className="flex-1 pb-12 pt-5 sm:pt-6">
        <div className={COLUMN}>
          <p className="eyebrow vd-onbg">Último paso</p>
          {/*
            Escala mobile en DOS escalones, no uno. A 375px (iPhone SE) el H1 va
            a 23px porque ahi el fold no perdona; a partir de 390px (el ancho del
            iPhone 14/15/16 base, que es el grueso del parque) vuelve a 26px. Sin
            el escalon del medio, o se apretaba de mas al 90% de los celulares o
            se caia el CTA en el SE.
          */}
          <h1 className="mt-2 text-[23px] leading-[1.12] text-ink min-[390px]:text-[26px] min-[390px]:leading-[1.1] sm:text-[32px]">
            {headline}
          </h1>
          {/*
            🔴 CONDICION DURA: este subhead TIENE que entrar en UNA linea. Cada
            linea de mas son ~21px y el presupuesto vertical del fold quedo con
            8px de aire. Por eso la copy es corta y cerrada — no la alargues.
          */}
          <p className="vd-onbg mt-2.5 text-sm leading-[1.5]">
            La foto que ya tenés, ahora profesional.
          </p>
        </div>

        {/*
          FILA A — ambiente. Chica, callada y sin titulo: no le compite al precio.
          El aria-label NO dice "que ya usan Vendí": con una sola venta en la
          historia eso seria afirmar 33 clientes que no existen. "Para los que
          sirve" dice lo mismo y es cierto.
        */}
        <RainRow
          className="mt-4"
          items={RUBROS_FILA_A}
          direction="left"
          quiet
          singleSet={singleSet}
          ariaLabel="Rubros para los que sirve Vendí"
        />

        <div className={cn(COLUMN, "mt-6")}>
          {/*
            El badge vive FUERA de la card a proposito: `.vd-plan-card > *` fuerza
            `position: relative` en cada hijo directo (asi el contenido queda sobre
            el halo), lo que anularia el `absolute` del badge. Este wrapper
            relativo le da el mismo anclaje sin pelearse con esa regla.
          */}
          <div className="relative">
            {/*
              DOS capas a proposito: el CENTRADO (-translate-x-1/2) vive en el
              wrapper y la ANIMACION en el span. Motion escribe `transform`
              inline, asi que animar el mismo nodo que lleva el translate de
              Tailwind lo pisaria y el badge quedaria corrido a la derecha.
            */}
            <div className="absolute -top-3 left-1/2 z-[2] -translate-x-1/2">
              <motion.span {...rise(0.26)} className="vd-plan-badge">
                Pase Fundador
              </motion.span>
            </div>

            <section className="glass-card vd-plan-card px-5 pb-5 pt-7 sm:px-6 sm:pb-6 sm:pt-8">
              {/* ── PRECIO ── lo primero que agarra el ojo. */}
              <motion.div
                {...noRise}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-2"
              >
                <p className="vd-price vd-price-gold text-ink">
                  {lifetime.usdBig}
                </p>
                {/*
                  "Pago único" y NO "S/0.65 por foto". Con el numero grande en
                  dolares aparece un riesgo que antes no existia: `US$10` en un
                  rubro 100% suscripcion se lee como `US$10/mes`. Esta capsula,
                  pegada al numero, es el unico lugar donde ese malentendido se
                  mata antes de nacer. El S/0.65 bajo al pie, no se perdio.
                */}
                <span className="vd-plan-capsule">Pago único</span>
              </motion.div>

              {/*
                ── BLOQUE DE COBRO ── el requisito duro de esta pantalla.
                Mercado Pago cobra SOLES, no dolares. Este bloque existe para que
                nadie llegue al checkout sorprendido: el monto real va en 16px
                BOLD, no en letra chica.
                ⚠️ `noRise` obligatorio: esto es informacion de PRECIO y aplica la
                misma regla que el precio y el CTA (framer-motion serializa
                `initial` en el HTML del server; con un initial que oculte, nace
                invisible).
                ⚠️ SIN `mt-3`: `.vd-plan-charge` ya trae su propio
                `margin-top: 12px`. Los dos valen 12px y los margins no se
                suman, asi que no habria bug — pero serian DOS fuentes de verdad
                para la misma separacion, y la que manda es la de Davinci.
              */}
              <motion.div {...noRise} className="vd-plan-charge">
                <p className="vd-plan-charge-line">
                  Se cobra{" "}
                  <b className="vd-plan-charge-amount numeric-tabular">
                    {lifetime.chargeLabel}
                  </b>{" "}
                  en Mercado Pago
                </p>
                <p className="vd-plan-charge-note">
                  {lifetime.usdBig} aprox. · {lifetime.credits} fotos +{" "}
                  {lifetime.analysisCredits} análisis con IA
                </p>
              </motion.div>

              <motion.div {...noRise} className="mt-4">
                <PillButton
                  size="lg"
                  className="vd-plan-cta w-full"
                  disabled={pending !== null}
                  aria-busy={busy}
                  onClick={() => startCheckout(lifetime.id)}
                >
                  {/*
                    El monto REAL en el texto del boton (15px bold, lo pone
                    `.vd-plan-cta`). Es la 2da de las 3 apariciones del S/ 39:
                    el ultimo cartel antes de irse a Mercado Pago.
                  */}
                  {busy ? "Redirigiendo…" : `Pagar ${lifetime.chargeLabel} y entrar`}
                </PillButton>

                {error ? (
                  <p className="mt-3 text-[13px] text-destructive" role="alert">
                    {error}
                  </p>
                ) : null}

                <p className="mt-3 text-[13px] leading-relaxed text-mute">
                  Pago seguro con Mercado Pago. Es un solo pago: no se renueva ni
                  se te vuelve a cobrar.
                </p>
              </motion.div>

              <hr className="vd-plan-rule my-5" />

              {/* ── QUÉ INCLUYE ── 6 beneficios, escalonados. */}
              <motion.ul
                variants={featuresContainer}
                initial="hidden"
                animate="show"
                className="space-y-2.5"
              >
                {features.map(({ title, note }) => (
                  <motion.li
                    key={title}
                    variants={featureItem}
                    className="flex gap-2.5"
                  >
                    <span className="vd-feat-check" aria-hidden="true">
                      <Check size={12} strokeWidth={3} />
                    </span>
                    <p className="min-w-0 text-[14px] leading-[1.45] text-ink">
                      <span className="font-semibold">{title}</span>{" "}
                      <span className="vd-feat-note">({note})</span>
                    </p>
                  </motion.li>
                ))}
              </motion.ul>

              {/*
                Letra chica del pie. 3ra y ultima aparicion del monto real, y el
                lugar donde vive el S/0.65 por foto que dejo la capsula.
              */}
              <p className="mt-5 text-[12px] leading-relaxed text-mute">
                {lifetime.perPhotoLabel} por foto · el cobro se hace en soles a
                través de Mercado Pago ({lifetime.chargeLabel}). Los créditos no
                vencen.
              </p>
            </section>
          </div>
        </div>

        {/* FILA B — la prueba visual "grande", ya sin competirle al precio. */}
        <RainRow
          className="mt-8"
          items={RUBROS_FILA_B}
          direction="right"
          eyebrow="Hecho para tu rubro"
          singleSet={singleSet}
          ariaLabel="Más rubros para los que sirve Vendí"
        />

        <div className={cn(COLUMN, "mt-2")}>
          <ExitPanel
            open={exitPanel}
            done={exitDone}
            otherValue={exitOther}
            reduceMotion={prefersReduced}
            onOpen={() => setExitPanel(true)}
            onOtherChange={setExitOther}
            onChoose={chooseExitReason}
            onBack={() => {
              setExitPanel(false);
              setExitDone(false);
              setExitOther("");
            }}
          />
        </div>
      </main>
    </div>
  );
}

/* ─────────────────────── La lluvia (prueba visual) ─────────────────────── */

type RainRowProps = {
  items: readonly Rubro[];
  direction: "left" | "right";
  /** Fila "quieta": mas chica y con opacity .8. La de ARRIBA de la card. */
  quiet?: boolean;
  /** Con movimiento reducido pintamos UN solo set (33 nodos) y sin animacion. */
  singleSet: boolean;
  eyebrow?: string;
  ariaLabel: string;
  className?: string;
};

/**
 * Marquee infinito de fotos por rubro.
 *
 * Tres detalles que NO son opcionales:
 *
 * 1. El track renderiza su set DUPLICADO. El loop es `translateX(-50%)`, asi que
 *    media pista tiene que ser exactamente un set; sin duplicar, salta.
 * 2. El 2do set va `aria-hidden` y con `alt=""`: si no, el lector de pantalla lee
 *    los 33 rubros dos veces.
 * 3. El espaciado lo pone `margin-inline-end` en cada card, NO `gap` en el track.
 *    Con `gap` + `-50%` sobra medio gap y el carrusel pega un saltito de ~9px en
 *    cada vuelta (bug real del CSS de la landing, cazado por Davinci).
 *
 * `<img>` plano y NO `next/image`: son 33 archivos fijos que no cambian nunca
 * (conviene optimizarlos en build, no por request), y con un `sizes` sin unidad
 * `vw` el `getWidths` de Next 16.2.6 emite 16 candidatos de srcset por imagen —
 * por 66 nodos es una barbaridad de markup en la pantalla que decide la venta.
 * `width`/`height` fijos + `loading="lazy"` + `decoding="async"` = cero CLS.
 */
function RainRow({
  items,
  direction,
  quiet,
  singleSet,
  eyebrow,
  ariaLabel,
  className,
}: RainRowProps) {
  const sets = singleSet ? [items] : [items, items];

  return (
    <section
      aria-label={ariaLabel}
      className={cn("vd-rain", quiet && "vd-rain--quiet", className)}
    >
      {eyebrow ? (
        <div className={COLUMN}>
          <p className="eyebrow vd-onbg">{eyebrow}</p>
        </div>
      ) : null}

      <div className={cn("vd-rain-marquee", eyebrow && "mt-3")}>
        <div
          className={cn(
            "vd-rain-track",
            !singleSet &&
              (direction === "left"
                ? "vd-rain-track--left"
                : "vd-rain-track--right"),
          )}
        >
          {sets.map((set, setIndex) =>
            set.map((rubro) => {
              const clone = setIndex === 1;
              return (
                <div
                  key={`${setIndex}-${rubro.slug}`}
                  className="vd-rain-card"
                  aria-hidden={clone || undefined}
                >
                  {/* El tag repite el alt de la foto: decorativo para el lector. */}
                  <span className="vd-rain-tag" aria-hidden="true">
                    {rubro.label}
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element -- 33 JPG estaticos de /public ya optimizados en build; next/image inflaria el srcset por 66 nodos. */}
                  <img
                    src={`/catalogo/${rubro.slug}.jpg`}
                    alt={clone ? "" : rubro.label}
                    width={400}
                    height={400}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                  />
                </div>
              );
            }),
          )}
        </div>
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
              className="vd-onbg inline-flex min-h-[44px] items-center rounded-full px-3 text-xs font-medium underline underline-offset-4 transition-colors duration-150 ease-out hover:text-ink active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
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
                  className="vd-onbg mt-3 inline-flex min-h-[44px] items-center rounded-full px-3 text-xs font-medium transition-colors duration-150 ease-out hover:text-ink active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
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
