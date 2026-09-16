"use client";

/**
 * Pantalla de pago de Vendí — MITAD CLIENTE.
 *
 * Es el checkout de Whop EMBEBIDO (no un redirect a whop.com). El comprador
 * paga sin salir de vendilatam.com: a la izquierda el formulario que pone
 * Whop dentro de un iframe, a la derecha el resumen del pedido, que es
 * nuestro.
 *
 * ⚠️ REPARTO DE TAREAS — este archivo NO resuelve nada de servidor.
 * `page.tsx` (Integral) hace el trabajo server-side: auth de Clerk, resolver
 * el producto contra `lib/billing/catalog.ts` (fuente de verdad de precio y
 * créditos) y crear la checkout session en Whop. Acá sólo se pinta lo que
 * llega por props. El precio que se muestra es DISPLAY: el monto real lo fija
 * el `plan_...` de Whop, y quien acredita los créditos es el webhook
 * `/api/webhooks/whop`, nunca esta pantalla ni `/pago/resultado`.
 *
 * ⚠️ TEMA FIJO OSCURO — `data-theme="dark"` va en el contenedor raíz a
 * propósito, no se hereda del toggle del usuario. Identidad "Nube baja
 * flotante": al embed se le pide `theme="dark"` con un `backgroundColor`
 * fijo, así que si el host fuera claro tendríamos un recuadro negro flotando
 * en una página cream. Un solo tema = una sola pantalla coherente.
 * Los tokens `--vd-*` se redefinen por SELECTOR DE ATRIBUTO
 * (`[data-theme="dark"] { … }` en app/globals.css), no por `html`, así que
 * ponerlo en un div re-mapea toda la paleta de este subárbol.
 *
 * Regla de color de la casa: VERDE = interacción · DORADO = joya.
 */

import { useState, useSyncExternalStore } from "react";
import { WhopCheckoutEmbed } from "@whop/checkout/react";
import { Check, Lock, ShieldCheck, TriangleAlert } from "lucide-react";

export type PagarClientProps = {
  sessionId: string;
  product: {
    id: string;
    name: string;
    kind: "lifetime" | "pack";
    priceUsd: number;
    credits: number;
    analysisCredits: number;
  };
  email: string | null;
};

/* ────────────────────────────────────────────────────────────────────────────
   Colores que cruzan al iframe de Whop.

   🔴 ÚNICO lugar del archivo con hex literales, y es inevitable: el embed vive
   en un iframe de OTRO ORIGEN (whop.com). No puede leer `var(--card)` de
   nuestra hoja de estilos — las custom properties no cruzan el límite del
   iframe. Hay que mandarle el valor ya resuelto.

   Los dos valores son COPIA EXACTA de tokens de Davinci del bloque
   [data-theme="dark"] de app/globals.css. Si Davinci cambia el token, hay que
   cambiarlo acá también — no se sincronizan solos.
   ──────────────────────────────────────────────────────────────────────────── */

/** = `--card` en dark (charcoal levantado). Funde el iframe con el panel. */
const EMBED_BG = "#101310";
/** = `--vd-emerald` en dark. El VERDE de interacción: foco, links, submit. */
const EMBED_ACCENT = "#46c78d";
/**
 * Radio de las esquinas del embed, en px.
 * ⚠️ En dark el `--radius` de la app es 1rem (16px), no 0.75rem — ver reporte.
 * Se deja en 12 porque es el radio de los inputs del mockup; las cards
 * nuestras siguen con el radio que les da `.glass-card`.
 */
const EMBED_RADIUS = 12;

/**
 * `subscribe` de un valor que nunca cambia (el origin de la página). Va afuera
 * del componente para que su identidad sea estable entre renders.
 */
const nuncaCambia = () => () => {};

