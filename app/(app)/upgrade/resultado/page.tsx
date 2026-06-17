import Link from "next/link";
import { CheckCircle2, Clock, XCircle } from "lucide-react";

/**
 * Pantalla de resultado del pago — destino de las back_urls de Mercado Pago.
 *
 * Es SOLO UX: muestra el resultado que MP pasa por query (`status`). La
 * acreditación real de créditos la hace el webhook /api/webhooks/mercadopago
 * (fuente de verdad), que puede tardar unos segundos — por eso el copy del caso
 * aprobado avisa que el saldo se actualiza enseguida.
 *
 * En Next 16 `searchParams` es un Promise.
 */
export default async function ResultadoPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; collection_status?: string }>;
}) {
  const sp = await searchParams;
  const status = sp.status ?? sp.collection_status ?? "unknown";

  const view = {
    approved: {
      icon: <CheckCircle2 className="h-12 w-12 text-sage-strong" />,
      title: "¡Pago aprobado!",
      body: "Estamos acreditando tus créditos. Puede tardar unos segundos en reflejarse en tu saldo.",
    },
    pending: {
      icon: <Clock className="h-12 w-12 text-foreground" />,
      title: "Pago pendiente",
      body: "Tu pago está en proceso. Cuando se confirme, vas a recibir tus créditos automáticamente.",
    },
    default: {
      icon: <XCircle className="h-12 w-12 text-destructive" />,
      title: "El pago no se completó",
      body: "No se realizó ningún cargo. Podés intentarlo de nuevo cuando quieras.",
    },
  };

  const v =
    status === "approved"
      ? view.approved
      : status === "pending" || status === "in_process"
        ? view.pending
        : view.default;

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
            href="/upgrade"
            className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground transition-opacity hover:opacity-90"
          >
            Volver
          </Link>
        </div>
      </div>
    </div>
  );
}
