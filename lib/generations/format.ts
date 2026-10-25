import { messageText, noticeText } from "@/lib/avisos/textos";

/**
 * Formatea una fecha ISO 8601 en una etiqueta relativa en español.
 *
 * Ejemplos: "hace un momento", "hace 5 min", "hace 2 h", "ayer",
 * "hace 3 días", "hace 2 semanas".
 *
 * No usa librerías externas. Si el input no es parseable devuelve "—".
 */
export function formatRelativeTime(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";

  const now = Date.now();
  const diffMs = now - then;

  // Futuro o casi instantáneo
  if (diffMs < 60_000) return "hace un momento";

  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;

  if (diffMs < hour) {
    const mins = Math.floor(diffMs / minute);
    return `hace ${mins} min`;
  }

  if (diffMs < day) {
    const hours = Math.floor(diffMs / hour);
    return `hace ${hours} h`;
  }

  if (diffMs < 2 * day) return "ayer";

  if (diffMs < week) {
    const days = Math.floor(diffMs / day);
    return `hace ${days} días`;
  }

  const weeks = Math.floor(diffMs / week);
  return weeks === 1 ? "hace 1 semana" : `hace ${weeks} semanas`;
}

/**
 * Texto al cliente cuando la IA está caída (`GeminiError` kind "billing": sin
 * saldo en Google; también key mala o modelo retirado). No es un "probá más
 * tarde": no se arregla solo y la culpa no es del usuario. Al cliente NUNCA se
 * le dice "sin saldo" ni se le nombra al proveedor (spec de avisos, G.1): sale
 * el banner de IA caída o el texto de la falla con su devolución. La causa le
 * llega a Paolo por la alerta, no por este texto.
 *
 * `refunded` = créditos que DE VERDAD volvieron a su saldo. Tiene que ser
 * honesto: 0 cuando no se descontó nada (corte antes del deduct, o usuario de
 * `unlimited_users`, cuyo deduct es no-op) → no se promete devolución. Si hubo
 * deduct y refund, se dice cuántos volvieron.
 *
 * @deprecated Para código nuevo, usar `messageText` / `noticeText` de
 * lib/avisos/textos.ts. Se mantiene con la misma firma que en main porque la
 * siguen llamando scripts/v2-dry-run.ts y las rutas que todavía no migraron.
 */
export function formatBillingError(opts: {
  service: "images" | "analysis";
  refunded: number;
}): string {
  const n = Math.max(0, Math.floor(opts.refunded));
  if (n === 0) return messageText("ai_down", {});
  if (opts.service === "analysis") {
    return noticeText("analysis_failed", { refunded: n });
  }
  return noticeText("batch_failed", { refunded: n });
}

/**
 * ¿El error del descuento es FALTA DE CRÉDITOS de verdad? Son los únicos
 * mensajes de las RPC que valen un 402 ("comprá más"):
 *  - deduct_credits:          'Créditos insuficientes: tiene X, necesita Y'
 *  - deduct_analysis_credit:  'Sin créditos de análisis'
 * Cualquier otro error (base caída, timeout, perfil inexistente) es un problema
 * NUESTRO → 503 con «No pudimos empezar… No se te descontó nada».
 */
export function isInsufficientCreditsError(message: string | null | undefined): boolean {
  if (!message) return false;
  return /cr[eé]ditos insuficientes|sin cr[eé]ditos de an[aá]lisis/i.test(message);
}

/** Status HTTP para un descuento que falló: 402 solo si de verdad no alcanza. */
export function deductErrorStatus(message: string | null | undefined): 402 | 503 {
  return isInsufficientCreditsError(message) ? 402 : 503;
}
