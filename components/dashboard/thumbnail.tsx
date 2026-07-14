import { cn } from "@/lib/utils";

/**
 * Thumbnail — placeholder estético de packshot.
 *
 * Cuando un producto no tiene foto real cargada todavía (o queremos
 * mostrar un mock de "cómo va a verse"), renderizamos un gradient
 * por tono que sugiere un objeto sobre superficie. NO es decorativo
 * puro: comunica que hay un slot pensado para una imagen.
 *
 * Anatomía:
 *   - Background = linear-gradient vertical bg→bg→mid (superficie)
 *   - Centro = forma orgánica con radial-gradient mid→dark (objeto)
 *   - Base = elipse blur (sombra de contacto del objeto)
 *
 * Tonos disponibles (curados desde el handoff v2):
 *   sage, butter, paper, clay, mineral, editorial, champagne
 *
 * Cada tono usa 3 colores (bg/mid/dark) elegidos para evocar una
 * paleta editorial — sin chillar, complementando la cream del card.
 *
 * El componente es presentacional puro (no hay state, no fetch).
 * Apto para Server Components.
 */

export type ThumbnailTone =
  | "sage"
  | "butter"
  | "paper"
  | "clay"
  | "mineral"
  | "editorial"
  | "champagne";

export type ThumbnailProps = {
  /** Tono de la paleta (default: sage). */
  tone?: ThumbnailTone;
  /** Radio del contenedor en px (default: 8). */
  radius?: number;
  /** Label opcional sobre la esquina superior izquierda. */
  label?: string;
  /** Clase utility passthrough. */
  className?: string;
};

type TonePalette = {
  bg: string;
  mid: string;
  dark: string;
};

const TONES: Record<ThumbnailTone, TonePalette> = {
  sage: { bg: "#D8E2D2", mid: "#B3C7AC", dark: "#5A6F58" },
  butter: { bg: "#F3E6BD", mid: "#E5C880", dark: "#9C7E33" },
  paper: { bg: "#EFE8D2", mid: "#C9BC93", dark: "#6B5F37" },
  clay: { bg: "#E9CCB9", mid: "#D4A283", dark: "#7A4128" },
  mineral: { bg: "#E8DFC8", mid: "#C9BC93", dark: "#5A6F58" },
  editorial: { bg: "#C7D0A8", mid: "#8C9870", dark: "#3D4B27" },
  champagne: { bg: "#EDD7AE", mid: "#D4A85F", dark: "#7C5318" },
};

export function Thumbnail({
  tone = "sage",
  radius = 8,
  label,
  className,
}: ThumbnailProps) {
  const palette = TONES[tone];

  return (
    <div
      className={cn("relative h-full w-full overflow-hidden", className)}
      style={{
        borderRadius: radius,
        background: `linear-gradient(180deg, ${palette.bg} 0%, ${palette.bg} 62%, ${palette.mid} 100%)`,
        boxShadow: "0 4px 14px -8px rgba(15, 31, 22, 0.35)",
      }}
    >
      {/* Forma orgánica central — sugiere un objeto sobre superficie. */}
      <div
        className="absolute left-1/2 top-[54%] -translate-x-1/2 -translate-y-1/2"
        style={{
          width: "38%",
          height: "54%",
          borderRadius: "46% 46% 38% 38%",
          background: `radial-gradient(ellipse at 35% 30%, ${palette.mid} 0%, ${palette.dark} 80%)`,
          boxShadow: `0 16px 28px -8px ${palette.dark}55`,
        }}
      />
      {/* Sombra de contacto — elipse blureada en la base del objeto. */}
      <div
        className="absolute bottom-[12%] left-1/2 -translate-x-1/2 blur-[2px]"
        style={{
          width: "46%",
          height: 8,
          borderRadius: "50%",
          background: `radial-gradient(ellipse at center, ${palette.dark}66 0%, transparent 70%)`,
        }}
      />
      {label && (
        <span className="absolute left-2 top-2 rounded-[4px] bg-[rgba(15,31,22,0.7)] px-[7px] py-[3px] text-[9.5px] font-semibold uppercase tracking-[0.3px] text-[#F0F4E7]">
          {label}
        </span>
      )}
    </div>
  );
}
