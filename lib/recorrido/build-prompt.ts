import { OUTPUT_RATIOS } from "@/lib/constants";
import type { RecorridoState } from "@/lib/recorrido/store";

/**
 * Catálogos sincronizados con la Estación 03 (Estilo).
 * Si cambian las opciones visibles, actualizá también estos arrays para que
 * el prompt natural use las etiquetas correctas en español.
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

function moodLabel(value: string | null): string | null {
  if (!value) return null;
  return MOOD_OPTIONS.find((m) => m.value === value)?.label ?? null;
}

function occasionLabel(value: string | null): string | null {
  if (!value) return null;
  return OCCASION_OPTIONS.find((o) => o.value === value)?.label ?? null;
}

function paletteLabels(hexes: string[]): string[] {
  const result: string[] = [];
  for (const hex of hexes) {
    const label = PALETTE_OPTIONS.find((p) => p.value === hex)?.label;
    if (label) result.push(label);
  }
  return result;
}

function ratioLabel(value: string): string {
  return OUTPUT_RATIOS.find((r) => r.value === value)?.label ?? value;
}

function joinEs(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} y ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
}

/**
 * Arma un prompt en español natural a partir del brief acumulado.
 * Se usa como autocompletado de la Estación 05 (Prompt).
 */
export function buildPromptFromBrief(state: RecorridoState): string {
  const variations = `${state.variations} ${state.variations === 1 ? "imagen" : "imágenes"}`;
  const ratio = ratioLabel(state.ratio).toLowerCase();
  const mood = moodLabel(state.mood);
  const occasion = occasionLabel(state.occasion);
  const palette = paletteLabels(state.palette);

  const sentences: string[] = [];

  sentences.push(
    `Generá ${variations} de mi producto en formato ${ratio} (${state.ratio}).`,
  );

  if (mood && palette.length > 0) {
    sentences.push(`Estilo ${mood.toLowerCase()}, paleta ${joinEs(palette).toLowerCase()}.`);
  } else if (mood) {
    sentences.push(`Estilo ${mood.toLowerCase()}.`);
  } else if (palette.length > 0) {
    sentences.push(`Paleta ${joinEs(palette).toLowerCase()}.`);
  }

  if (occasion) {
    sentences.push(`Ocasión: ${occasion.toLowerCase()}.`);
  }

  if (state.referenceImages.length > 0) {
    sentences.push("Tomá inspiración de las referencias adjuntas.");
  }

  return sentences.join(" ");
}
