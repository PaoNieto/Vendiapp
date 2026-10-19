import Link from "next/link";
import { XCircle } from "lucide-react";
import { messageText } from "@/lib/avisos/textos";
import { EsperarCreditos } from "./esperar-creditos";

/**
 * Pantalla de resultado del pago — a donde vuelve el comprador después de pagar.
 *
 * Es SOLO UX: la acreditación real la hace el webhook (fuente de verdad). Por
 * eso esta pantalla NUNCA dice "¡Pago aprobado!" por lo que traiga la URL: lo
 * dice recién cuando `/api/pago/estado` confirma que los créditos entraron.
 *
 * 🔴 ACEPTA LOS DOS VOCABULARIOS A PROPÓSITO.
 *  - WHOP (riel actual): `?status=success|error`, y es el `redirect_url` de la
 *    checkout configuration.
 *  - MERCADO PAGO (riel legacy): `?collection_status=approved|pending|in_process`.
 *  - Nuestro propio `/comprar` redirige con `?status=error` cuando no puede
 *    crear el checkout: ahí se muestra «No pudimos abrir el pago…».
 *
 * ⚠️ SIN PARÁMETROS NO SE ASUME FRACASO: el default es "estamos confirmando",
 * que es verdad en todos los casos y no miente en ninguna dirección.
 *
 * ⏳ NO SE RINDE. `EsperarCreditos` pregunta a `/api/pago/estado` hasta que los
 * créditos entran; pasados 90 s cambia el texto a «pago demorado» (cobrado o
 * sin confirmar, según Whop) y sigue preguntando más espaciado. Para el que
 * compra el Pase, este "acá" es el único lugar donde se entera (la campanita
 * está detrás del muro de pago).
 *
 * En Next 16 `searchParams` es un Promise.
 */

/**
 * Desde cuándo cuenta una compra como "la que acaba de hacer". Con margen hacia
 * atrás: el webhook puede acreditar antes de que el comprador vuelva acá.
 */
function inicioDeLaCompra(): string {
  return new Date(Date.now() - 15 * 60 * 1000).toISOString();
}

/** Estados que significan "no se cobró". */
const FAILED = new Set([
  "error",
  "failure",
  "failed",
  "rejected",
  "cancelled",
  "canceled",
  "null",
  "void",
]);

export default async function ResultadoPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; collection_status?: string }>;
}) {
  const sp = await searchParams;
  // `status` manda (lo usan Whop y nuestro propio redirect de error);
  // `collection_status` es el fallback de Mercado Pago.
  const raw = (sp.status ?? sp.collection_status ?? "").trim().toLowerCase();

  if (FAILED.has(raw)) {
    // `error` = no se pudo abrir el checkout (lo manda /comprar): texto exacto
    // de la spec. El resto (rechazos del riel viejo) = no se cobró.
    const noAbrio = raw === "error";
    return (
      <div className="px-5 py-16 sm:px-8">
        <div className="mx-auto flex max-w-md flex-col items-center text-center">
          <XCircle className="h-12 w-12 text-destructive" />
          <h1 className="mt-5 font-display text-3xl italic text-foreground">
            {noAbrio ? "No pudimos abrir el pago" : "El pago no se completó"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {noAbrio
              ? messageText("checkout_failed", {})
              : "No se realizó ningún cargo. Podés intentarlo de nuevo cuando quieras."}
          </p>
          <div className="mt-8 flex gap-3">
            <Link
              href="/comprar"
              className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-pill-bg px-5 py-3 text-sm font-semibold text-pill-fg transition-opacity hover:opacity-90"
            >
              Intentar de nuevo
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 py-16 sm:px-8">
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        <EsperarCreditos desde={inicioDeLaCompra()} />
      </div>
    </div>
  );
}
