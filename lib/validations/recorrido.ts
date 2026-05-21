import { z } from "zod";
import { MAX_VARIATIONS } from "@/lib/constants";
import type { Version } from "@/lib/versions/store";

/**
 * Esquema mínimo de una versión antes de poder mandar a la Fábrica.
 *
 * Las "estaciones" del recorrido viejo (mood / paleta / ocasión) dejan de ser
 * obligatorias acá: ahora un usuario arma su versión vía detalle de producto
 * y la valida con este shape. Solo pedimos lo crítico:
 * - `product_id` (a qué producto pertenece)
 * - `name` (el usuario le da identidad a la campaña)
 * - al menos 1 referencia visual
 * - ratio explícito
 * - variations entre 1 y MAX_VARIATIONS
 *
 * NOTA: el archivo se llama todavía `recorrido.ts` por compatibilidad con
 * importadores existentes. Conceptualmente valida **una versión**, no el
 * recorrido acumulado de antes.
 */
export const versionBriefSchema = z.object({
  product_id: z.string().min(1, "Falta el producto"),
  name: z
    .string()
    .min(1, "Ponele un nombre a la versión")
    .max(60, "Máximo 60 caracteres"),
  reference_images: z
    .array(z.string())
    .min(1, "Agregá al menos una referencia"),
  output_ratio: z.enum(["1:1", "4:5", "9:16", "16:9"]),
  variations_default: z.number().int().min(1).max(MAX_VARIATIONS),
});

export type VersionBrief = z.infer<typeof versionBriefSchema>;

/**
 * Devuelve `true` si la versión está lista para mandar a la Fábrica.
 * Acepta el shape mínimo de `Version` que necesita el chequeo — útil para
 * gatear CTAs sin pasarle la entidad completa.
 */
export function isVersionReady(
  v: Pick<
    Version,
    "product_id" | "name" | "reference_images" | "output_ratio" | "variations_default"
  >,
): boolean {
  return versionBriefSchema.safeParse(v).success;
}
