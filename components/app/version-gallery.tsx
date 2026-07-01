"use client";

/**
 * VersionGallery — catálogo limpio de imágenes generadas de una versión.
 *
 * Rediseño (2026-06-11, pedido de Paolo): el grid pasa a ser un CATÁLOGO puro
 * (sólo la imagen + badge + acciones en hover). El prompt estricto y los seteos
 * dejaron de vivir inline en cada tile — saturaban — y se mudaron a un MODAL de
 * detalle que se abre al hacer click en una imagen.
 *
 * Modal: foto a la izquierda, info a la derecha en 3 bloques:
 *  1. Seteos (read-only): formato, referencias, estilo de la versión.
 *  2. Prompt original (read-only): cómo se creó esta imagen.
 *  3. Prompt estricto (editable): personalización del usuario para una
 *     regeneración al 100% de control. "Regenerar" dispara
 *     POST /api/generations/regenerate (1 crédito) usando ese texto como prompt
 *     autoritativo (pisa estilo + referencias).
 */

import Image from "next/image";
import { useState } from "react";
import { Download, Heart, Info, Plus, RefreshCw, Sparkles } from "lucide-react";
import { motion } from "motion/react";

import { PillButton } from "@/components/dashboard/pill-button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useGenerations,
  type GeneratedImage,
} from "@/lib/generations/store";
import { cn } from "@/lib/utils";

/**
 * Seteos read-only de la versión, derivados en la página y pasados acá para
 * mostrarlos en el modal de detalle de cada imagen.
 */
export type VersionSettings = {
  /** Ratio de salida, ej. "4:5". */
  outputRatio: string;
  /** Label legible del ratio (de OUTPUT_RATIOS), ej. "Vertical retrato". */
  ratioLabel: string | null;
  /** Cantidad de referencias de la versión. */
  referencesCount: number;
  /** Label del estilo profesional, o null si la versión no tiene estilo. */
  styleLabel: string | null;
};

/**
 * El indicador de carga durante la generación lo maneja el `GeneratingOverlay`
 * full-screen de la página (el círculo con "30-60 segundos"). Acá NO repetimos
 * un "procesando" — cuando la generación termina, mostramos las imágenes
 * directo. Sin doble indicador.
 */
export function VersionGallery({
  images,
  versionSettings,
  onGenerateMore,
}: {
  images: GeneratedImage[];
  versionSettings: VersionSettings;
  onGenerateMore: () => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeImage = activeId
    ? images.find((i) => i.id === activeId) ?? null
    : null;

  if (images.length === 0) {
    return <EmptyImagesState onGenerateMore={onGenerateMore} />;
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-[18px] sm:grid-cols-3 lg:grid-cols-4">
        {images.map((img, idx) => (
          <CatalogTile
            key={img.id}
            image={img}
            index={idx + 1}
            onOpen={() => setActiveId(img.id)}
          />
        ))}
      </div>

      <ImageDetailDialog
        image={activeImage}
        // El índice (V{n}) lo derivamos por la posición en la lista, igual que el tile.
        index={activeImage ? images.findIndex((i) => i.id === activeImage.id) + 1 : 0}
        versionSettings={versionSettings}
        onClose={() => setActiveId(null)}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Tile del catálogo — sólo imagen + badge + acciones en hover                */
/* -------------------------------------------------------------------------- */

function CatalogTile({
  image,
  index,
  onOpen,
}: {
  image: GeneratedImage;
  index: number;
  onOpen: () => void;
}) {
  const { toggleFavorite, markDownloaded } = useGenerations();

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
  }

  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      role="button"
      tabIndex={0}
      aria-label={`Ver detalle de la variación ${index}`}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      className="glass-card-compact group relative aspect-square cursor-pointer overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
    >
      {image.image_url ? (
        <Image
          src={image.image_url}
          alt={`Variación ${image.variation_index + 1}`}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 280px"
          className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04]"
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-foreground/5" />
      )}

      <span
        className="absolute left-2.5 top-2.5 inline-flex items-center rounded-md bg-foreground/60 px-2 py-1 font-mono text-[10px] uppercase text-background backdrop-blur-sm"
        style={{ letterSpacing: "0.12em" }}
      >
        V{index}
      </span>

      <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        <button
          type="button"
          aria-label={
            image.is_favorite ? "Quitar de favoritas" : "Marcar como favorita"
          }
          aria-pressed={image.is_favorite}
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(image.id);
          }}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-foreground/60 text-background backdrop-blur-sm transition-transform hover:scale-110"
        >
          <Heart
            className={cn("h-3.5 w-3.5", image.is_favorite && "fill-current")}
          />
        </button>
        <a
          href={image.image_url || undefined}
          download
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Descargar imagen"
          onClick={(e) => {
            e.stopPropagation();
            markDownloaded(image.id);
          }}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-foreground/60 text-background backdrop-blur-sm transition-transform hover:scale-110"
        >
          <Download className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Sheen sutil arriba para dar profundidad. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-black/10 to-transparent"
      />
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Modal de detalle — foto a la izquierda, info a la derecha                  */
/* -------------------------------------------------------------------------- */

