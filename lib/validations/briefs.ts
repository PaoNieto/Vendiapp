import { z } from "zod";

/**
 * Bodies de los endpoints de NOTAS del pipeline v2 (`/api/briefs/*`).
 *
 * El cliente manda SOLO el id: el server lee fotos, nombre y referencias de la
 * base con el token del usuario (RLS = ownership). Nunca se confía en URLs ni
 * textos que vengan en el body — la nota es texto que después llega al modelo
 * de imagen, así que su insumo tiene que ser el que está persistido.
 */
export const productBriefRequestSchema = z.object({
  productId: z.string().uuid(),
});

export const referenceBriefRequestSchema = z.object({
  versionId: z.string().uuid(),
});

export type ProductBriefRequest = z.infer<typeof productBriefRequestSchema>;
export type ReferenceBriefRequest = z.infer<typeof referenceBriefRequestSchema>;
