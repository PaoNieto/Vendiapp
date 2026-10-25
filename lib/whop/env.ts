import "server-only";

/**
 * Interruptor PRODUCCIÓN ↔ SANDBOX de Whop.
 *
 * El sandbox (sandbox.whop.com) es un Whop paralelo para probar el riel entero
 * sin plata real: se paga con la tarjeta 4242 4242 4242 4242 y Whop manda el
 * mismo `payment.succeeded` firmado. Tiene su PROPIA cuenta, API key, planes y
 * secret de webhook — nada se comparte con producción.
 *
 * Se prende con `WHOP_ENV=sandbox` + `WHOP_SANDBOX_PLAN_IDS` (JSON
 * `{ "lifetime-pass": "plan_...", ... }` con los planes creados en el sandbox).
 * `WHOP_API_KEY`, `WHOP_ACCOUNT_ID` y `WHOP_WEBHOOK_SECRET` se cargan con los
 * valores del sandbox en ESE entorno (Preview o local), no se tocan en prod.
 *
 * 🔴 NUNCA EN PRODUCCIÓN. Con sandbox prendido, una tarjeta de prueba acredita
 * créditos REALES en nuestra base. Por eso en `VERCEL_ENV=production` el
 * interruptor se ignora aunque alguien cargue la env por error.
 */
export function isWhopSandbox(): boolean {
  if (process.env.VERCEL_ENV === "production") return false;
  return process.env.WHOP_ENV === "sandbox";
}

/** Base de la API según el entorno. */
export function whopApiBase(): string {
  return isWhopSandbox()
    ? "https://sandbox-api.whop.com/api/v1"
    : "https://api.whop.com/api/v1";
}

/** Valor del prop `environment` del checkout embebido. */
export function whopEmbedEnvironment(): "production" | "sandbox" {
  return isWhopSandbox() ? "sandbox" : "production";
}

/**
 * Planes del sandbox por id de producto. Los `plan_...` de producción NO
 * existen en el sandbox, así que cada producto se remapea desde la env.
 * JSON inválido o faltante → mapa vacío (el checkout de ese producto falla con
 * WHOP_FAILED y se loguea, en vez de cobrar un plan equivocado).
 */
function sandboxPlanIds(): Record<string, string> {
  const raw = process.env.WHOP_SANDBOX_PLAN_IDS;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    console.error("[whop-env] WHOP_SANDBOX_PLAN_IDS no es JSON válido.");
    return {};
  }
}

/** `plan_...` que corresponde a este producto en el entorno activo. */
export function resolveWhopPlanId(product: {
  id: string;
  whopPlanId: string;
}): string {
  if (!isWhopSandbox()) return product.whopPlanId;
  return sandboxPlanIds()[product.id] ?? "";
}

/** Inversa: producto cuyo plan del entorno activo es `planId`. */
export function productIdForWhopPlanId(
  planId: string,
  products: { id: string; whopPlanId: string }[],
): string | null {
  if (!planId) return null;
  return products.find((p) => resolveWhopPlanId(p) === planId)?.id ?? null;
}
