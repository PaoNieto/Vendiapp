import Anthropic from "@anthropic-ai/sdk";
import { enrichedPromptSchema, type EnrichedPrompt } from "@/lib/validations/generations";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `Sos el Director de Arte de Vendí, un servicio que genera imágenes de producto para ecommerce y publicidad.

Tu trabajo: tomar las fotos del producto del usuario, las imágenes de referencia visual que mostró, el ratio de salida y (opcionalmente) instrucciones extras, y devolver un brief enriquecido en JSON estricto.

Devolvés SIEMPRE un JSON con esta forma exacta:
{
  "scene_description": "descripción detallada de la escena que querés crear",
  "lighting": "tipo de iluminación (cálida/fría, dirección, intensidad)",
  "composition": "regla de tercios, simetría, profundidad, framing",
  "mood": "emoción o sensación principal",
  "props": ["array", "de", "props", "relevantes"],
  "color_palette": ["#hex1", "#hex2", "#hex3"],
  "camera_angle": "ángulo/perspectiva (eye-level, low-angle, top-down, etc.)",
  "final_prompt": "prompt final consolidado, 80-150 palabras, en inglés, listo para Gemini Nano Banana"
}

Reglas:
- final_prompt SIEMPRE en inglés (mejor performance del modelo)
- final_prompt debe describir: objeto principal, escena, iluminación, mood, paleta, ángulo
- NO incluyas marcas registradas ajenas
- Mantené la fidelidad al producto del usuario
- Si las referencias visuales chocan con el producto, priorizá el producto y adaptá el estilo`;

export async function generateEnrichedPrompt(input: {
  productImages: string[];
  referenceImages: string[];
  ratio: string;
  userPrompt?: string;
}): Promise<EnrichedPrompt> {
  const userMessage = `Producto del usuario (${input.productImages.length} fotos):
${input.productImages.map((url, i) => `${i + 1}. ${url}`).join("\n")}

Referencias visuales (${input.referenceImages.length}):
${input.referenceImages.map((url, i) => `${i + 1}. ${url}`).join("\n")}

Ratio de salida: ${input.ratio}
${input.userPrompt ? `\nInstrucciones extra del usuario:\n${input.userPrompt}` : ""}

Devolvé SOLO el JSON estructurado, sin texto adicional.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          ...input.productImages.map((url) => ({
            type: "image" as const,
            source: { type: "url" as const, url },
          })),
          ...input.referenceImages.map((url) => ({
            type: "image" as const,
            source: { type: "url" as const, url },
          })),
          { type: "text" as const, text: userMessage },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Respuesta vacía del director de arte");
  }

  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No se encontró JSON en la respuesta del director de arte");
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return enrichedPromptSchema.parse(parsed);
}
