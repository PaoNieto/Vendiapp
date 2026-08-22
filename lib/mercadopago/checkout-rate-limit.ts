import "server-only";

/**
 * Rate limit del checkout de Mercado Pago — hallazgo G3 (JonSnow, 2026-08-21).
 *
 * QUÉ PROBLEMA RESUELVE
 * Los dos únicos lugares que crean una Preference (`POST /api/checkout` y
 * `/comprar?direct=1`) lo hacían en cada request, sin tope. Un logueado podía
 * pegarles en loop y generar Preferences infinitas contra la cuenta REAL de
 * Mercado Pago de Paolo. No acredita créditos ni abre el paywall: es DoS de
 * costo y de reputación (panel lleno de basura, riesgo de antifraude de MP).
 *
 * DÓNDE VIVE EL CONTADOR
 * En Postgres (tabla `checkout_attempts` + RPC `check_checkout_rate_limit`,
 * migración 0025). NO en memoria: Vendí corre en Vercel serverless y una
 * variable de módulo vive por instancia (lambda) — dos requests seguidos pueden
 * caer en instancias distintas y el tope sería de mentira. Postgres es el único
 * estado compartido que Vendí ya tiene, así que no suma infraestructura nueva.
 *
 * ⚠️ FALLA HACIA LA VENTA (fail-OPEN), a propósito.
 * Si Supabase está caído, falta una env, la RPC no existe todavía o el fetch se
 * cuelga → devolvemos `allowed: true` y el usuario PAGA. Perder una venta es
 * peor que una Preference de más. Es lo inverso a `lib/auth/paid-access.ts`
 * (fail-CLOSED) y no es una contradicción: aquel decide quién ENTRA a la app,
 * este solo decide quién puede ABRIR una pantalla de pago.
 * Corolario práctico: se puede mergear ANTES de aplicar la migración; hasta que
 * la RPC exista, esto no bloquea a nadie (solo loguea).
 *
 * NO TOCA EL COBRO: no importa `create-preference.ts`, ni el catálogo, ni el
 * webhook. Es una compuerta que se consulta ANTES; si la sacás, todo el cobro
 * sigue funcionando igual que hoy.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * LOS NÚMEROS (fuente de verdad; la RPC solo trae defaults de respaldo).
 *
 * Criterio: el tope NO puede molestar a un comprador legítimo. Hay DOS
 * superficies distintas y la que manda es la peor de las dos:
 *
 *  · /plan (2 botones) — el comprador nuevo. Peor caso realista en 10 minutos:
 *    toca "Pagar" (1), mira Mercado Pago, vuelve y lo toca de nuevo (2), prueba
 *    el Pack Negocio (3), vuelve al Pase (4), le rebota la tarjeta y reintenta
 *    (5, 6), cambia de tarjeta (7). → ~7.
 *
 *  · /upgrade (3 packs) — el PAGADOR QUE RECARGA, que es la métrica de recompra.
 *    Abre los tres para ver el precio en soles (3), los vuelve a comparar (6),
 *    decide (7), dos rebotes de tarjeta (9). → ~9. ESTA es la que manda.
 *
 * Con 15 quedan ~6 de aire sobre el peor caso realista. No se elige más bajo
 * porque bloquear a alguien que ya pagó una vez y viene a recargar es mucho más
 * caro que una Preference de más.
 *
 * El tope DIARIO es el que de verdad protege la cuenta de MP: sin él, 15 cada 10
 * minutos sostenidos son ~2.100 Preferences por día por cuenta. Con 40, un
 * comprador real nunca se acerca (serían 40 checkouts en un día) y un abusador
 * queda en 40. Subir la ventana NO afloja el candado: el techo diario es el
 * mismo, solo se corre la molestia lejos del que compra de verdad.
 */
export const CHECKOUT_MAX_PER_WINDOW = 15;
export const CHECKOUT_WINDOW_SECONDS = 600; // 10 minutos
export const CHECKOUT_MAX_PER_DAY = 40;

/** Timeout corto: esto está en el camino del pago, no puede colgarlo. */
const RPC_TIMEOUT_MS = 2500;

