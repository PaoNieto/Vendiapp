"use client";

/**
 * VersionDrawer
 *
 * Drawer lateral premium tipo Notion para abrir una versión sin perder el
 * contexto de la Fábrica. Slide-in desde la derecha en desktop (~65% del
 * ancho), ~85% en tablet, full-screen en mobile (<640px) porque un drawer
 * lateral en 375px no sirve.
 *
 * Decisiones técnicas:
 * - Usa `Dialog` de shadcn/Base UI (`components/ui/dialog.tsx`) para el
 *   manejo de open state, overlay clickeable, escape-to-close y focus trap.
 *   Customiza `DialogContent` con clases tailwind para que sea drawer
 *   lateral en vez del modal centrado por defecto. `showCloseButton={false}`
 *   porque metemos un X propio que vive al lado del breadcrumb.
 * - Tabs internos usan `Tabs` de Base UI (`components/ui/tabs.tsx`) en
 *   variant `line` para un look más limpio. El estado se controla local
 *   porque no necesita sincronizarse con la URL en este iteración.
 *
 * NOTA: las acciones "favear" y "descargar" sobre cada imagen están como
 * placeholder por ahora — el grid muestra el overlay en hover pero no hace
 * nada (TODO comentado abajo).
 */

import Image from "next/image";
import { useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  Heart,
  ImageIcon,
  Plus,
  Settings2,
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { OUTPUT_RATIOS } from "@/lib/constants";
import { formatRelativeTime } from "@/lib/generations/format";
import type {
  GeneratedImage,
  Generation,
} from "@/lib/generations/store";
import type { Product } from "@/lib/products/store";
import type { Version } from "@/lib/versions/store";
import { cn } from "@/lib/utils";

export type VersionDrawerProps = {
  /** Open state controlado por el parent. */
  open: boolean;
  /** Callback del open state — recibe `false` al cerrar. */
  onOpenChange: (open: boolean) => void;
  /** Versión activa. Si es `null`, el drawer no renderiza contenido. */
  version: Version | null;
  /** Producto padre (para breadcrumb). Si es `null`, breadcrumb degrada. */
  product: Product | null;
  /** Generaciones que cuelgan de esta versión (ordenadas desc por created_at). */
  generations: Generation[];
  /** Imágenes de TODAS las generations — el drawer filtra por gen.id dentro. */
  images: GeneratedImage[];
  /** Ej. navegá a /referencias con la versión activa en el recorrido. */
  onEditReferences: () => void;
  /** Ej. navegá a /formato con la versión activa. */
  onEditConfig: () => void;
  /** Ej. navegá a /fabrica con la versión activa. */
  onEditPrompt: () => void;
  /** Dispara una nueva tanda de generación. */
  onGenerateMore: () => void;
  /** Navegación a versión previa dentro del grid filtrado. */
  onPrevVersion?: () => void;
  /** Navegación a versión siguiente dentro del grid filtrado. */
  onNextVersion?: () => void;
  /** className passthrough sobre el `DialogContent`. */
  className?: string;
};

/**
 * Layout del drawer:
 *
 *  ┌─────────────────────────────────────────┐
 *  │  Producto / Versiones / Nombre   [X]    │
 *  ├─────────────────────────────────────────┤
 *  │  EYEBROW: VERSIÓN                        │
 *  │  H1 nombre — subtítulo descripción       │
 *  │  [+ Más variaciones]  [Editar prompt]    │
 *  ├─────────────────────────────────────────┤
 *  │  Imágenes | Refs | Config | Prompt       │
 *  ├─────────────────────────────────────────┤
 *  │  contenido del tab activo (scroll)       │
 *  ├─────────────────────────────────────────┤
 *  │  ← Anterior     Siguiente →              │
 *  └─────────────────────────────────────────┘
 */
export function VersionDrawer({
  open,
  onOpenChange,
  version,
  product,
  generations,
  images,
  onEditReferences,
  onEditConfig,
  onEditPrompt,
  onGenerateMore,
  onPrevVersion,
  onNextVersion,
  className,
}: VersionDrawerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          // Reset del posicionamiento default (top-1/2 left-1/2 -translate-x/y)
          // y max-width del modal centrado. Pegamos a la derecha y damos altura
          // completa para el drawer. inset-y-0 right-0 + translate-x-0 cancelan
          // el centrado original.
          "fixed inset-y-0 right-0 left-auto top-auto bottom-auto z-50 flex h-dvh max-h-dvh translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden p-0 ring-0",
          // Ancho responsive: mobile full, tablet ~85%, desktop ~65%.
          "w-full max-w-full sm:w-[85vw] sm:max-w-[85vw] lg:w-[65vw] lg:max-w-[1100px]",
          // Borde y radio: en mobile sin radio (full-screen), en desktop
          // redondeado a la izquierda + border-left blanco translúcido.
          "rounded-none sm:rounded-l-[24px] sm:border-l sm:border-white/70",
          // Glass premium sólido — usa el mismo treatment que .glass-card.
          "bg-white/85 backdrop-blur-[40px] backdrop-saturate-[160%] shadow-[0_24px_60px_rgba(15,40,24,0.22)]",
          // Animaciones: slide-in desde la derecha + fade del overlay.
          // 220ms ease-out (cubic-bezier(0.16, 1, 0.3, 1) ≈ ease-out premium).
          "duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
          "data-open:animate-in data-open:slide-in-from-right data-open:fade-in-0",
          "data-closed:animate-out data-closed:slide-out-to-right data-closed:fade-out-0",
          className,
        )}
      >
        {version ? (
          <DrawerBody
            version={version}
            product={product}
            generations={generations}
            images={images}
            onClose={() => onOpenChange(false)}
            onEditReferences={onEditReferences}
            onEditConfig={onEditConfig}
            onEditPrompt={onEditPrompt}
            onGenerateMore={onGenerateMore}
            onPrevVersion={onPrevVersion}
            onNextVersion={onNextVersion}
          />
        ) : (
          // Estado degradado — si el parent abre el drawer sin versión, mostramos
          // un placeholder neutro en vez de explotar. No debería pasar en flujo
          // normal, pero blindamos.
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-green-text">
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

type DrawerBodyProps = {
  version: Version;
  product: Product | null;
  generations: Generation[];
  images: GeneratedImage[];
  onClose: () => void;
  onEditReferences: () => void;
  onEditConfig: () => void;
  onEditPrompt: () => void;
  onGenerateMore: () => void;
  onPrevVersion?: () => void;
  onNextVersion?: () => void;
};

function DrawerBody({
  version,
  product,
  generations,
  images,
  onClose,
  onEditReferences,
  onEditConfig,
  onEditPrompt,
  onGenerateMore,
  onPrevVersion,
  onNextVersion,
}: DrawerBodyProps) {
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

  const ratioLabel =
    OUTPUT_RATIOS.find((r) => r.value === version.output_ratio)?.label ??
    version.output_ratio;

  return (
    <>
      {/* HEADER — breadcrumb + close. Sticky top sobre el scroll interno. */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/60 px-5 py-3 sm:px-6">
        <nav
          className="flex min-w-0 items-center gap-1 text-xs text-green-text"
          aria-label="Migas de pan"
        >
          <span className="truncate">{product?.name ?? "Producto"}</span>
          <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 opacity-60" />
          <span className="truncate">Versiones</span>
          <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 opacity-60" />
          <span className="truncate font-medium text-green-dark">
            {version.name}
          </span>
        </nav>

        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar drawer"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-green-text transition-colors hover:bg-white/70 hover:text-green-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-dark/40"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {/* HERO — eyebrow + título + descripción + CTAs primarios. */}
      <section className="shrink-0 px-5 py-5 sm:px-6 sm:py-6">
        <span className="eyebrow">Versión</span>
        <DialogTitle className="mt-2 text-2xl font-medium text-green-dark sm:text-3xl">
          {version.name}
        </DialogTitle>
        {version.description ? (
          <DialogDescription className="mt-1.5 text-sm text-green-text">
            {version.description}
          </DialogDescription>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <PillButton onClick={onGenerateMore}>
            <Plus aria-hidden className="h-4 w-4" />
            Más variaciones
          </PillButton>
          <button
            type="button"
            onClick={onEditPrompt}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/70 bg-white/60 px-4 py-2 text-[13px] font-medium text-green-dark transition-colors hover:bg-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-dark/40"
          >
            <Edit3 aria-hidden className="h-4 w-4" />
            Editar prompt
          </button>
        </div>
      </section>

      {/* TABS — content scrollable. Para que el footer quede sticky abajo,
          envolvemos los tabs en un flex-1 con overflow-y-auto. */}
      <Tabs
        defaultValue="images"
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="shrink-0 border-b border-white/60 px-5 sm:px-6">
          <TabsList
            variant="line"
            className="h-auto gap-1 overflow-x-auto rounded-none bg-transparent p-0"
          >
            <DrawerTab value="images" icon={<ImageIcon className="h-4 w-4" />}>
              Imágenes
            </DrawerTab>
            <DrawerTab value="refs" icon={<Sparkles className="h-4 w-4" />}>
              Refs
            </DrawerTab>
            <DrawerTab value="config" icon={<Settings2 className="h-4 w-4" />}>
              Config
            </DrawerTab>
            <DrawerTab value="prompt" icon={<Edit3 className="h-4 w-4" />}>
              Prompt
            </DrawerTab>
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
          <TabsContent value="images" className="outline-none">
            <ImagesTab
              images={versionImages}
              isGenerating={isGenerating}
              latestGen={latestGen}
              onGenerateMore={onGenerateMore}
            />
          </TabsContent>

          <TabsContent value="refs" className="outline-none">
            <RefsTab
              references={version.reference_images}
              onEditReferences={onEditReferences}
            />
          </TabsContent>

          <TabsContent value="config" className="outline-none">
            <ConfigTab
              ratio={version.output_ratio}
              ratioLabel={ratioLabel}
              variations={version.variations_default}
              onEditConfig={onEditConfig}
            />
          </TabsContent>

          <TabsContent value="prompt" className="outline-none">
            <PromptTab
              prompt={version.user_prompt}
              onEditPrompt={onEditPrompt}
            />
          </TabsContent>
        </div>
      </Tabs>

      {/* FOOTER — navegación entre versiones (sticky abajo). */}
      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-white/60 bg-white/40 px-5 py-3 sm:px-6">
        <button
          type="button"
          onClick={onPrevVersion}
          disabled={!onPrevVersion}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-green-dark transition-colors hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-dark/40"
        >
          <ChevronLeft aria-hidden className="h-4 w-4" />
          Anterior
        </button>
        <button
          type="button"
          onClick={onNextVersion}
          disabled={!onNextVersion}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-green-dark transition-colors hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-dark/40"
        >
          Siguiente
          <ChevronRight aria-hidden className="h-4 w-4" />
        </button>
      </footer>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Tab trigger — estilo line con paleta verde marca.                          */
/* -------------------------------------------------------------------------- */

function DrawerTab({
  value,
  icon,
  children,
}: {
  value: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <TabsTrigger
      value={value}
      className={cn(
        "relative inline-flex h-10 shrink-0 items-center gap-1.5 rounded-none border-0 border-b-2 border-transparent bg-transparent px-3 text-[13px] font-medium text-green-text transition-colors",
        "hover:text-green-dark",
        // Tab activo: bg-green-dark/8 + text-green-dark + border-b-2 green-dark.
        // Base UI marca el activo con `data-active`.
        "data-active:border-green-dark data-active:bg-green-dark/[0.08] data-active:text-green-dark",
        // Cancela el `after:` line indicator que pinta el TabsTrigger base —
        // acá lo manejamos con border-b directo para tener más control.
        "after:hidden",
      )}
    >
      {icon}
      {children}
    </TabsTrigger>
  );
}

/* -------------------------------------------------------------------------- */
/*  Tab: Imágenes                                                              */
/* -------------------------------------------------------------------------- */

function ImagesTab({
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
    return (
      <EmptyState
        title="Esta versión todavía no generó imágenes"
        description="Hacé click en '+ Más variaciones' para empezar a generar piezas para esta campaña."
        cta={
          <PillButton onClick={onGenerateMore}>
            <Plus aria-hidden className="h-4 w-4" />
            Más variaciones
          </PillButton>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {isGenerating && latestGen ? (
        <GeneratingPlaceholder
          variations={latestGen.variations_requested}
          startedAt={latestGen.created_at}
        />
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {images.map((img) => (
          <ImageTile key={img.id} image={img} />
        ))}
      </div>
    </div>
  );
}

function ImageTile({ image }: { image: GeneratedImage }) {
  return (
    <motion.figure
      whileHover={{ y: -2 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="group relative overflow-hidden rounded-[14px] border border-white/70 bg-white/40 shadow-[0_6px_20px_rgba(15,40,24,0.10)]"
    >
      <div className="relative aspect-square w-full">
        {image.image_url ? (
          <Image
            src={image.image_url}
            alt={`Variación ${image.variation_index + 1}`}
            fill
            sizes="(max-width: 640px) 50vw, 240px"
            className="object-cover transition-transform duration-200 ease-out group-hover:scale-[1.03]"
          />
        ) : (
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(135deg, var(--color-green-bg-start) 0%, var(--color-green-bg-mid) 50%, var(--color-green-bg-end) 100%)",
            }}
          />
        )}

        {/* Hover overlay con botones placeholder (favear / descargar).
            TODO(fabrica): wirear toggleFavorite y un download handler real
            — ahora son no-ops para que el grid se sienta vivo sin engañar. */}
        <div className="pointer-events-none absolute inset-0 flex items-end justify-end gap-1.5 bg-gradient-to-t from-black/30 via-transparent to-transparent p-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <button
            type="button"
            aria-label="Marcar como favorita"
            className="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-green-dark shadow-md transition-transform hover:scale-105"
          >
            <Heart className={cn("h-4 w-4", image.is_favorite && "fill-current")} />
          </button>
          <button
            type="button"
            aria-label="Descargar imagen"
            className="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-green-dark shadow-md transition-transform hover:scale-105"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.figure>
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
    <div className="flex items-center justify-between gap-3 rounded-[14px] border border-amber/40 bg-amber/10 px-4 py-3">
      <div className="flex items-center gap-3">
        <StatusBadge status="processing" size="sm" />
        <span className="text-sm text-green-dark">
          Generando {variations}{" "}
          {variations === 1 ? "variación" : "variaciones"}…
        </span>
      </div>
      <span className="text-xs text-green-text">
        {formatRelativeTime(startedAt)}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Tab: Refs                                                                  */
/* -------------------------------------------------------------------------- */

function RefsTab({
  references,
  onEditReferences,
}: {
  references: string[];
  onEditReferences: () => void;
}) {
  if (references.length === 0) {
    return (
      <EmptyState
        title="Esta versión no tiene referencias todavía"
        description="Agregá imágenes de inspiración para que la IA capture el mood que querés."
        cta={
          <PillButton onClick={onEditReferences}>
            <Plus aria-hidden className="h-4 w-4" />
            Agregar referencias
          </PillButton>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {references.map((url, idx) => (
          <div
            key={`${url}-${idx}`}
            className="relative aspect-square overflow-hidden rounded-[14px] border border-white/70 bg-white/40 shadow-[0_6px_20px_rgba(15,40,24,0.10)]"
          >
            <Image
              src={url}
              alt={`Referencia ${idx + 1}`}
              fill
              sizes="(max-width: 640px) 50vw, 240px"
              className="object-cover"
            />
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onEditReferences}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/70 bg-white/60 px-4 py-2 text-[13px] font-medium text-green-dark transition-colors hover:bg-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-dark/40"
        >
          <Edit3 aria-hidden className="h-4 w-4" />
          Editar referencias
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Tab: Config                                                                */
/* -------------------------------------------------------------------------- */

function ConfigTab({
  ratio,
  ratioLabel,
  variations,
  onEditConfig,
}: {
  ratio: string;
  ratioLabel: string;
  variations: number;
  onEditConfig: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="glass-card-compact p-4 sm:p-5">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <dt className="eyebrow">Ratio de salida</dt>
            <dd className="text-base font-medium text-green-dark">
              {ratioLabel}{" "}
              <span className="text-sm font-normal text-green-text">
                ({ratio})
              </span>
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="eyebrow">Variaciones por tanda</dt>
            <dd className="numeric-tabular text-base font-medium text-green-dark">
              {variations}
            </dd>
          </div>
        </dl>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onEditConfig}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/70 bg-white/60 px-4 py-2 text-[13px] font-medium text-green-dark transition-colors hover:bg-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-dark/40"
        >
          <Settings2 aria-hidden className="h-4 w-4" />
          Editar configuración
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Tab: Prompt                                                                */
/* -------------------------------------------------------------------------- */

function PromptTab({
  prompt,
  onEditPrompt,
}: {
  prompt: string;
  onEditPrompt: () => void;
}) {
  const hasPrompt = prompt.trim().length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="glass-card-compact p-4 sm:p-5">
        {hasPrompt ? (
          <pre className="whitespace-pre-line font-mono text-xs leading-relaxed text-green-dark sm:text-[13px]">
            {prompt}
          </pre>
        ) : (
          <p className="text-sm italic text-green-text">
            Esta versión todavía no tiene un prompt escrito.
          </p>
        )}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onEditPrompt}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/70 bg-white/60 px-4 py-2 text-[13px] font-medium text-green-dark transition-colors hover:bg-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-dark/40"
        >
          <Edit3 aria-hidden className="h-4 w-4" />
          Editar prompt
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Empty state reutilizable                                                   */
/* -------------------------------------------------------------------------- */

function EmptyState({
  title,
  description,
  cta,
}: {
  title: string;
  description: string;
  cta?: React.ReactNode;
}) {
  return (
    <div className="glass-card-compact flex flex-col items-center gap-3 px-5 py-10 text-center">
      <div
        aria-hidden
        className="flex h-12 w-12 items-center justify-center rounded-full bg-green-dark/8 text-green-dark"
      >
        <Sparkles className="h-5 w-5" />
      </div>
      <h3 className="text-base font-medium text-green-dark">{title}</h3>
      <p className="max-w-sm text-sm text-green-text">{description}</p>
      {cta ? <div className="mt-2">{cta}</div> : null}
    </div>
  );
}
