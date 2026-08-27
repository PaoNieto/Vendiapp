import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Topbar — header reusable para cada pantalla del app interno.
 *
 * Anatomía (handoff Cuaderno v2):
 *   ┌─────────────────────────────────────────────────────────┐
 *   │  EYEBROW (opcional, uppercase, eyebrow-on-bg)           │
 *   │  Título h1 38px serif italic                            │
 *   │  Subtítulo opcional 14px text-mute-on-bg     [right →]  │
 *   └─────────────────────────────────────────────────────────┘
 *
 * - NO tiene background propio: vive sobre el body gradient sage.
 * - El padding generoso (28px 40px 16px) le da respiración editorial.
 * - El slot `right` típicamente lleva un CTA primario (PillButton) +
 *   AvatarCircle. Acepta cualquier ReactNode.
 *
 * Es Server Component por default (no hay state ni handlers). Si la
 * página consumidora necesita interactividad en `right`, puede pasar
 * un Client Component como prop sin problemas.
 */
export type TopbarProps = {
  /** Eyebrow opcional sobre el título — uppercase tracked. */
  eyebrow?: string;
  /** Título principal — se renderiza en serif italic 38px. */
  title: string;
  /**
   * Palabra/frase "clave" opcional que se renderiza DESPUÉS del título en
   * dorado glossy (`.text-gold-glossy`) para el juego de dos tonos estilo
   * "Estilo Visual". Aditivo: si no se pasa, el título va monótono. En light
   * la palabra hereda el color del título (el dorado es sólo dark, por marca).
   */
  titleAccent?: string;
  /** Subtítulo / breadcrumb debajo del título. */
  subtitle?: string;
  /** Slot derecha — típicamente CTA + Avatar. */
  right?: ReactNode;
  /** Override de className en el contenedor. */
  className?: string;
};

export function Topbar({
  eyebrow,
  title,
  titleAccent,
  subtitle,
  right,
  className,
}: TopbarProps) {
  return (
    <header
      className={cn(
        // Padding más generoso que un header normal — el handoff pide
        // 28px top, 40px lados, 16px bottom para crear respiración.
        // En mobile (no hay sidebar) bajamos los lados a 20px.
        "flex items-end justify-between gap-6 px-5 pb-4 pt-7 lg:px-10",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <div className="eyebrow eyebrow-on-bg mb-1.5">{eyebrow}</div>
        )}
        {/*
          h1 hereda font-display italic del @layer base. Override de
          tamaño: 32px mobile → 38px desktop. letter-spacing -0.02em
          ya viene heredado.
        */}
        <h1 className="text-[32px] leading-[1.05] text-foreground sm:text-[38px]">
          {title}
          {titleAccent ? (
            <>
              {title ? " " : null}
              <span className="text-gold-glossy">{titleAccent}</span>
            </>
          ) : null}
        </h1>
        {subtitle && (
          <p className="mt-1.5 max-w-xl text-sm font-medium text-mute-on-bg">
            {subtitle}
          </p>
        )}
      </div>
      {right && (
        <div className="flex shrink-0 items-center gap-3">{right}</div>
      )}
    </header>
  );
}
