import { OUTPUT_RATIOS } from "@/lib/constants";
import type { Version } from "@/lib/versions/store";

/**
 * Catálogos de mood / ocasión / paleta — los conserva este módulo porque la UI
 * los seguía consumiendo desde acá. Quedan disponibles para que las pantallas
 * que refactorice el agente `frontend` puedan reutilizarlos al armar el prompt
 * en la versión.
 */
export const MOOD_OPTIONS = [
  { value: "minimalista", label: "Minimalista" },
  { value: "calido", label: "Cálido" },
  { value: "vibrante", label: "Vibrante" },
  { value: "editorial", label: "Editorial" },
  { value: "lifestyle", label: "Lifestyle" },
  { value: "nocturno", label: "Nocturno" },
] as const;

export const OCCASION_OPTIONS = [
  { value: "dia-a-dia", label: "Día a día" },
  { value: "salida", label: "Salida" },
  { value: "trabajo", label: "Trabajo" },
  { value: "deporte", label: "Deporte" },
  { value: "especial", label: "Especial" },
] as const;

export const PALETTE_OPTIONS = [
  { value: "#F8F4EC", label: "Blanco / crema" },
  { value: "#2B2A28", label: "Negro / gris" },
  { value: "#C56A4A", label: "Terracota" },
  { value: "#7B8A4F", label: "Oliva" },
  { value: "#D4A33B", label: "Mostaza" },
  { value: "#8B5A3C", label: "Terra" },
  { value: "#1F3B5B", label: "Azul profundo" },
  { value: "#F4C2C2", label: "Rosa pastel" },
  { value: "#A8D5BA", label: "Verde mint" },
] as const;

export type MoodValue = (typeof MOOD_OPTIONS)[number]["value"];
export type OccasionValue = (typeof OCCASION_OPTIONS)[number]["value"];

function ratioLabel(value: string): string {
  return OUTPUT_RATIOS.find((r) => r.value === value)?.label ?? value;
}

/**
 * Arma un prompt en español natural a partir de una `Version`.
 *
 * El brief acumulado del recorrido viejo (mood / paleta / ocasión / variations)
 * ya no vive como datos estructurados en el cliente — el usuario lo escribe
 * libremente en `version.user_prompt`. Esta función conserva su rol de
 * "scaffold" devolviendo un prompt base si el usuario no escribió todavía,
 * combinando los datos estructurados que sí siguen viviendo en la versión:
 * cantidad de variaciones, ratio y existencia de referencias.
 */
export function buildPromptFromBrief(version: Version): string {
  // Si el usuario ya escribió algo a mano, no lo pisamos: devolvemos lo suyo.
  if (version.user_prompt.trim().length > 0) {
    return version.user_prompt;
  }

  const count = version.variations_default;
  const variations = `${count} ${count === 1 ? "imagen" : "imágenes"}`;
  const ratio = ratioLabel(version.output_ratio).toLowerCase();

  const sentences: string[] = [
    `Generá ${variations} de mi producto en formato ${ratio} (${version.output_ratio}).`,
  ];

  if (version.reference_images.length > 0) {
    sentences.push("Tomá inspiración de las referencias adjuntas.");
  }

  return sentences.join(" ");
}
