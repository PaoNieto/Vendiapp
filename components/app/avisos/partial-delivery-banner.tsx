"use client";

import { useEffect } from "react";
import { Sparkles, X } from "lucide-react";
import { useAvisos } from "@/lib/avisos/client";
import { noticeText } from "@/lib/avisos/textos";
import type { PartialDeliveryNote } from "./use-batch-launcher";

/**
 * «Salieron {k} de {n} imágenes. Ya te devolvimos {n−k} créditos por las que
 * faltaron.» No afirma la causa. Usa el texto que devolvió la API si vino; si
 * no, lo arma textos.ts. A un ilimitado (refunded 0) no le promete devolución.
 */
export function PartialDeliveryBanner({
  note,
  onDismiss,
}: {
  note: PartialDeliveryNote;
  onDismiss: () => void;
}) {
  const { markRead } = useAvisos();
  const text =
    note.message ??
    noticeText("batch_partial", { k: note.delivered, n: note.requested, refunded: note.refunded });

  useEffect(() => {
    if (note.notificationId) void markRead([note.notificationId]);
  }, [note.notificationId, markRead]);

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-xl border border-border bg-card-cream/70 px-4 py-3 text-sm text-foreground"
    >
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-sage-strong" strokeWidth={1.8} aria-hidden />
      <p className="flex-1 font-medium leading-snug">{text}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Descartar aviso"
        className="-m-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
