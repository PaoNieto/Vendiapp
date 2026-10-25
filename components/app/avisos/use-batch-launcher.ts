"use client";

import { useCallback, useState } from "react";
import { readAiRouteFailure, useAvisos } from "@/lib/avisos/client";
import { messageText } from "@/lib/avisos/textos";
import { useCreditos } from "@/lib/creditos/use-creditos";

/**
 * Lanza una tanda (POST /api/generations) y traduce la respuesta a avisos:
 *  - falla de la TANDA (ya cobrada o con fila creada): el overlay se convierte
 *    en el aviso (variante 08) y, al cerrarlo, queda la tarjeta "No salió"
 *    (variante 01) con el texto que devolvió la API;
 *  - falla ANTES de la tanda (sin créditos, no se pudo descontar, límite):
 *    banner en la pantalla;
 *  - IA caída (503 ai_unavailable): prende el banner global;
 *  - red cortada: «Tu tanda sigue en curso: no la lances otra vez.» (nunca
 *    "intentá de nuevo", que relanzaría una tanda que se sigue cobrando).
 * El `notificationId` que devuelve la API y que ya se mostró se marca leído.
 */

/** Sentinel del banner: sin créditos (lleva CTA a /upgrade). */
export const INSUFFICIENT_CREDITS = "insufficient_credits";

/** Códigos de la API que describen el RESULTADO de una tanda (no un rechazo previo). */
const BATCH_OUTCOME_ERRORS = new Set([
  "generation_failed",
  "input_blocked",
  "refund_pending",
  "photos_unreadable",
]);

export const PARTIAL_DELIVERY_KEY = "vendi:partial-delivery";

export type PartialDeliveryNote = {
  delivered: number;
  requested: number;
  refunded: number;
  message: string | null;
  notificationId: string | null;
};

export function useBatchLauncher() {
  const avisos = useAvisos();
  const creditos = useCreditos();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  /** Falla de la tanda mostrada en el overlay (variante 08). */
  const [overlayFailure, setOverlayFailure] = useState<string | null>(null);
  /** Falla de la tanda en esta sesión, para la tarjeta (variante 01) sin recargar. */
  const [sessionFailure, setSessionFailure] = useState<string | null>(null);
  /** Se cortó la red con la tanda en vuelo (puede seguir corriendo). */
  const [networkCut, setNetworkCut] = useState(false);

  const launch = useCallback(
    async (body: Record<string, unknown>) => {
      if (isSubmitting) return;
      if (avisos.ai.down) return;
      setErrorBanner(null);
      setOverlayFailure(null);
      setNetworkCut(false);
      setIsSubmitting(true);

      let res: Response;
      try {
        res = await fetch("/api/generations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch {
        // La request pudo haber llegado: la tanda puede seguir corriendo y
        // cobrándose. No invitamos a relanzarla.
        setNetworkCut(true);
        setIsSubmitting(false);
        void avisos.refresh();
        return;
      }

      if (res.ok) {
        const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        const delivered = typeof data?.delivered === "number" ? data.delivered : null;
        const requested = typeof data?.requested === "number" ? data.requested : null;
        const isPartial = delivered !== null && requested !== null && delivered < requested;
        const readyId = typeof data?.notificationId === "string" ? data.notificationId : null;
        if (readyId && !isPartial) {
          // Salió entera y el cliente la está viendo: «ya están en la Fábrica»
          // queda leído. Si se fue antes, el aviso lo espera en la campanita.
          try {
            await avisos.markRead([readyId]);
          } catch {
            // No es crítico: queda sin leer en la campanita.
          }
        }
        if (isPartial) {
          const note: PartialDeliveryNote = {
            delivered,
            requested,
            // 0 para ilimitados: nunca se les descontó, no se promete devolución.
            refunded: typeof data?.refunded === "number" ? data.refunded : 0,
            message: typeof data?.message === "string" ? data.message : null,
            notificationId: typeof data?.notificationId === "string" ? data.notificationId : null,
          };
          try {
            sessionStorage.setItem(PARTIAL_DELIVERY_KEY, JSON.stringify(note));
          } catch {
            // Storage bloqueado: el aviso igual queda en la campanita.
          }
        }
        // Recargamos para que los stores re-hidraten con lo que escribió el server.
        window.location.reload();
        return;
      }

      const failure = await readAiRouteFailure(res);
      if (failure.notificationId) void avisos.markRead([failure.notificationId]);
      void creditos.refetch();
      void avisos.refresh();
      setIsSubmitting(false);

      if (res.status === 402 && (failure.error === null || failure.error.startsWith("insufficient"))) {
        setErrorBanner(INSUFFICIENT_CREDITS);
        return;
      }
      if (failure.error === "ai_unavailable") {
        avisos.reportAiUnavailable();
        return;
      }

      const message = failure.message ?? messageText("db_down", {});
      if (failure.error && BATCH_OUTCOME_ERRORS.has(failure.error)) {
        setSessionFailure(message);
        setOverlayFailure(message);
        return;
      }
      setErrorBanner(message);
    },
    [avisos, creditos, isSubmitting],
  );

  return {
    launch,
    isSubmitting,
    errorBanner,
    dismissError: () => setErrorBanner(null),
    overlayFailure,
    closeOverlayFailure: () => setOverlayFailure(null),
    sessionFailure,
    networkCut,
    aiDown: avisos.ai.down,
  };
}

/** Lee (y borra) el aviso de entrega parcial que dejó la tanda antes de recargar. */
export function takePartialDeliveryNote(): PartialDeliveryNote | null {
  try {
    const raw = sessionStorage.getItem(PARTIAL_DELIVERY_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PARTIAL_DELIVERY_KEY);
    const parsed = JSON.parse(raw) as Record<string, unknown> | null;
    if (!parsed || typeof parsed.delivered !== "number" || typeof parsed.requested !== "number") {
      return null;
    }
    return {
      delivered: parsed.delivered,
      requested: parsed.requested,
      refunded: typeof parsed.refunded === "number" ? parsed.refunded : 0,
      message: typeof parsed.message === "string" ? parsed.message : null,
      notificationId: typeof parsed.notificationId === "string" ? parsed.notificationId : null,
    };
  } catch {
    return null;
  }
}
