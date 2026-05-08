import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

export type GeneratedImageResult = {
  base64: string;
  mimeType: string;
  variationIndex: number;
};

/**
 * Genera N variaciones en paralelo usando Gemini 2.5 Flash Image (Nano Banana).
 * Recibe imágenes de producto + referencias como inputs multimodales y un prompt enriquecido.
 */
export async function generateImageVariations(input: {
  finalPrompt: string;
  productImages: string[];
  referenceImages: string[];
  ratio: string;
  variations: number;
}): Promise<GeneratedImageResult[]> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash-image",
  });

  const fetchImageAsPart = async (url: string) => {
    const res = await fetch(url);
    const buffer = await res.arrayBuffer();
    const mimeType = res.headers.get("content-type") ?? "image/jpeg";
    return {
      inlineData: {
        data: Buffer.from(buffer).toString("base64"),
        mimeType,
      },
    };
  };

  const productParts = await Promise.all(input.productImages.map(fetchImageAsPart));
  const referenceParts = await Promise.all(input.referenceImages.map(fetchImageAsPart));

  const promptWithRatio = `${input.finalPrompt}\n\nAspect ratio: ${input.ratio}. High quality, photorealistic, studio-grade output.`;

  const generations = Array.from({ length: input.variations }, async (_, idx) => {
    const result = await model.generateContent([
      ...productParts,
      ...referenceParts,
      { text: promptWithRatio },
    ]);

    const response = result.response;
    const candidate = response.candidates?.[0];
    const imagePart = candidate?.content.parts.find(
      (p) => "inlineData" in p && p.inlineData,
    );

    if (!imagePart || !("inlineData" in imagePart) || !imagePart.inlineData) {
      throw new Error(`Variación ${idx + 1}: Gemini no devolvió imagen`);
    }

    return {
      base64: imagePart.inlineData.data,
      mimeType: imagePart.inlineData.mimeType ?? "image/png",
      variationIndex: idx,
    };
  });

  return Promise.all(generations);
}
