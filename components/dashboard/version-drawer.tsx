"use client";

/**
 * VersionDrawer
 *
 * (Mantiene el nombre por compat con `app/(app)/fabrica/page.tsx`, pero
 * **ya no es un drawer lateral**: ahora es un modal centrado.) Abrir una
 * versión sin perder el contexto de la Fábrica.
 *
 * Decisión conceptual: **una versión = receta fija inmutable**. No se editan
 * sus refs ni su config. Para variar algo, se DUPLICA. Por eso el modal
 * quedó simplificado a:
 *  - Header: breadcrumb + título + close.
 *  - Acciones: "+ Más variaciones" (primaria) + "Duplicar" (secundaria).
 *  - Body: grid de imágenes (o empty state).
 *
 * Decisiones técnicas:
 * - `Dialog` de shadcn/Base UI para manejo de open/overlay/escape/focus trap.
 *   El `DialogContent` base ya centra con top-1/2 left-1/2 -translate-x/y.
 * - El backdrop del `DialogOverlay` del sistema lo override-eamos local via
 *   `[&_[data-slot=dialog-overlay]]:bg-foreground/78` para que tape parejo
 *   en light y dark.
 * - El strict_prompt por imagen se muestra con un toggle/switch: off muestra
 *   texto descriptivo, on revela el textarea editable. El estado del switch
 *   es derivado de `strict_prompt !== ""` para no duplicar estado.
 *
 * Acciones:
 *  - Descargar imagen: TODO(fabrica) — sin endpoint todavía.
 *  - Regenerar por imagen: POST /api/generations/regenerate (prompt estricto,
 *    1 crédito). Requiere strict_prompt no-vacío.
 */

