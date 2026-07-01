"use client";

/** Compact product card for the catálogo grid — thumb 1/1 + nombre + métricas mínimas. */

import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export type ProductCardProps = {
  id: string;
  /** Nombre del producto. */
  name: string;
  /**
   * @deprecated No se renderiza más en la card chica. Mantenido en el type
   * para no romper imports existentes. La descripción ahora vive en el
   * detalle del producto, no en la grilla.
   */
  description?: string | null;
  /** URL de la imagen de portada. Si falta, gradient placeholder verde. */
  coverImageUrl?: string;
  /**
   * @deprecated No se muestra en la card chica (se removió la métrica de
   * fotos para reducir ruido). Se mantiene en el type para no romper
   * consumidores existentes.
   */
  imagesCount?: number;
  /** Cantidad de generaciones hechas sobre este producto. */
  generationsCount: number;
  /** Última actividad ya formateada (ej "hace 2 h"). Null si no hay actividad. */
  lastActivity?: string | null;
  /** Destino del link (típicamente `/productos/[id]`). */
  href: string;
  /** className passthrough sobre el wrapper. */
  className?: string;
};

/**
 * ProductCard
 *
 * Card de producto para el grid del catálogo. Thumbnail cuadrado 1/1 arriba +
 * body compacto con nombre y una línea breve de métricas
 * (`generaciones · última actividad`). Hover sube 2px con sombra más
 * pronunciada. Mismo treatment glass que `GenerationCard` para consistencia.
 *
 * Es "use client" porque envuelve el contenido en motion.div para el hover.
 */
export function ProductCard({
  name,
  coverImageUrl,
  generationsCount,
  lastActivity,
  href,
  className,
}: ProductCardProps) {
  const generationsLabel =
    generationsCount === 0
      ? "Sin generaciones"
      : `${generationsCount} ${generationsCount === 1 ? "generación" : "generaciones"}`;

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={cn(
        "group glass-card-compact glass-interactive overflow-hidden",
        className,
      )}
    >
      <Link
        href={href}
        className="flex flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-dark/40 rounded-[16px]"
      >
        {/* Thumbnail cuadrado 1/1 */}
        <div className="relative w-full aspect-square overflow-hidden">
          {coverImageUrl ? (
            <Image
              src={coverImageUrl}
              alt={name}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 320px"
              className="object-cover transition-transform duration-200 ease-out group-hover:scale-[1.02]"
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

        {/* Body compacto */}
        <div className="flex flex-col gap-1 px-3.5 py-3">
          <span
            className="truncate text-sm font-semibold tracking-[-0.01em] text-foreground"
            title={name}
          >
            {name}
          </span>

          <span className="card-caption">
            {generationsLabel}
            {lastActivity ? ` · ${lastActivity}` : null}
          </span>
        </div>
      </Link>
    </motion.div>
  );
}
