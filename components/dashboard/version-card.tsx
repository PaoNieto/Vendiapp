"use client";

/** Card horizontal para listar versiones de un producto en su detalle. */

import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export type VersionCardRatio = "1:1" | "4:5" | "9:16" | "16:9";

/** Cantidad máxima de miniaturas que se muestran en la tira inline. */
const MAX_THUMBS = 4;

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
  /** Destino del link — `/fabrica/[versionId]` si hay imágenes, setup si es borrador. */
  href: string;
  /** Cover opcional (primera ref o primera generación). Si falta, placeholder verde. */
  thumbnailUrl?: string;
  /**
   * URLs de las imágenes GENERADAS de la versión, para una mini-galería inline.
   * Si tiene ≥1, se renderiza una tira de miniaturas debajo de las métricas.
   */
  imageUrls?: string[];
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
 * Mini-galería: cuando `imageUrls` trae imágenes generadas, se muestra una tira
 * horizontal de hasta 4 miniaturas cuadradas debajo de la línea de métricas. Si
 * hay más, la última posición muestra un chip "+N". El thumb cover de la
 * izquierda ya muestra la primera generada, así que la tira arranca desde la
 * segunda para no repetir.
 *
 * La card entera es un link puro hacia `href`.
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
  imageUrls,
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

  // La tira arranca desde la 2da imagen: la 1ra ya vive en el thumb cover de la
  // izquierda, así evitamos que se vea redundante. Si solo hay 1 generada, no
  // hay tira (ya está representada por el cover).
  const galleryUrls = (imageUrls ?? []).slice(1);
  const hasGallery = galleryUrls.length > 0;
  const visibleThumbs = galleryUrls.slice(0, MAX_THUMBS);
  const overflowCount = galleryUrls.length - visibleThumbs.length;

  return (
    <motion.div
      whileHover={{ x: 2 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={cn(
        "group relative glass-card-compact glass-interactive overflow-hidden",
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
            truncate/line-clamp funcionen dentro del flex container. */}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 pr-2">
          <span
            className="truncate text-base font-semibold tracking-[-0.01em] text-foreground"
            title={name}
          >
            {name}
          </span>

          {description ? (
            <p className="line-clamp-1 text-xs text-ink-soft">
              {description}
            </p>
          ) : null}

          <span className="card-caption mt-0.5 truncate">
            {metricsParts.join(" · ")}
          </span>

          {/* Mini-galería de imágenes generadas. Tira horizontal compacta; en
              mobile hace scroll-x sutil sin desbordar la card (min-w-0 +
              overflow-x-auto). Cada thumb ~40px cuadrado, premium y discreto. */}
          {hasGallery ? (
            <div className="-mx-0.5 mt-1.5 flex gap-1.5 overflow-x-auto px-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {visibleThumbs.map((url, i) => {
                const isLastVisible = i === visibleThumbs.length - 1;
                const showOverflow = isLastVisible && overflowCount > 0;
                return (
                  <div
                    key={`${url}-${i}`}
                    className="relative h-10 w-10 shrink-0 overflow-hidden rounded-[8px] border border-border/70 bg-card-cream/40"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`Generación de ${name}`}
                      className="h-full w-full object-cover"
                    />
                    {showOverflow ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-[rgba(15,31,22,0.62)] text-[11px] font-semibold text-white">
                        +{overflowCount}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </Link>
    </motion.div>
  );
}