export type CheckoutRateLimitResult =
  | { allowed: true }
  | {
      allowed: false;
      /** "window" = ráfaga (esperar unos minutos). "day" = tope diario. */
      scope: "window" | "day";
      retryAfterSeconds: number;
      /** Mensaje listo para mostrarle al usuario, en castellano y sin jerga. */
      message: string;
    };

type RpcResponse = {
  allowed?: unknown;
  scope?: unknown;
  retry_after?: unknown;
};

/** "un minuto" / "3 minutos" — nada de "reintente en 187 segundos". */
function esperaEnCriollo(segundos: number): string {
  if (segundos <= 90) return "un minuto";
  const minutos = Math.ceil(segundos / 60);
  return `${minutos} minutos`;
}

function mensajeDeBloqueo(scope: "window" | "day", retryAfterSeconds: number): string {
  if (scope === "day") {
    return (
      "Llegaste al máximo de intentos de pago por hoy. Escribinos a " +
      "soporte@vendilatam.com y lo destrabamos en el momento."
    );
  }
  return (
    `Abriste el pago varias veces seguidas. Esperá ${esperaEnCriollo(retryAfterSeconds)} ` +
    "y volvé a tocar el botón — no se te cobró nada."
  );
}

/**
 * ¿Puede este usuario abrir otro checkout? Registra el intento si lo permite.
 *
 * Se llama SOLO justo antes de crear una Preference. El camino normal del
 * embudo (`/comprar` → `/plan`) no crea ninguna, así que no pasa por acá: cero
 * latencia agregada para la inmensa mayoría del tráfico.
 */
export async function checkCheckoutRateLimit(
  userId: string,
): Promise<CheckoutRateLimitResult> {
  // Sin config no hay contador posible → se deja pasar (fail-open).
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.warn(
      "[checkout-rate-limit] Sin SUPABASE_URL/SERVICE_KEY: se deja pasar el checkout.",
    );
    return { allowed: true };
  }

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/check_checkout_rate_limit`,
      {
        method: "POST",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_user_id: userId,
          p_max_window: CHECKOUT_MAX_PER_WINDOW,
          p_window_seconds: CHECKOUT_WINDOW_SECONDS,
          p_max_day: CHECKOUT_MAX_PER_DAY,
        }),
        // Es una decisión por-usuario y por-instante: jamás cachear.
        cache: "no-store",
        // Si el runtime no soporta AbortSignal.timeout, el throw cae en el catch
        // y termina igual en fail-open.
        signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
      },
    );

    if (!res.ok) {
      // Incluye el caso "la migración 0025 todavía no se aplicó" (404 de la RPC).
      console.warn(
        `[checkout-rate-limit] RPC respondió ${res.status}: se deja pasar el checkout.`,
      );
      return { allowed: true };
    }

    // PostgREST devuelve el jsonb de una función escalar como OBJETO. Igual
    // aceptamos `[{...}]` por las dudas: si algún día cambiara y solo leyéramos
    // el objeto, el limitador quedaría mudo (siempre "allowed") y G3 volvería a
    // estar abierto SIN que nadie se entere. Dos líneas para que no pase.
    const raw = (await res.json()) as unknown;
    const data = (Array.isArray(raw) ? raw[0] : raw) as RpcResponse | null;
    if (!data || data.allowed !== false) return { allowed: true };

    const scope: "window" | "day" = data.scope === "day" ? "day" : "window";
    const retryAfterSeconds =
      typeof data.retry_after === "number" && data.retry_after > 0
        ? Math.ceil(data.retry_after)
        : 60;

    console.warn(
      `[checkout-rate-limit] BLOQUEADO user=${userId} scope=${scope} retry=${retryAfterSeconds}s`,
    );
    return {
      allowed: false,
      scope,
      retryAfterSeconds,
      message: mensajeDeBloqueo(scope, retryAfterSeconds),
    };
  } catch (err) {
    // Red caída, timeout, JSON roto: NUNCA frenamos una venta por esto.
    console.warn("[checkout-rate-limit] Falló el chequeo, se deja pasar:", err);
    return { allowed: true };
  }
}
