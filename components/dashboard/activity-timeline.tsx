/** Lista cronológica de eventos (actor + mensaje + hora) sin card propia. */

import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ActivityEvent = {
  /** Identificador único para React key (ej UUID). */
  id: string;
  /**
   * Quién originó el evento:
   *  - `user`: la persona logueada (label "Vos"). Dot sage-strong.
   *  - `system`: la app/IA (label "Sistema"). Dot butter.
   */
  actor: "user" | "system";
  /**
   * Texto del evento (sin el label "Vos"/"Sistema" — eso lo agrega el comp).
   * Ej: `"descargaste 'Café fuerte medio' · v.1"`.
   */
  message: string;
  /** Hora ya formateada (ej "14:22" o "hace 2h"). */
  time: string;
  /**
   * Substring de `message` para resaltar con `.display-serif-italic`. Si está
   * presente y aparece dentro de `message`, lo extraemos y lo rendereamos en
   * Instrument Serif italic — toque editorial premium.
   */
  highlight?: string;
};

export type ActivityTimelineProps = {
  /** Eventos en orden cronológico (más reciente arriba, lo decide el caller). */
  events: ActivityEvent[];
  /** className passthrough sobre el contenedor `<ul>`. */
  className?: string;
};

/**
 * ActivityTimeline
 *
 * Lista vertical de eventos. SIN card propia — el caller la envuelve dentro
 * de una `<glass-card>`. Cada row tiene:
 *
 *  ●  Vos descargaste 'Café fuerte medio' · v.1                14:22
 *  ●  Sistema generó 4 variaciones                            hace 2h
 *  ●  Vos publicaste en Instagram                               09:30
 *
 * - Dot 8px a la izquierda (sage-strong / butter según actor).
 * - "Vos"/"Sistema" en bold + message regular. `highlight` (si matchea) se
 *   renderiza en serif italic.
 * - Hora a la derecha con `text-xs text-mute tabular-nums`.
 * - Gap-3 entre rows. Sin separadores — los dots crean ritmo visual.
 *
 * Server component puro.
 */
export function ActivityTimeline({ events, className }: ActivityTimelineProps) {
  if (!events || events.length === 0) {
    return (
      <p className={cn("text-sm text-mute", className)}>Sin actividad reciente.</p>
    );
  }

  return (
    <ul className={cn("flex flex-col gap-3", className)} role="list">
      {events.map((ev) => (
        <li
          key={ev.id}
          className="flex items-start gap-3"
        >
          {/* Dot — mt-1.5 para alinear ópticamente con la baseline del texto. */}
          <span
            aria-hidden
            className={cn(
              "mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full",
              ev.actor === "user" ? "bg-sage-strong" : "bg-butter",
            )}
          />

          {/* Texto + hora, flex row con space-between. min-w-0 para que el
              truncate/wrap del mensaje funcione en mobile angosto. */}
          <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
            <p className="min-w-0 text-sm leading-snug text-ink">
              <span className="font-semibold">
                {ev.actor === "user" ? "Vos" : "Sistema"}
              </span>{" "}
              <MessageWithHighlight
                message={ev.message}
                highlight={ev.highlight}
              />
            </p>
            <span className="numeric-tabular shrink-0 pt-0.5 text-xs text-mute">
              {ev.time}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Renderiza `message` y, si `highlight` matchea como substring, envuelve esa
 * porción en `<span className="display-serif-italic">`. Si no matchea (o no
 * hay highlight), devuelve el message tal cual.
 *
 * Diseño: matcheo case-sensitive y solo primera ocurrencia — más predecible
 * para los datos que pasan los agentes que un fuzzy match.
 */
function MessageWithHighlight({
  message,
  highlight,
}: {
  message: string;
  highlight?: string;
}): ReactNode {
  if (!highlight) return <>{message}</>;
  const idx = message.indexOf(highlight);
  if (idx === -1) return <>{message}</>;

  const before = message.slice(0, idx);
  const match = message.slice(idx, idx + highlight.length);
  const after = message.slice(idx + highlight.length);

  return (
    <Fragment>
      {before}
      <span className="display-serif-italic text-ink">{match}</span>
      {after}
    </Fragment>
  );
}
