"use client";

/** Botón hero gigante para LA acción dominante de una pantalla (ej "+ Nueva Versión"). */

import {
  cloneElement,
  isValidElement,
  type MouseEventHandler,
  type ReactElement,
  type ReactNode,
} from "react";
import { motion } from "motion/react";
import { Plus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type HeroCTAButtonProps = {
  /** Texto / contenido del botón (típicamente el label del CTA). */
  children: ReactNode;
  /** Icon a la izquierda. Default: `Plus`. */
  icon?: LucideIcon;
  /**
   * Si `true`, clona el único hijo (típicamente `<Link>`) y le inyecta la
   * className + el contenido — no renderiza wrapper propio. Usar para que
   * el área clickeable sea la del link entero.
   */
  asChild?: boolean;
  /** Handler `onClick`. Ignorado si `asChild` es true (el Link maneja la nav). */
  onClick?: MouseEventHandler<HTMLButtonElement>;
  /** className passthrough. */
  className?: string;
};

/**
 * Clases base del botón hero — más imponente que un PillButton:
 *   - Padding generoso (`px-6 py-5`) y texto 16-18px.
 *   - `rounded-2xl` en vez de pill (forma más cuadrada, sensación premium).
 *   - Gradient sutil verde-dark + highlight champagne en hover.
 *   - Sombra fuerte para que "flote" sobre la página.
 *   - Hover scale 1.01, active 0.99 — apenas perceptible, no agresivo.
 *
 * Diferencia con PillButton: usar SOLO cuando hay UNA acción dominante en la
 * pantalla. Si hay 2 CTAs equivalentes, ambos deberían ser PillButton.
 */
const heroBase =
  "cta-emerald relative inline-flex items-center justify-center gap-3 rounded-2xl px-6 py-5 text-base font-medium text-primary-foreground transition-shadow duration-200 ease-out shadow-[0_12px_32px_rgba(15,40,24,0.24)] hover:shadow-[0_18px_44px_rgba(15,40,24,0.32)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:focus-visible:ring-[color:var(--vd-emerald)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:opacity-50 disabled:pointer-events-none sm:text-[17px]";

// Background sólido del token primary — se invierte automáticamente en dark
// (forest en light, cream en dark). Mantiene contraste correcto con
// primary-foreground en ambos modos.
const heroBackground =
  "bg-primary hover:bg-primary/90";

// Motion props compartidos entre la versión button y la asChild — scale sutil
// en hover/tap, easing rápido para que se sienta "responsivo" no "lento".
const motionProps = {
  whileHover: { scale: 1.01 },
  whileTap: { scale: 0.99 },
  transition: { duration: 0.15, ease: "easeOut" as const },
};

/**
 * HeroCTAButton
 *
 * Botón "este es EL botón de la pantalla". Más grande, más imponente y con
 * sombra más fuerte que `PillButton`. Pensado para CTAs dominantes únicos
 * (ej "+ Nueva Versión" en el detalle de producto).
 *
 * @example
 * <HeroCTAButton onClick={...}>+ Nueva Versión</HeroCTAButton>
 *
 * @example
 * <HeroCTAButton asChild>
 *   <Link href="/productos/123/versiones/nueva">+ Nueva Versión</Link>
 * </HeroCTAButton>
 */
export function HeroCTAButton({
  children,
  icon: Icon = Plus,
  asChild = false,
  onClick,
  className,
}: HeroCTAButtonProps) {
  const merged = cn(heroBase, heroBackground, className);

  const inner = (
    <>
      <Icon className="h-6 w-6 shrink-0" aria-hidden />
      <span className="truncate">{children}</span>
    </>
  );

  if (asChild) {
    if (!isValidElement<{ className?: string; children?: ReactNode }>(children)) {
      // Fallback defensivo — si asChild=true pero el children no es un
      // ReactElement válido, lo envolvemos en un span estilado para no
      // romper la UI.
      return <span className={merged}>{children}</span>;
    }
    const child = children as ReactElement<{
      className?: string;
      children?: ReactNode;
    }>;
    const cloned = cloneElement(child, {
      className: cn(merged, child.props.className),
      children: (
        <>
          <Icon className="h-6 w-6 shrink-0" aria-hidden />
          <span className="truncate">{child.props.children}</span>
        </>
      ),
    });
    return (
      <motion.div
        {...motionProps}
        className="inline-flex"
      >
        {cloned}
      </motion.div>
    );
  }

  return (
    <motion.button
      type="button"
      onClick={onClick}
      className={merged}
      {...motionProps}
    >
      {inner}
    </motion.button>
  );
}