/** "10" si es entero, "9.50" si no. El catálogo hoy sólo tiene enteros. */
function formatUsd(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

/**
 * Parte el nombre para el two-tone del título: la última palabra es el acento
 * dorado ("Pase _Fundador_", "Pack _Pro_"). Si viene una sola palabra, va
 * entera como acento.
 */
function splitName(name: string): { lead: string; accent: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return { lead: "", accent: name.trim() };
  return { lead: parts.slice(0, -1).join(" "), accent: parts[parts.length - 1] };
}

/** Un beneficio del resumen. `num` se resalta en mono tabular. */
function Beneficio({
  num,
  children,
}: {
  num?: number;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-2.5 text-[13.5px] leading-snug text-ink">
      <span className="vd-feat-check" aria-hidden="true">
        <Check size={12} strokeWidth={3} />
      </span>
      <span className="pt-0.5">
        {num !== undefined ? (
          <>
            <span className="font-mono numeric-tabular">{num}</span>{" "}
          </>
        ) : null}
        {children}
      </span>
    </li>
  );
}

/**
 * Esqueleto del formulario mientras el iframe de Whop mide y monta.
 * Imita la forma real (botones de un toque → separador → filas de tarjeta)
 * para que no haya salto de layout cuando aparece el checkout de verdad.
 */
function CheckoutSkeleton() {
  return (
    <div className="min-h-[520px]">
      <p role="status" className="sr-only">
        Cargando el formulario de pago seguro…
      </p>
      <div
        className="animate-pulse space-y-2.5 motion-reduce:animate-none"
        aria-hidden="true"
      >
        <div className="h-[50px] rounded-[10px] bg-secondary" />
        <div className="h-[50px] rounded-[10px] bg-secondary" />
        <div className="h-[50px] rounded-[10px] border border-border bg-muted" />
        <div className="flex items-center gap-3.5 py-4">
          <div className="h-px flex-1 bg-border" />
          <div className="h-2 w-28 rounded-full bg-muted" />
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="h-[50px] rounded-[10px] bg-muted" />
        <div className="grid grid-cols-2 gap-2.5">
          <div className="h-[50px] rounded-[10px] bg-muted" />
          <div className="h-[50px] rounded-[10px] bg-muted" />
        </div>
        <div className="h-[50px] rounded-[10px] bg-muted" />
        <div className="h-14 rounded-full bg-secondary" />
      </div>
    </div>
  );
}

/**
 * Hueco de contenido que Paolo todavía no tiene (prueba social real, política
 * de devolución definida). Se dibuja MARCADO a propósito: preferimos un marco
 * punteado honesto antes que estrellas y testimonios inventados, que es
 * exactamente el anti-patrón que Adsioso documentó en 100ads.
 */
function Pendiente({
  tag,
  children,
}: {
  tag: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-gold/40 bg-gold/5 p-4">
      {/* ⚠️ El chip va con `.vd-plan-capsule`, NO con `.eyebrow text-gold`:
          `.eyebrow` fija `color: var(--vd-mute)` y vive en el MISMO
          @layer utilities que Tailwind pero más abajo en globals.css, así que
          a igual especificidad le gana a `text-gold` y el chip saldría gris.
          `.vd-plan-capsule` ya es dorada en dark y no pelea con nadie. */}
      <span className="vd-plan-capsule">{tag}</span>
      <div className="mt-2.5 text-[12.5px] leading-relaxed text-mute">
        {children}
      </div>
    </div>
  );
}

export function PagarClient({ sessionId, product, email }: PagarClientProps) {
  const [paymentError, setPaymentError] = useState<string | null>(null);

  /*
    returnUrl — a dónde vuelve el comprador después de un flujo de
    autorización externo (3DS, Yape, PagoEfectivo, redirects de banco).
    `/pago/resultado` vive FUERA del grupo (app) justo para que el paywall no
    la gatee: el que vuelve todavía no tiene la compra acreditada, porque eso
    lo hace el webhook y puede tardar.

    NEXT_PUBLIC_APP_URL está seteada en Vercel; `window.location.origin` es el
    bote salvavidas de dev. Va por `useSyncExternalStore` y no por
    useState+useEffect: el server snapshot devuelve null y el del cliente el
    origin real, así no hay mismatch de hidratación NI un setState dentro de un
    effect (que es lo que dispara renders en cascada y el eslint de React 19
    marca como error). Mientras no haya URL el embed no se monta, así el iframe
    se crea UNA sola vez y no se re-crea cuando la URL aparece.
  */
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const originDelBrowser = useSyncExternalStore(
    nuncaCambia,
    () => window.location.origin,
    () => null,
  );
  const baseUrl = configuredAppUrl ?? originDelBrowser;
  const returnUrl = baseUrl
    ? `${baseUrl.replace(/\/+$/, "")}/pago/resultado`
    : null;

  const esPase = product.kind === "lifetime";
  const precio = formatUsd(product.priceUsd);
  const porFoto =
    product.credits > 0 ? (product.priceUsd / product.credits).toFixed(2) : null;
  const { lead, accent } = splitName(product.name);

  const textoBoton = esPase
    ? `Quiero mis ${product.credits} fotos — US$${precio}`
    : `Comprar ${product.credits} fotos — US$${precio}`;

  return (
    <div
      data-theme="dark"
      /* `flex-1` + `min-h-dvh`: el <AppBackground> de page.tsx es un flex
         column que pinta el gradient del tema del USUARIO. Este contenedor lo
         tapa entero con la versión dark, así la pantalla se ve igual tenga el
         comprador el tema claro o el oscuro. */
      className="flex-1 min-h-dvh text-ink"
      /* `--bg-gradient` es el token de fondo de Davinci; en este subárbol
         resuelve a la "Nube baja" (verde abajo al centro + dorado arriba a la
         derecha). No hay utility de Tailwind para un gradient token, por eso
         va por style en vez de por clase. */
      style={{ background: "var(--bg-gradient)" }}
    >
      <div className="mx-auto w-full max-w-[1080px] px-5 pb-16">
        {/* ── barra superior ── */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 py-5">
          <p className="display-serif text-[26px] leading-none">
            Vend<span className="text-gold-glossy">í</span>
          </p>
          <span className="inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-1.5 text-xs text-mute">
            <Lock size={13} aria-hidden="true" />
            Pago protegido
          </span>
        </header>

        <div className="grid items-start gap-6 pt-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          {/*
            ── RESUMEN DEL PEDIDO ──
            Va PRIMERO en el DOM: en mobile el comprador tiene que saber qué
            está comprando antes de ver el formulario. En desktop `lg:order-2`
            lo manda a la derecha. No hay nada focusable adentro, así que el
            reordenamiento visual no rompe el orden de tabulación.
          */}
          <aside className="glass-card p-5 sm:p-6 lg:order-2">
            <p className="eyebrow">Tu pedido</p>

            <h1 className="display-serif mt-3 text-[27px] leading-[1.15] text-balance">
              {lead ? `${lead} ` : null}
              <span className="text-gold-glossy">{accent}</span>
            </h1>
            <p className="mt-1.5 text-[13px] text-mute">
              {esPase
                ? "Uno de los primeros 30. Se paga una sola vez."
                : "Recarga de créditos. Comprá los que quieras, cuando quieras."}
            </p>

            <div className="mt-5 flex flex-wrap items-baseline gap-2">
              <span className="card-value numeric-tabular font-mono text-[42px] leading-none text-ink">
                {precio}
              </span>
              <span className="text-[13px] text-mute/70">USD</span>
              {porFoto ? (
                <span className="vd-plan-capsule ml-auto">
                  US${porFoto} por foto
                </span>
              ) : null}
            </div>

            <p className="mt-3 text-[12.5px] leading-relaxed text-mute">
              {esPase ? (
                <>
                  {/*
                    🔴 SIN MONEDA A PROPÓSITO. Antes decía "S/ 40 a S/ 150 por
                    foto": soles peruanos. El ICP NO es peruano (decidido el
                    2026-08-23: MX/CO/AR + cobro internacional), y un comprador
                    mexicano o colombiano no sabe qué es "S/". El ancla en
                    múltiplos funciona en cualquier país y no hay que mantener
                    un tipo de cambio.
                  */}
                  Una sesión de fotos de producto te cuesta{" "}
                  <b className="font-semibold text-ink">
                    entre 10 y 40 veces esto
                  </b>
                  , y esperás una semana.
                </>
              ) : (
                <>
                  <b className="font-semibold text-ink">
                    {product.credits} fotos
                  </b>{" "}
                  alcanzan para renovar un catálogo entero.
                </>
              )}
            </p>

            <ul className="mt-5 grid list-none gap-2.5 p-0">
              <Beneficio num={product.credits}>fotos de tus productos</Beneficio>
              {product.analysisCredits > 0 ? (
                <Beneficio num={product.analysisCredits}>
                  análisis con IA de tu catálogo
                </Beneficio>
              ) : null}
              {esPase ? (
                <>
                  <Beneficio>Insignia de Fundador en tu cuenta</Beneficio>
                  <Beneficio>Me escribís a mí cuando algo falla</Beneficio>
                  <Beneficio>Ves lo nuevo antes que el resto</Beneficio>
                </>
              ) : (
                <Beneficio>Se suman a los que ya tenés</Beneficio>
              )}
              <Beneficio>Los créditos no vencen nunca</Beneficio>
              {esPase ? null : (
                <Beneficio>Pago único — no se renueva solo</Beneficio>
              )}
            </ul>

            <div className="mt-5">
              <Pendiente tag="Falta el contenido real">
                Acá van caras y frases de negocios que ya usan Vendí. Esto es lo
                que más empuja la compra — y es lo único de esta pantalla que no
                se puede inventar.
              </Pendiente>
            </div>
          </aside>

          {/* ── FORMULARIO DE PAGO ── */}
          <section className="glass-card p-5 sm:p-6 lg:order-1">
            <p className="text-[12.5px] leading-relaxed text-sage">
              Al correo que pongas abajo te mandamos el recibo y el aviso de que
              tus créditos ya entraron.
            </p>

            <div className="mt-4">
              <Pendiente tag="Falta el dato real">
                Acá va tu calificación y cuántos negocios ya compraron. Hasta
                tener el número de verdad el espacio queda vacío: no inventamos
                reseñas.
              </Pendiente>
            </div>

            <hr className="my-5 border-0 border-t border-border/50" />

            {paymentError ? (
              <div
                role="alert"
                className="mb-4 flex gap-3 rounded-xl border border-clay/40 bg-clay/10 p-4"
              >
                <TriangleAlert
                  size={18}
                  className="mt-0.5 shrink-0 text-clay"
                  aria-hidden="true"
                />
                <div>
                  <h2 className="text-[13.5px] font-semibold text-ink">
                    No se pudo cobrar
                  </h2>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-mute">
                    {paymentError} No se te cobró nada. Probá de nuevo o con
                    otro medio de pago.
                  </p>
                </div>
              </div>
            ) : null}

            {/*
              ── El checkout de Whop, embebido ──
              Cada prop de acá abajo está puesta a mano por una razón; leé el
              comentario antes de sacar alguna.
            */}
            {returnUrl ? (
              <WhopCheckoutEmbed
                /* Atribución: la session ya lleva { clerk_user_id, product_id }
                   como metadata, creada server-side. Es el reemplazo 1:1 del
                   `external_reference` de Mercado Pago. Sin esto el pago entra
                   y el webhook no sabe a quién acreditarle los créditos. */
                sessionId={sessionId}
                /* 🔴 El embed lo trae APAGADO de fábrica — al revés que el
                   checkout alojado de Whop. Sin esto el comprador peruano ve
                   dólares secos en vez de soles, y se pierden Yape y
                   PagoEfectivo como opciones naturales. Es el error más fácil
                   de cometer en esta integración. */
                adaptivePricing
                /* Si no, el iframe usa el idioma del navegador y un comprador
                   con Chrome en inglés ve el checkout en inglés. */
                locale="es"
                /* Vuelta de 3DS / Yape / PagoEfectivo / redirects de banco. */
                returnUrl={returnUrl}
                theme="dark"
                themeOptions={{
                  backgroundColor: EMBED_BG,
                  accentColor: EMBED_ACCENT,
                  borderRadius: EMBED_RADIUS,
                  buttonText: textoBoton,
                }}
                /* El email ya lo sabemos por Clerk: un campo menos que llenar
                   con el pulgar. El comprador igual lo puede editar. */
                prefill={email ? { email } : undefined}
                /* El error se queda puesto hasta que el pago salga bien (y ahí
                   el embed navega a `returnUrl`, así que la pantalla se va).
                   ⚠️ NO limpiarlo desde `onStateChange`: el estado vuelve a
                   "ready" apenas falla el cobro, así que el aviso se borraría
                   solo, antes de que el comprador alcance a leerlo. */
                onPaymentError={(error) => setPaymentError(error.message)}
                fallback={<CheckoutSkeleton />}
              />
            ) : (
              <CheckoutSkeleton />
            )}

            <hr className="my-5 border-0 border-t border-border/50" />

            <div className="flex gap-3 rounded-xl border border-dashed border-gold/40 bg-gold/5 p-4">
              <ShieldCheck
                size={18}
                className="mt-0.5 shrink-0 text-gold"
                aria-hidden="true"
              />
              <div>
                <span className="vd-plan-capsule">Falta definirla</span>
                <h2 className="mt-2 text-[13.5px] font-semibold text-ink">
                  Garantía
                </h2>
                <p className="mt-1 text-[12.5px] leading-relaxed text-mute">
                  Acá va la política de devolución. Queda sin escribir hasta que
                  esté decidida: la pregunta abierta es qué se devuelve cuando
                  el comprador ya gastó los créditos. Prometer algo que todavía
                  no podemos cumplir sale más caro que no prometer nada.
                </p>
              </div>
            </div>

            <ul className="mt-4 flex list-none flex-wrap justify-center gap-4 p-0 text-[11.5px] text-mute/80">
              <li>Pago único</li>
              <li>No se renueva</li>
              <li>Los créditos no vencen</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
