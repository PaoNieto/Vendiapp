import { callGemini, GEMINI_PING_MODEL } from "@/lib/ai/gemini-client";

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Pings Gemini con un prompt mínimo para confirmar que la API key del usuario
 * es válida y tiene acceso a la API (BYOK). Usa el modelo de texto compartido
 * (`gemini-2.5-flash` vía `gemini-client.ts`) para NO quemar cupo de imágenes.
 *
 * No traduce todos los códigos de error de Google — sólo los más comunes que
 * el usuario puede arreglar copiando bien la key. El resto cae al "no pudimos
 * validar" con el mensaje crudo.
 */
export async function validateGoogleApiKey(
  apiKey: string,
): Promise<ValidationResult> {
  if (!apiKey || apiKey.trim().length < 10) {
    return { ok: false, reason: "La API key parece inválida (muy corta)." };
  }

  const result = await callGemini({
    apiKey,
    model: GEMINI_PING_MODEL,
    contents: [{ role: "user", parts: [{ text: "ping" }] }],
    // 10s es suficiente para un ping; si no responde, hay algo raro.
    timeoutMs: 10_000,
  });

  if (result.ok) {
    return { ok: true };
  }

  switch (result.error.kind) {
    case "missing_key":
      return { ok: false, reason: "La API key parece inválida (vacía)." };
    case "invalid_key":
      return {
        ok: false,
        reason: "La API key no es válida o no tiene permisos para Gemini.",
      };
    case "rate_limit":
      // Si rate-limitea en el ping de validación, la key sirve pero Google
      // está cortando — la consideramos válida para no bloquear el setup.
      return { ok: true };
    case "content_blocked":
      // Caso bizarro: que Gemini bloquee "ping" por safety. La key sirve.
      return { ok: true };
    case "network":
      return {
        ok: false,
        reason: "No pudimos contactar a Gemini. Revisá tu conexión.",
      };
    case "unknown":
      return {
        ok: false,
        reason: `No pudimos validar la key: ${result.error.message.slice(0, 120)}`,
      };
  }
}
