/** Círculo con iniciales — para activity timeline, user menus, etc. */

import { cn } from "@/lib/utils";

export type AvatarCircleProps = {
  /** Iniciales — máximo 2 letras. Se uppercase y trunca defensivamente. */
  initials: string;
  /** Tamaño en px (alto y ancho iguales). Default 40. */
  size?: number;
  /** className passthrough. */
  className?: string;
  /** Label accesible para lectores de pantalla (ej "Avatar de Paola"). */
  ariaLabel?: string;
};

/**
 * AvatarCircle
 *
 * Círculo sólido con 1-2 letras. Light y dark mode se manejan vía CSS vars:
 *
 *  - LIGHT: bg `--vd-pill-bg` (verde-oscuro profundo) + texto `--vd-pill-fg`
 *           (cream). El border es champagne apenas visible.
 *  - DARK:  bg `--vd-pill-bg` (que en dark = cream luminoso) + texto
 *           `--vd-pill-fg` (= deep forest). El swap es automático porque
 *           las CSS vars ya invierten en dark.
 *
 * Ambas variantes obtienen la "definición premium" gracias a un border sutil
 * butter al 30% que aporta el ring metálico characteristic de la paleta.
 *
 * Decisión visual: la font-size escala con el tamaño según `size * 0.4`.
 * Para 40px → 16px, para 56px → 22px, para 28px → 11px. Mantiene
 * proporciones tipográficas correctas sin necesidad de prop extra.
 */
export function AvatarCircle({
  initials,
  size = 40,
  className,
  ariaLabel,
}: AvatarCircleProps) {
  // Defensivo: tomamos máximo 2 caracteres, los uppercase, y filtramos
  // espacios/símbolos para no terminar mostrando "P " con espacio raro.
  const safe = initials.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase();
  const fontSize = Math.round(size * 0.4);

  return (
    <span
      role="img"
      aria-label={ariaLabel ?? `Avatar ${safe}`}
      className={cn(
        "inline-flex select-none items-center justify-center rounded-full",
        "bg-pill-bg text-pill-fg font-semibold",
        // Border butter al ~30% para extra definición premium. En dark
        // queda aún más visible por el contraste con el cream interior.
        "border border-butter/30",
        // Sombra de contacto MUY sutil — el avatar "se apoya" en la card.
        "shadow-[0_1px_2px_rgba(15,31,22,0.12)]",
        className,
      )}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        fontSize: `${fontSize}px`,
        lineHeight: 1,
      }}
    >
      {safe}
    </span>
  );
}
