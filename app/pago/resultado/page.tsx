import Link from "next/link";
import { CheckCircle2, Clock, XCircle } from "lucide-react";

/**
 * Pantalla de resultado del pago — a donde vuelve el comprador después de pagar.
 *
 * Es SOLO UX: muestra el resultado que la pasarela pasa por query. La
 * acreditación real de créditos la hace el webhook (fuente de verdad), que puede
 * tardar unos segundos — por eso el copy del caso aprobado avisa que el saldo se
 * actualiza enseguida.
 *
 * 🔴 ACEPTA LOS DOS VOCABULARIOS A PROPÓSITO.
 *  - WHOP (riel actual): `?status=success|error`, y es el `redirect_url` de la
 *    checkout configuration.
 *  - MERCADO PAGO (riel legacy): `?collection_status=approved|pending|in_process`
 *    (y `?status=approved`). Un retorno tardío de MP —alguien con la pestaña
 *    abierta desde antes de la migración— no tiene que romper acá.
 *  - Nuestro propio `/comprar` redirige con `?status=error` cuando no puede
 *    crear el checkout.
 *
 * ⚠️ SIN PARÁMETROS NO SE ASUME FRACASO. Antes, cualquier valor desconocido caía
 * en "El pago no se completó": si Whop vuelve sin query params, el que ACABA DE
 * PAGAR leería que su pago falló. El default ahora es el estado "en proceso",
 * que es verdad en todos los casos (el webhook es el que confirma) y no miente
 * en ninguna dirección.
 *
 * En Next 16 `searchParams` es un Promise.
 */

/** Estados que significan "cobrado" en cualquiera de los dos vocabularios. */
const APPROVED = new Set(["success", "succeeded", "approved", "paid", "completed"]);
/** Estados que significan "todavía no se sabe". */
const PENDING = new Set(["pending", "in_process", "processing", "authorized"]);
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

  const view = {
    approved: {
      icon: <CheckCircle2 className="h-12 w-12 text-sage-strong" />,
      title: "¡Pago aprobado!",
      body: "Estamos acreditando tus créditos. Puede tardar unos segundos en reflejarse en tu saldo.",
    },
    pending: {
      icon: <Clock className="h-12 w-12 text-foreground" />,
      title: "Estamos confirmando tu pago",
      body: "Cuando se confirme, vas a recibir tus créditos automáticamente. Si ya pagaste, revisá tu saldo en unos segundos.",
    },
    failed: {
      icon: <XCircle className="h-12 w-12 text-destructive" />,
      title: "El pago no se completó",
      body: "No se realizó ningún cargo. Podés intentarlo de nuevo cuando quieras.",
    },
  };

  const v = APPROVED.has(raw)
    ? view.approved
    : FAILED.has(raw)
      ? view.failed
      : PENDING.has(raw)
        ? view.pending
        : // Sin dato o valor desconocido: nunca afirmamos que falló.
          view.pending;

  return (
    <div className="px-5 py-16 sm:px-8">
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        {v.icon}
        <h1 className="mt-5 font-display text-3xl italic text-foreground">
          {v.title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{v.body}</p>
        <div className="mt-8 flex gap-3">
          <Link
            href="/fabrica"
            className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-pill-bg px-5 py-3 text-sm font-semibold text-pill-fg transition-opacity hover:opacity-90"
          >
            Ir a la Fábrica
          </Link>
          <Link
            href="/comprar"
            className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground transition-opacity hover:opacity-90"
          >
            Volver
          </Link>
        </div>
      </div>
    </div>
  );
}
