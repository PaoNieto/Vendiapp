"use client";

/** Card horizontal para listar versiones de un producto en su detalle. */

import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";
import { Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export type VersionCardRatio = "1:1" | "4:5" | "9:16" | "16:9";

export type VersionCardProps = {
  id: string;
  /** Nombre de la versión (ej "Verano 25", "Holiday"). */
  name: string;
  /** Descripción opcional — si está, se muestra debajo del nombre con line-clamp-1. */
  description?: string | null;
  /** Cantidad de referencias visuales cargadas en la versión. */
  referencesCount: number;
  /** Cantidad de generaciones hechas en esta versión. */
  generationsCount: number;
  /** Última actividad ya formateada (ej "hace 2 h"). Null si no hay actividad. */
  lastActivity?: string | null;
  /** Aspect ratio de la versión. */
  ratio: VersionCardRatio;
  /** Destino del link — típicamente `/productos/[id]/versiones/[versionId]`. */
  href: string;
  /** Cover opcional (primera ref o primera generación). Si falta, placeholder verde. */
  thumbnailUrl?: string;
  /**
   * Callback de "Duplicar versión". Si se provee, se renderiza un botón
   * sutil en bottom-right de la card. Si no, no se renderiza nada (la
   * card sigue funcionando como link puro).
   *
   * El botón vive **por encima** del `<Link>` (z-index + stopPropagation)
   * para no disparar la navegación del link al hacer click.
   */
  onDuplicate?: () => void;
  /** className passthrough sobre el wrapper. */
  className?: string;
};

/**
 * VersionCard
 *
 * Card HORIZONTAL para listar las versiones de un producto. A diferencia de
 * `ProductCard` (vertical, con thumb arriba), acá el thumb es chico y va a la
 * izquierda + texto a la derecha. Pensado para una lista vertical compacta en
 * el detalle de producto.
 *
 * Layout responsive:
 *   - Mobile (< 640px): thumb 80x80
 *   - Desktop (≥ 640px): thumb 96x96
 *
 * Hover desplaza 2px a la derecha (sutil — sugiere "entrá") + sombra más
 * pronunciada. min-h-[88px] para touch target cómodo en mobile.
 *
 * Acción "Duplicar" (si `onDuplicate` está): botón circular en bottom-right
 * del wrapper, por encima del `<Link>` via `z-index`. `stopPropagation` evita
 * que el click burbujee al link (y `preventDefault` evita la navegación si el
 * link contiene el botón en su árbol DOM por accidente).
 */
export function VersionCard({
  name,
  description,
  referencesCount,
  generationsCount,
  lastActivity,
  ratio,
  href,
  thumbnailUrl,
  onDuplicate,
  className,
}: VersionCardProps) {
  // Partes de la línea de métricas — se filtran las que no tienen valor para
  // no terminar con un " · null" feo si falta lastActivity.
  const metricsParts: string[] = [
    `${generationsCount} ${generationsCount === 1 ? "generación" : "generaciones"}`,
    `${referencesCount} ${referencesCount === 1 ? "ref" : "refs"}`,
    `ratio ${ratio}`,
  ];
  if (lastActivity) metricsParts.push(lastActivity);

  function handleDuplicateClick(e: React.MouseEvent<HTMLButtonElement>) {
    // Cortar el burbujeo para que el `<Link>` no dispare navegación.
    e.preventDefault();
    e.stopPropagation();
    onDuplicate?.();
  }

  return (
    <motion.div
      whileHover={{ x: 2 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={cn(
        "group relative glass-card-compact overflow-hidden hover:shadow-[0_18px_40px_rgba(15,40,24,0.18),inset_0_1px_0_rgba(255,255,255,0.6)]",
        className,
      )}
    >
      <Link
        href={href}
        className="flex min-h-[88px] items-center gap-3 p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-dark/40 rounded-[16px] sm:gap-4 sm:p-3"
      >
        {/* Thumb cuadrado — 80px mobile, 96px desktop. shrink-0 para que el
            texto a la derecha tome el restante sin empujarlo fuera. */}
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[12px] sm:h-24 sm:w-24">
          {thumbnailUrl ? (
            <Image
              src={thumbnailUrl}
              alt={name}
              fill
              sizes="(max-width: 640px) 80px, 96px"
              className="object-cover transition-transform duration-200 ease-out group-hover:scale-[1.03]"
            />
          ) : (
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(135deg, var(--color-green-bg-start) 0%, var(--color-green-bg-mid) 50%, var(--color-green-bg-end) 100%)",
              }}
            />
          )}
        </div>

        {/* Contenido textual a la derecha. min-w-0 es load-bearing para que
            truncate/line-clamp funcionen dentro del flex container. Reservamos
            pr-12 cuando hay botón Duplicar para no chocar con el icono. */}
        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col gap-0.5 pr-2",
            onDuplicate && "pr-10 sm:pr-12",
          )}
        >
          <span
            className="truncate text-base font-medium text-green-dark"
            title={name}
          >
            {name}
          </span>

          {description ? (
            <p className="line-clamp-1 text-xs text-green-text">
              {description}
            </p>
          ) : null}

          <span className="truncate text-xs text-green-text">
            {metricsParts.join(" · ")}
          </span>
        </div>
      </Link>

      {/* Botón Duplicar — vive POR ENCIMA del Link via z-10. stopPropagation
          evita que el click burbujee al `<Link>` padre. Tamaño cumple 44x44
          (toque mobile) sin invadir el contenido. */}
      {onDuplicate ? (
        <button
          type="button"
          onClick={handleDuplicateClick}
          aria-label="Duplicar versión"
          title="Duplicar versión"
          className={cn(
            "absolute bottom-2 right-2 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full",
            "border border-border bg-card-cream/80 text-green-dark backdrop-blur-sm",
            "opacity-0 transition-all duration-150",
            "hover:bg-card-cream hover:shadow-md",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-dark/40 focus-visible:opacity-100",
            // Visible en hover/focus de la card o tap mobile (always visible
            // en touch via no-hover media query).
            "group-hover:opacity-100",
            "max-[640px]:opacity-100",
          )}
        >
          <Copy className="h-4 w-4" strokeWidth={1.8} />
        </button>
      ) : null}
    </motion.div>
  );
}
