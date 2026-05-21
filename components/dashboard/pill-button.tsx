/** Premium pill-shaped primary button (green-dark bg + champagne text). */

import {
  cloneElement,
  isValidElement,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

export type PillButtonSize = "sm" | "md" | "lg";

type CommonProps = {
  /** Pill size. `md` is the brief default. */
  size?: PillButtonSize;
  /** Optional className passthrough. */
  className?: string;
};

type AsButtonProps = CommonProps &
  Omit<ComponentPropsWithoutRef<"button">, "className"> & {
    asChild?: false;
    children: ReactNode;
  };

type AsChildProps = CommonProps & {
  /**
   * When true, renders no wrapper element — clones the single child element
   * and forwards the pill className onto it. Use for `<Link>` from next/link.
   */
  asChild: true;
  /** A single ReactElement that accepts `className`. */
  children: ReactElement<{ className?: string }>;
};

export type PillButtonProps = AsButtonProps | AsChildProps;

const sizeClasses: Record<PillButtonSize, string> = {
  // 6px 12px / 12px font. NB: bajo 44px de alto — usar en contextos no-touch.
  sm: "px-3 py-1.5 text-xs",
  // 9px 16px / 13px font (brief default). min-h 44px para touch target.
  md: "px-4 py-2 text-[13px] min-h-[44px]",
  // 12px 20px / 14px font. min-h 44px para touch target.
  lg: "px-5 py-3 text-sm min-h-[44px]",
};

const baseClasses =
  "inline-flex items-center justify-center gap-2 rounded-full bg-green-dark text-champagne font-medium transition-all duration-150 ease-out shadow-[0_4px_12px_rgba(15,40,24,0.18)] hover:bg-green-dark/90 hover:shadow-[0_6px_16px_rgba(15,40,24,0.24)] active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-dark/40 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:opacity-50 disabled:pointer-events-none";

/**
 * PillButton
 *
 * Botón premium en forma de píldora. Por defecto renderiza `<button>`. Si
 * pasás `asChild` y un único `<Link>` (u otro ReactElement con `className`)
 * como hijo, clona el child y le inyecta la className.
 *
 * @example
 * <PillButton onClick={...}>Crear pieza</PillButton>
 * <PillButton asChild size="lg"><Link href="/fabrica">Empezar</Link></PillButton>
 */
export function PillButton(props: PillButtonProps) {
  const size = props.size ?? "md";
  const merged = cn(baseClasses, sizeClasses[size], props.className);

  if (props.asChild) {
    if (!isValidElement<{ className?: string }>(props.children)) {
      return <span className={merged}>{props.children}</span>;
    }
    return cloneElement(props.children, {
      className: cn(merged, props.children.props.className),
    });
  }

  // Quitamos del payload las props ya consumidas (size/className/asChild) y
  // forwardeamos el resto al `<button>` nativo.
  const {
    size: _s,
    className: _c,
    asChild: _a,
    ...rest
  } = props;
  void _s;
  void _c;
  void _a;
  return (
    <button type="button" className={merged} {...rest} />
  );
}
