"use client";

/**
 * VersionGallery — grid de imágenes generadas de una versión.
 *
 * Extraído del antiguo VersionDrawer para poder reutilizarlo en la PÁGINA
 * completa de la versión (`/fabrica/[versionId]`). Decisión de producto
 * (2026-06): la versión se abre en página completa, no en modal.
 *
 * Incluye: tile con imagen + badge V{n}, favorito, descarga (placeholder),
 * y el toggle de prompt estricto por imagen.
 */

import Image from "next/image";
import { useState } from "react";
import { Download, Heart, Info, Plus, RefreshCw, Sparkles } from "lucide-react";
import { motion } from "motion/react";

import { PillButton } from "@/components/dashboard/pill-button";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { formatRelativeTime } from "@/lib/generations/format";
import {
  useGenerations,
  type GeneratedImage,
  type Generation,
} from "@/lib/generations/store";
import { cn } from "@/lib/utils";

export function VersionGallery({
  images,
  isGenerating,
  latestGen,
  onGenerateMore,
}: {
  images: GeneratedImage[];
  isGenerating: boolean;
  latestGen: Generation | null;
  onGenerateMore: () => void;
}) {
  if (images.length === 0 && !isGenerating) {
    return <EmptyImagesState onGenerateMore={onGenerateMore} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {isGenerating && latestGen ? (
        <GeneratingPlaceholder
          variations={latestGen.variations_requested}
          startedAt={latestGen.created_at}
        />
      ) : null}

      <div className="grid grid-cols-2 gap-[18px] sm:grid-cols-3 lg:grid-cols-4">
        {images.map((img, idx) => (
          <ImageTile key={img.id} image={img} index={idx + 1} />
        ))}
      </div>
    </div>
  );
}

function ImageTile({ image, index }: { image: GeneratedImage; index: number }) {
  const { setImagePrompt, toggleFavorite } = useGenerations();
  const [localOn, setLocalOn] = useState(false);
  const promptOn = image.strict_prompt.trim().length > 0 || localOn;

  function handleToggle() {
    if (promptOn) {
      setImagePrompt(image.id, "");
      setLocalOn(false);
    } else {
      setLocalOn(true);
    }
  }

  return (
    <motion.figure
      whileHover={{ y: -3 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="glass-card-compact group relative flex flex-col overflow-hidden"
    >
      <div className="relative aspect-square w-full overflow-hidden">
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
            onClick={() => toggleFavorite(image.id)}
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
            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-foreground/60 text-background backdrop-blur-sm transition-transform hover:scale-110"
          >
            <Download className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="eyebrow">Prompt estricto</span>
            <span
              title="La IA priorizará este texto sobre el estilo y las referencias"
              className="inline-flex h-[16px] w-[16px] cursor-help items-center justify-center rounded-full bg-foreground/[0.06] text-muted-foreground"
            >
              <Info className="h-2.5 w-2.5" strokeWidth={2.2} />
            </span>
          </div>
          <PromptSwitch on={promptOn} onToggle={handleToggle} />
        </div>

        {promptOn ? (
          <Textarea
            value={image.strict_prompt}
            onChange={(e) => setImagePrompt(image.id, e.target.value)}
            placeholder="Describí qué priorizar en esta variación…"
            rows={3}
            className="min-h-[68px] resize-none rounded-[10px] border-border bg-background/40 px-3 py-2 font-mono text-[11.5px] leading-[1.6]"
          />
        ) : (
          <p className="text-[12px] leading-[1.5] text-muted-foreground">
            Sin prompt — usa estilo + referencias de la versión.
          </p>
        )}

        <button
          type="button"
          className="inline-flex w-full min-h-[34px] items-center justify-center gap-1.5 rounded-md border border-border bg-transparent px-3 py-1.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          disabled
          title="Próximamente — regeneración por imagen"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Regenerar
        </button>
      </div>
    </motion.figure>
  );
}

function PromptSwitch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={on ? "Desactivar prompt estricto" : "Activar prompt estricto"}
      onClick={onToggle}
      className={cn(
        "relative inline-flex h-[14px] w-[26px] shrink-0 items-center rounded-full transition-colors",
        on ? "bg-foreground" : "bg-foreground/[0.12]",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-1/2 h-[10px] w-[10px] -translate-y-1/2 rounded-full transition-transform",
          on ? "translate-x-[14px] bg-background" : "translate-x-[2px] bg-foreground/40",
        )}
      />
    </button>
  );
}

function GeneratingPlaceholder({
  variations,
  startedAt,
}: {
  variations: number;
  startedAt: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[14px] border border-border bg-foreground/[0.04] px-4 py-3">
      <div className="flex items-center gap-3">
        <StatusBadge status="processing" size="sm" />
        <span className="text-sm text-foreground">
          Generando {variations} {variations === 1 ? "variación" : "variaciones"}…
        </span>
      </div>
      <span className="text-xs text-muted-foreground">
        {formatRelativeTime(startedAt)}
      </span>
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
