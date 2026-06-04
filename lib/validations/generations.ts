import { z } from "zod";
import { MAX_PRODUCT_IMAGES, MAX_REFERENCE_IMAGES, MAX_VARIATIONS } from "@/lib/constants";

export const generationRequestSchema = z.object({
  productImages: z
    .array(z.string().url())
    .min(1, "Subí al menos una foto del producto")
    .max(MAX_PRODUCT_IMAGES, `Máximo ${MAX_PRODUCT_IMAGES} fotos del producto`),
  referenceImages: z
    .array(z.string().url())
    .min(1, "Agregá al menos una referencia visual")
    .max(MAX_REFERENCE_IMAGES, `Máximo ${MAX_REFERENCE_IMAGES} referencias`),
  ratio: z.enum(["1:1", "4:5", "9:16", "16:9"]),
  userPrompt: z.string().max(500, "Máximo 500 caracteres").optional(),
  variationsRequested: z
    .number()
    .int()
    .min(1)
    .max(MAX_VARIATIONS)
    .default(5),
  projectId: z.string().uuid().optional(),
});

export type GenerationRequest = z.infer<typeof generationRequestSchema>;

/**
 * Request del modelo de CRÉDITOS (server-side). El cliente solo manda el
 * versionId — el server busca producto, refs, ratio y variaciones en la DB
 * (no confía en que el cliente mande las imágenes correctas). styleFragment
 * es el texto en inglés del estilo elegido (del catálogo lib/styles.ts).
 */
export const serverGenerationRequestSchema = z.object({
  versionId: z.string().uuid(),
  styleFragment: z.string().max(2000).optional(),
});

export type ServerGenerationRequest = z.infer<typeof serverGenerationRequestSchema>;

export const artDirectorRequestSchema = z.object({
  productImages: z.array(z.string().url()).min(1).max(MAX_PRODUCT_IMAGES),
  referenceImages: z.array(z.string().url()).min(1).max(MAX_REFERENCE_IMAGES),
  ratio: z.enum(["1:1", "4:5", "9:16", "16:9"]),
  userPrompt: z.string().optional(),
});

export const enrichedPromptSchema = z.object({
  scene_description: z.string(),
  lighting: z.string(),
  composition: z.string(),
  mood: z.string(),
  props: z.array(z.string()),
  color_palette: z.array(z.string()),
  camera_angle: z.string(),
  final_prompt: z.string(),
});

export type EnrichedPrompt = z.infer<typeof enrichedPromptSchema>;
