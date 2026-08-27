"use client";

/** Compact recent-generation card with thumbnail + status badge + metadata. */

import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { StatusBadge, type StatusBadgeStatus } from "./status-badge";

export type GenerationCardRatio = "1:1" | "4:5" | "9:16" | "16:9";

export type GenerationCardProps = {
  id: string;
  /** Nombre del proyecto al que pertenece la generación. */
  projectName: string;
  /** Aspect ratio de la pieza. */
  ratio: GenerationCardRatio;
  /** Estado de la generación. */
  status: StatusBadgeStatus;
  /** Cantidad de variaciones generadas. */
  variations: number;
  /** Tiempo relativo legible (ej: "hace 2 min"). */
  relativeTime: string;
  /** URL del thumbnail. Si no se pasa, se renderiza placeholder verde. */
  thumbnailUrl?: string;
  /** Destino del link (detalle de la generación). */
  href: string;
  /** className passthrough sobre el Link. */
  className?: string;
};

/**
 * GenerationCard
 *
 * Card chica para la grilla "Generaciones recientes". Thumbnail 4/5 arriba +
 * StatusBadge absolute bottom-left + body con título y metadata. Hover sube
 * 2px con sombra más pronunciada.
 */
export function GenerationCard({
  projectName,
  ratio,
  status,
  variations,
  relativeTime,
  thumbnailUrl,
  href,
  className,
}: GenerationCardProps) {
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
        {/* Thumbnail 4/5 */}
        <div className="relative w-full aspect-[4/5] overflow-hidden">
          {thumbnailUrl ? (
            <Image
              src={thumbnailUrl}
              alt={projectName}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px"
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

          <div className="absolute bottom-3 left-3">
            <StatusBadge status={status} size="sm" />
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-1 px-3.5 py-3">
          <span
            className="truncate text-sm font-semibold tracking-[-0.01em] text-foreground"
            title={projectName}
          >
            {projectName}
          </span>
          <span className="card-caption">
            {variations} var · {ratio} · {relativeTime}
          </span>
        </div>
      </Link>
    </motion.div>
  );
}