import Image from "next/image";
import { useMemo, useState } from "react";
import {
  Copy,
  Download,
  Heart,
  Info,
  Plus,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { motion } from "motion/react";

import { PillButton } from "@/components/dashboard/pill-button";
import { StatusBadge } from "@/components/dashboard/status-badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { formatRelativeTime } from "@/lib/generations/format";
import {
  useGenerations,
  type GeneratedImage,
  type Generation,
} from "@/lib/generations/store";
import type { Product } from "@/lib/products/store";
import type { Version } from "@/lib/versions/store";
import { cn } from "@/lib/utils";

export type VersionDrawerProps = {
  /** Open state controlado por el parent. */
  open: boolean;
  /** Callback del open state — recibe `false` al cerrar. */
  onOpenChange: (open: boolean) => void;
  /** Versión activa. Si es `null`, el modal no renderiza contenido. */
  version: Version | null;
  /** Producto padre (para breadcrumb). Si es `null`, breadcrumb degrada. */
  product: Product | null;
  /** Generaciones que cuelgan de esta versión (ordenadas desc por created_at). */
  generations: Generation[];
  /** Imágenes de TODAS las generations — el modal filtra por gen.id dentro. */
  images: GeneratedImage[];
  /** Dispara una nueva tanda de generación sobre esta misma versión. */
  onGenerateMore: () => void;
  /** Duplica la versión y abre la copia (handler del parent). */
  onDuplicate: () => void;
  /** className passthrough sobre el `DialogContent`. */
  className?: string;
};

/**
 * Layout del modal:
 *
 *  ┌─────────────────────────────────────────┐
 *  │  Producto › Versiones › Nombre   [X]    │
 *  │  H1 nombre                                │
 *  │  [+ Más variaciones]  [Duplicar]         │
 *  ├─────────────────────────────────────────┤
 *  │  Grid de imágenes (scroll vertical)      │
 *  └─────────────────────────────────────────┘
 */
export function VersionDrawer({
  open,
  onOpenChange,
  version,
  product,
  generations,
  images,
  onGenerateMore,
  onDuplicate,
  className,
}: VersionDrawerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          // Reset del p-4/gap-4/ring/bg-popover/max-w-sm/rounded-xl del base.
          // El `fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2` ya
          // viene del DialogContent base, así que el modal queda centrado.
          "!p-0 !gap-0 !ring-0",
          "!w-[calc(100%-1rem)] sm:!w-[calc(100%-2rem)] !max-w-[1040px]",
          "flex flex-col max-h-[90vh] rounded-[18px] overflow-hidden",
          "bg-card text-card-foreground border border-border",
          "shadow-[0_24px_64px_-16px_rgba(15,31,22,0.35)]",
          // Override del backdrop hermano (DialogOverlay) — bg-foreground/78
          // funciona en light y dark coherentemente.
          "[&~[data-slot=dialog-overlay]]:bg-foreground/78",
          // Animación sobria: fade + sutil zoom-in. El zoom ya está en base,
          // acá garantizamos el fade.
          "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
          "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          "duration-150 ease-out",
          className,
        )}
      >
        {version ? (
          <ModalBody
            version={version}
            product={product}
            generations={generations}
            images={images}
            onClose={() => onOpenChange(false)}
            onGenerateMore={onGenerateMore}
            onDuplicate={onDuplicate}
          />
        ) : (
          // Estado degradado — si el parent abre el modal sin versión, mostramos
          // un placeholder neutro en vez de explotar. No debería pasar en flujo
          // normal, pero blindamos.
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
            No hay versión seleccionada.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*  Body                                                                       */
/* -------------------------------------------------------------------------- */

type ModalBodyProps = {
  version: Version;
  product: Product | null;
  generations: Generation[];
  images: GeneratedImage[];
  onClose: () => void;
  onGenerateMore: () => void;
  onDuplicate: () => void;
};

function ModalBody({
  version,
  product,
  generations,
  images,
  onClose,
  onGenerateMore,
  onDuplicate,
}: ModalBodyProps) {
  // Imágenes de esta versión solamente — filtramos por las gens recibidas.
  const versionImages = useMemo(() => {
    const genIds = new Set(generations.map((g) => g.id));
    return images.filter((img) => genIds.has(img.generation_id));
  }, [images, generations]);

  // La última generation (la más reciente) — `generations` ya viene ordenada
  // por created_at desc desde el store (`getByVersionId`).
  const latestGen = generations[0] ?? null;
  const isGenerating =
    latestGen?.status === "processing" || latestGen?.status === "pending";

  return (
    <>
      {/* HEADER — breadcrumb + close + título + acciones. */}
      <header className="relative shrink-0 border-b border-border px-5 py-5 sm:px-7 sm:py-6">
        {/* Breadcrumb fino */}
        <nav
          className="flex min-w-0 items-center gap-1.5 pr-12 text-[12px]"
          aria-label="Migas de pan"
        >
          {product ? (
            <>
              <span className="truncate text-muted-foreground/60">
                {product.name}
              </span>
              <span
                aria-hidden
                className="shrink-0 text-muted-foreground/60"
              >
                ›
              </span>
            </>
          ) : null}
          <span className="truncate text-muted-foreground/60">Versiones</span>
          <span aria-hidden className="shrink-0 text-muted-foreground/60">
            ›
          </span>
          <span className="truncate text-foreground/75">{version.name}</span>
        </nav>

        {/* Título — sin eyebrow ni meta inline; la versión es inmutable así
            que no hace falta sobreexponer metadata. */}
        <DialogTitle className="mt-3 font-display text-[34px] italic leading-[1.1] tracking-[-0.01em] text-foreground">
          {version.name}
        </DialogTitle>

        {/* Description (oculta visualmente — Base UI Dialog requiere algo
            accesible; el título ya cubre, pero por las dudas dejamos sr-only) */}
        {version.description ? (
          <DialogDescription className="sr-only">
            {version.description}
          </DialogDescription>
        ) : null}

        {/* Acciones — PillButton (primaria) + Duplicar (secundaria). */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <PillButton size="sm" onClick={onGenerateMore}>
            <Plus aria-hidden className="h-4 w-4" />
            Más variaciones
          </PillButton>
          <button
            type="button"
            onClick={onDuplicate}
            className={cn(
              "inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-border bg-transparent px-4 py-1.5",
              "text-[13px] font-semibold text-foreground transition-colors",
              "hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40",
            )}
          >
            <Copy aria-hidden className="h-4 w-4" />
            Duplicar
          </button>
        </div>

        {/* Close button (X) */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {/* BODY — grid de imágenes (o empty state) scrollable. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7 sm:py-7">
        <ImagesGrid
          images={versionImages}
          isGenerating={isGenerating}
          latestGen={latestGen}
          onGenerateMore={onGenerateMore}
        />
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Imágenes                                                                   */
/* -------------------------------------------------------------------------- */

function ImagesGrid({
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

      <div className="grid grid-cols-2 gap-[18px] lg:grid-cols-3">
        {images.map((img, idx) => (
          <ImageTile key={img.id} image={img} index={idx + 1} />
        ))}
      </div>
    </div>
  );
}

/**
 * Tile de imagen con strict_prompt editable inline.
 *
 * - Badge "V{n}" top-LEFT, mayúscula.
 * - Fav/Download top-RIGHT visibles solo en hover.
 * - Footer: eyebrow + ícono info + switch a la derecha. El switch revela
 *   un textarea cuando está on; off muestra texto descriptivo.
 * - Estado del switch derivado del `strict_prompt` del store: si el usuario
 *   tipea algo, se queda en on; si lo borra y mueve el switch a off, no se
 *   pierde data porque off solo oculta el textarea. Para "activar" desde off
 *   levantamos un override local.
 *
 * Acciones:
 *  - Descargar: TODO(fabrica) — conectar handler real cuando exista endpoint.
 *  - Regenerar con este prompt: POST /api/generations/regenerate (1 crédito),
 *    habilitado solo con strict_prompt no-vacío.
 */
function ImageTile({
  image,
  index,
}: {
  image: GeneratedImage;
  index: number;
}) {
  const { setImagePrompt, toggleFavorite } = useGenerations();

  // El switch arranca on si ya hay prompt persistido. `localOn` permite que
  // el usuario active el switch sin contenido todavía (caso: quiere escribir
  // un prompt nuevo). Una vez activo, ya es prompt.length > 0 → on derivado.
  const [localOn, setLocalOn] = useState(false);
  const promptOn = image.strict_prompt.trim().length > 0 || localOn;

  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);
  const strictText = image.strict_prompt.trim();
  const canRegenerate = strictText.length > 0 && !isRegenerating;

  async function handleRegenerate() {
    if (!canRegenerate) return;
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
      // Éxito: recargamos para traer la nueva variación del server.
      window.location.reload();
    } catch {
      setRegenError("No se pudo conectar. Revisá tu internet e intentá de nuevo.");
    } finally {
      setIsRegenerating(false);
    }
  }

  function handleToggle() {
    if (promptOn) {
      // Apagar: limpiar prompt y override local.
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
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-[16px]",
        "bg-card border border-border",
        "shadow-[0_1px_0_rgba(15,31,22,0.06),0_10px_28px_-14px_rgba(15,31,22,0.28)]",
        "hover:shadow-[0_2px_0_rgba(15,31,22,0.08),0_20px_44px_-20px_rgba(15,31,22,0.42)]",
        "transition-shadow duration-200",
      )}
    >
      {/* Imagen — full-bleed arriba, sin padding */}
      <div className="relative aspect-square w-full overflow-hidden">
        {image.image_url ? (
          <Image
            src={image.image_url}
            alt={`Variación ${image.variation_index + 1}`}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 320px"
            className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04]"
          />
        ) : (
          <div
            aria-hidden
            className="absolute inset-0 bg-foreground/5"
          />
        )}

        {/* Badge V{n} — top-LEFT, mayúscula, mono */}
        <span
          className={cn(
            "absolute left-2.5 top-2.5 inline-flex items-center rounded-md px-2 py-1",
            "bg-foreground/60 text-background backdrop-blur-sm",
            "font-mono text-[10px] uppercase",
          )}
          style={{ letterSpacing: "0.12em" }}
        >
          V{index}
        </span>

        {/* Acciones hover — top-RIGHT, fav + download */}
        <div className="absolute right-2.5 top-2.5 flex items-center gap-1.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <button
            type="button"
            aria-label={
              image.is_favorite ? "Quitar de favoritas" : "Marcar como favorita"
            }
            aria-pressed={image.is_favorite}
            onClick={() => toggleFavorite(image.id)}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-full backdrop-blur-sm transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40",
              "bg-foreground/60 text-background",
            )}
          >
            <Heart
              className={cn("h-3.5 w-3.5", image.is_favorite && "fill-current")}
            />
          </button>
          <button
            type="button"
            aria-label="Descargar imagen"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-foreground/60 text-background backdrop-blur-sm transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
            title="Próximamente"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Footer: eyebrow + info + switch + (textarea | descripción) + regenerar */}
      <div className="flex flex-col gap-2.5 px-4 py-4">
        {/* Fila 1: eyebrow + info a la IZQUIERDA, switch a la DERECHA */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="eyebrow">Prompt estricto</span>
            <span
              title="La IA cumple tu prompt de forma prioritaria (≈99.9% de fidelidad), por encima del estilo y las referencias, y sin inventar."
              aria-label="La IA cumple tu prompt de forma prioritaria, por encima del estilo y las referencias, sin inventar."
              className="inline-flex h-[16px] w-[16px] cursor-help items-center justify-center rounded-full bg-foreground/[0.06] text-muted-foreground transition-colors hover:bg-foreground/[0.12] hover:text-foreground"
            >
              <Info className="h-2.5 w-2.5" strokeWidth={2.2} />
            </span>
          </div>
          <PromptSwitch
            on={promptOn}
            onToggle={handleToggle}
            ariaLabel={
              promptOn ? "Desactivar prompt estricto" : "Activar prompt estricto"
            }
          />
        </div>

        {/* Fila 2: textarea (si on) o descripción (si off) */}
        {promptOn ? (
          <Textarea
            value={image.strict_prompt}
            onChange={(e) => setImagePrompt(image.id, e.target.value)}
            placeholder="Describí qué priorizar en esta variación…"
            rows={3}
            className="min-h-[68px] resize-none rounded-[10px] border-border bg-background/40 px-3 py-2 font-mono text-[11.5px] leading-[1.6] text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
          />
        ) : (
          <p className="text-[12px] leading-[1.5] text-muted-foreground">
            Sin prompt — usa estilo + referencias de la versión.
          </p>
        )}

        {/* Aclaración de fidelidad (solo cuando el prompt está activo). */}
        {promptOn ? (
          <p className="text-[11px] leading-[1.5] text-muted-foreground">
            La IA cumple tu especificación de forma prioritaria (≈99.9% de
            fidelidad), por encima del estilo y las referencias, sin inventar.
          </p>
        ) : null}

        {/* Fila 3: botón Regenerar — ancho completo */}
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={!canRegenerate}
          className="inline-flex w-full min-h-[34px] items-center justify-center gap-1.5 rounded-md border border-border bg-transparent px-3 py-1.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
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
      </div>
    </motion.figure>
  );
}

/**
 * Switch custom — track 26x14, knob 10px. Off: bg-foreground/[0.12].
 * On: bg-foreground + knob bg-background. Render como button accesible.
 */
function PromptSwitch({
  on,
  onToggle,
  ariaLabel,
}: {
  on: boolean;
  onToggle: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      onClick={onToggle}
      className={cn(
        "relative inline-flex h-[14px] w-[26px] shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40",
        on ? "bg-foreground" : "bg-foreground/[0.12]",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-1/2 h-[10px] w-[10px] -translate-y-1/2 rounded-full transition-transform",
          on
            ? "translate-x-[14px] bg-background"
            : "translate-x-[2px] bg-foreground/40",
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
          Generando {variations}{" "}
          {variations === 1 ? "variación" : "variaciones"}…
        </span>
      </div>
      <span className="text-xs text-muted-foreground">
        {formatRelativeTime(startedAt)}
      </span>
    </div>
  );
}

/**
 * Empty state minimalista cuando 0 imágenes: ícono + título + botón. Sin
 * párrafo descriptivo, sin slot extra.
 */
function EmptyImagesState({ onGenerateMore }: { onGenerateMore: () => void }) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center gap-5 text-center">
      <Sparkles
        aria-hidden
        className="h-8 w-8 text-foreground/40"
        strokeWidth={1.5}
      />
      <h3 className="font-display text-[22px] italic text-foreground">
        Sin imágenes todavía
      </h3>
      <PillButton onClick={onGenerateMore}>
        <Plus aria-hidden className="h-4 w-4" />
        Más variaciones
      </PillButton>
    </div>
  );
}
