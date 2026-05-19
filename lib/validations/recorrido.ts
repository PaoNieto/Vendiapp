import { z } from "zod";
import { MAX_VARIATIONS } from "@/lib/constants";

/**
 * Esquema mínimo del brief antes de mandar a la Fábrica.
 * Solo valida lo crítico para habilitar el flujo de generación:
 * - al menos 1 foto del producto
 * - al menos 1 referencia
 * - mood seleccionado
 * - ocasión seleccionada
 * - variations entre 1 y MAX_VARIATIONS
 */
export const recorridoBriefSchema = z.object({
  productImages: z
    .array(z.object({ id: z.string(), previewUrl: z.string() }))
    .min(1, "Subí al menos una foto del producto"),
  referenceImages: z
    .array(z.object({ id: z.string(), previewUrl: z.string() }))
    .min(1, "Agregá al menos una referencia"),
  mood: z.string().min(1, "Elegí un mood"),
  occasion: z.string().min(1, "Elegí una ocasión"),
  variations: z.number().int().min(1).max(MAX_VARIATIONS),
});

export type RecorridoBrief = z.infer<typeof recorridoBriefSchema>;

/**
 * Devuelve `true` si el brief actual cumple con el mínimo para mandar a la Fábrica.
 * Usalo desde la Estación 05 antes de habilitar el CTA final.
 */
export function isBriefValid(state: {
  productImages: { id: string; previewUrl: string }[];
  referenceImages: { id: string; previewUrl: string }[];
  mood: string | null;
  occasion: string | null;
  variations: number;
}): boolean {
  return recorridoBriefSchema.safeParse(state).success;
}
