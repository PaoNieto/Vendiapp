import { z } from "zod";

/**
 * Validación del request de análisis. Chequea que lo que llega sea de verdad
 * una imagen (data URL). El abuso de costo lo topa el crédito de análisis, no
 * un límite de tamaño — así que no restringimos el peso de la imagen.
 */
export const analyzeRequestSchema = z.object({
  imageDataUrl: z
    .string()
    .startsWith("data:image/", "Debe ser una imagen válida (data URL)"),
  ratio: z.enum(["1:1", "4:5", "9:16", "16:9"]),
});

export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;
