"use client";

import { useEffect } from "react";
import { Clock, RotateCw } from "lucide-react";
import { splitNotice, useAvisos, type NoticeItem } from "@/lib/avisos/client";
import { messageText } from "@/lib/avisos/textos";
import { NOTICE_KEYS } from "@/lib/avisos/types";
import type { Generation } from "@/lib/generations/store";

/**
 * Tarjeta "No salió" dentro de la tanda (variante 01 del mockup). Ocupa el
 * lugar de las fotos y queda ahí hasta que el cliente reintenta, aunque
 * recargue la página: sale de la última generación de la versión
 * (status 'failed') + su aviso `gen:<id>`.
 */
export function BatchFailureCard({
  createdAt,
  count,
  message,
  onRetry,
  retryDisabled = false,
  retryCost,
}: {
  createdAt: string | null;
  count: number | null;
  message: string;
  onRetry?: () => void;
  retryDisabled?: boolean;
  /** «Usa N créditos». null/0 = no se muestra (ilimitados). */
  retryCost?: number | null;
}) {
  const { title, body } = splitNotice(message);
  const meta = [batchWhen(createdAt), count ? (count === 1 ? "1 imagen" : `${count} imágenes`) : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div role="status" className="glass-card flex flex-col gap-2.5 p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="eyebrow">{meta ? `Tanda ${meta}` : "Última tanda"}</span>
        <span className="inline-flex items-center rounded-full border border-clay/30 bg-clay/10 px-2.5 py-1 text-[11px] font-semibold leading-none text-clay">
          No salió
        </span>
      </div>
      <p className="text-[19px] leading-snug text-foreground">{title}</p>
      {body ? <p className="max-w-prose text-[14px] leading-relaxed text-ink-soft">{body}</p> : null}
      {onRetry ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onRetry}
            disabled={retryDisabled}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCw className="h-4 w-4" aria-hidden />
            Reintentar
          </button>
          {typeof retryCost === "number" && retryCost > 0 ? (
            <span className="font-mono text-[11px] tracking-wide text-mute">
              Usa {retryCost === 1 ? "1 crédito" : `${retryCost} créditos`}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Aviso informativo: la tanda sigue corriendo (red cortada o recarga a mitad). */
export function BatchInProgressNote() {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-xl border border-butter/30 bg-butter/10 px-4 py-3 text-sm text-foreground"
    >
      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-butter" aria-hidden />
      <p className="font-medium leading-snug">{messageText("batch_in_progress", {})}</p>
    </div>
  );
}

/** Ventana en la que una tanda pending/processing se considera viva (maxDuration 300 s + margen). */
const IN_PROGRESS_WINDOW_MS = 6 * 60_000;

export function isBatchInProgress(gen: Generation | undefined): boolean {
  if (!gen || (gen.status !== "pending" && gen.status !== "processing")) return false;
  const created = Date.parse(gen.created_at);
  return !Number.isNaN(created) && Date.now() - created < IN_PROGRESS_WINDOW_MS;
}

/**
 * Texto de una tanda fallida a partir de su aviso guardado (lo que pasó con la
 * plata, en pasado). Sin aviso (falló antes de cobrar, o el aviso todavía no
 * cargó) usa un texto que no promete devoluciones.
 */
export function failedBatchMessage(gen: Generation, notice: NoticeItem | undefined): string {
  if (notice) return notice.text;
  if (gen.error_message === "no_readable_product_photos") return messageText("photos_unreadable", {});
  return "No pudimos terminar tus imágenes.";
}

/**
 * La última generación de la versión, si falló y es más nueva que la última
 * completada → { gen, notice, message }. Marca el aviso como leído al mostrarlo.
 */
export function useFailedBatch(
  generationsNewestFirst: readonly Generation[],
): { gen: Generation; message: string; notice: NoticeItem | undefined } | null {
  const { findByKey, markRead } = useAvisos();
  const latest = generationsNewestFirst[0];
  const failed = latest && latest.status === "failed" ? latest : undefined;
  const notice = failed ? findByKey(NOTICE_KEYS.batch(failed.id)) : undefined;

  const noticeId = notice && !notice.readAt ? notice.id : null;
  useEffect(() => {
    if (noticeId) void markRead([noticeId]);
  }, [noticeId, markRead]);

  if (!failed) return null;
  return { gen: failed, notice, message: failedBatchMessage(failed, notice) };
}

function batchWhen(iso: string | null): string | null {
  if (!iso) return "de hoy";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const hhmm = date.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false });
  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  if (sameDay) return `de hoy · ${hhmm}`;
  return `del ${date.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit" })} · ${hhmm}`;
}