function ImageDetailDialog({
  image,
  index,
  versionSettings,
  onClose,
}: {
  image: GeneratedImage | null;
  index: number;
  versionSettings: VersionSettings;
  onClose: () => void;
}) {
  const { setImagePrompt, toggleFavorite, markDownloaded } = useGenerations();

  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);

  // Prompt base/original — read-only. Lectura segura del metadata (contrato Bujía).
  const basePrompt =
    image && typeof image.metadata?.base_prompt === "string"
      ? image.metadata.base_prompt
      : image?.strict_prompt || "";

  const strictText = image?.strict_prompt.trim() ?? "";
  const canRegenerate = strictText.length > 0 && !isRegenerating;

  async function handleRegenerate() {
    if (!image || !canRegenerate) return;
    setRegenError(null);
    setIsRegenerating(true);
    try {
      const res = await fetch("/api/generations/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId: image.id, strictPrompt: strictText }),
      });
      if (res.status === 402) {
        setRegenError("insufficient_credits");
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { message?: string; error?: string }
          | null;
        setRegenError(
          data?.message ?? data?.error ?? "No se pudo regenerar. Intentá de nuevo.",
        );
        return;
      }
      // Éxito: recargamos para traer la nueva variación del server (mismo patrón
      // que "Más variaciones").
      window.location.reload();
    } catch {
      setRegenError("No se pudo conectar. Revisá tu internet e intentá de nuevo.");
    } finally {
      setIsRegenerating(false);
    }
  }

  return (
    <Dialog
      open={image !== null}
      onOpenChange={(open) => {
        if (!open) {
          // Limpiamos el error al cerrar para que no quede pegado al abrir otra imagen.
          setRegenError(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-3xl gap-0 overflow-y-auto p-0 sm:max-w-3xl lg:max-w-4xl">
        {image ? (
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            {/* IZQUIERDA — foto grande + acciones. */}
            <div className="flex flex-col gap-3.5 border-b border-border p-4 sm:border-b-0 sm:border-r sm:p-6">
              <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-border bg-foreground/5 shadow-[0_1px_2px_rgba(15,31,22,.06),0_16px_36px_-18px_rgba(15,31,22,.4)]">
                {image.image_url ? (
                  <Image
                    src={image.image_url}
                    alt={`Variación ${image.variation_index + 1}`}
                    fill
                    sizes="(max-width: 640px) 100vw, 480px"
                    className="object-cover"
                  />
                ) : (
                  <div aria-hidden className="absolute inset-0 bg-foreground/5" />
                )}
                <span
                  className="absolute left-2.5 top-2.5 inline-flex items-center rounded-md bg-foreground/60 px-2 py-1 font-mono text-[10px] uppercase text-background backdrop-blur-sm"
                  style={{ letterSpacing: "0.12em" }}
                >
                  V{index}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={
                    image.is_favorite
                      ? "Quitar de favoritas"
                      : "Marcar como favorita"
                  }
                  aria-pressed={image.is_favorite}
                  onClick={() => toggleFavorite(image.id)}
                  className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-[13px] font-semibold text-foreground transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
                >
                  <Heart
                    className={cn(
                      "h-4 w-4 transition-colors",
                      image.is_favorite && "fill-current text-clay",
                    )}
                  />
                  {image.is_favorite ? "Favorita" : "Marcar favorita"}
                </button>
                <a
                  href={image.image_url || undefined}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Descargar imagen"
                  onClick={() => markDownloaded(image.id)}
                  className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-[13px] font-semibold text-foreground transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
                >
                  <Download className="h-4 w-4" />
                  Descargar
                </a>
              </div>
            </div>

            {/* DERECHA — seteos + prompt original + prompt estricto. */}
            <div className="flex flex-col gap-6 p-4 pt-9 sm:max-h-[90vh] sm:overflow-y-auto sm:p-6 sm:pt-9">
              <DialogHeader className="gap-1">
                <DialogTitle className="font-display text-2xl italic text-foreground">
                  Variación V{index}
                </DialogTitle>
                <DialogDescription className="text-mute">
                  Detalle, configuración y prompt de esta imagen.
                </DialogDescription>
              </DialogHeader>

              {/* 1. Seteos (read-only) — bloque agrupado con filas divididas. */}
              <section className="flex flex-col gap-2.5">
                <span className="eyebrow">Seteos</span>
                <div className="overflow-hidden rounded-xl border border-border bg-background/40">
                  <SettingRow label="Formato">
                    <span className="font-mono text-[13px] font-bold text-foreground">
                      {versionSettings.outputRatio}
                    </span>
                    {versionSettings.ratioLabel ? (
                      <span className="text-xs font-medium text-mute">
                        {versionSettings.ratioLabel}
                      </span>
                    ) : null}
                  </SettingRow>
                  <SettingRow label="Referencias">
                    <span className="text-[13px] font-semibold text-foreground">
                      {versionSettings.referencesCount > 0
                        ? `${versionSettings.referencesCount} ${
                            versionSettings.referencesCount === 1
                              ? "referencia"
                              : "referencias"
                          }`
                        : "Sin referencias"}
                    </span>
                  </SettingRow>
                  <SettingRow label="Estilo">
                    <span className="text-[13px] font-semibold text-foreground">
                      {versionSettings.styleLabel ?? "Sin estilo"}
                    </span>
                  </SettingRow>
                </div>
              </section>

              {/* 2. Prompt original (read-only) */}
              <section className="flex flex-col gap-2 border-t border-border pt-6">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="eyebrow">Prompt original</span>
                  <span className="text-[11px] font-medium text-mute">
                    Así se creó esta imagen
                  </span>
                </div>
                <div className="max-h-44 overflow-y-auto rounded-xl border border-border bg-background/40 px-3.5 py-3">
                  <p className="whitespace-pre-wrap font-mono text-[11.5px] leading-[1.6] text-ink-soft">
                    {basePrompt.trim().length > 0
                      ? basePrompt
                      : "Sin prompt registrado para esta imagen."}
                  </p>
                </div>
              </section>

              {/* 3. Prompt estricto (editable) — la estrella: control 100%.
                  Tratamiento de acento sage para diferenciarlo como editable. */}
              <section className="flex flex-col gap-2.5 rounded-xl border border-sage/30 bg-sage/[0.06] p-3.5 sm:p-4">
                <div className="flex items-center gap-1.5">
                  <span className="eyebrow" style={{ color: "var(--vd-sage-strong)" }}>
                    Prompt estricto
                  </span>
                  <span
                    title="La IA cumple tu prompt de forma prioritaria (≈99.9% de fidelidad), por encima del estilo y las referencias, y sin inventar."
                    className="inline-flex h-[16px] w-[16px] cursor-help items-center justify-center rounded-full bg-sage-strong/15 text-sage-strong"
                  >
                    <Info className="h-2.5 w-2.5" strokeWidth={2.2} />
                  </span>
                </div>
                <Textarea
                  value={image.strict_prompt}
                  onChange={(e) => setImagePrompt(image.id, e.target.value)}
                  placeholder="Escribí tu propio prompt para personalizar al 100% esta variación…"
                  rows={4}
                  className="min-h-[92px] resize-none rounded-[10px] border-border bg-card/70 px-3 py-2 font-mono text-[11.5px] leading-[1.6]"
                />
                <p className="text-[11px] leading-[1.5] text-mute">
                  La IA va a cumplir tu especificación de forma prioritaria
                  (≈99.9% de fidelidad), por encima del estilo y las
                  referencias, y sin inventar detalles que no pediste.
                </p>

                <button
                  type="button"
                  onClick={handleRegenerate}
                  disabled={!canRegenerate}
                  className="mt-0.5 inline-flex w-full min-h-[40px] items-center justify-center gap-1.5 rounded-full border border-border bg-card/70 px-3 py-1.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  title={
                    strictText.length === 0
                      ? "Escribí un prompt estricto para regenerar"
                      : "Regenerar esta imagen con tu prompt (usa 1 crédito)"
                  }
                >
                  <RefreshCw
                    className={cn("h-3.5 w-3.5", isRegenerating && "animate-spin")}
                  />
                  {isRegenerating ? "Regenerando…" : "Regenerar (1 crédito)"}
                </button>

                {regenError ? (
                  <p className="text-[11px] leading-[1.5] text-destructive">
                    {regenError === "insufficient_credits" ? (
                      <>
                        Te quedaste sin créditos.{" "}
                        <a
                          href="/upgrade"
                          className="font-semibold underline hover:text-destructive/80"
                        >
                          Comprar créditos →
                        </a>
                      </>
                    ) : (
                      regenError
                    )}
                  </p>
                ) : null}
              </section>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SettingRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-3.5 py-2.5 last:border-b-0">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-mute">
        {label}
      </span>
      <div className="flex items-center gap-2 text-right">{children}</div>
    </div>
  );
}

function EmptyImagesState({ onGenerateMore }: { onGenerateMore: () => void }) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center gap-5 text-center">
      <Sparkles aria-hidden className="h-8 w-8 text-foreground/40" strokeWidth={1.5} />
      <h3 className="font-display text-[22px] italic text-foreground">
        Sin imágenes todavía
      </h3>
      <PillButton onClick={onGenerateMore}>
        <Plus aria-hidden className="h-4 w-4" />
        Generar variaciones
      </PillButton>
    </div>
  );
}
