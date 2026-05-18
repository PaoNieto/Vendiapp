import { GoogleGenerativeAI } from "@google/generative-ai";

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

export async function validateGoogleApiKey(
  apiKey: string,
): Promise<ValidationResult> {
  if (!apiKey || apiKey.trim().length < 10) {
    return { ok: false, reason: "La API key parece inválida (muy corta)." };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    await model.generateContent("ping");
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("API_KEY_INVALID") || message.includes("401")) {
      return {
        ok: false,
        reason: "La API key no es válida. Revisá que la copiaste completa.",
      };
    }
    if (message.includes("403")) {
      return {
        ok: false,
        reason: "La API key no tiene permisos para usar Gemini.",
      };
    }
    return {
      ok: false,
      reason: `No pudimos validar la key: ${message.slice(0, 120)}`,
    };
  }
}
