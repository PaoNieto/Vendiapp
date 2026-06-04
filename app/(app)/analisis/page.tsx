"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Loader2,
  Plus,
  ScanSearch,
  Trash2,
  X,
} from "lucide-react";
import {
  AvatarCircle,
  HeroCTAButton,
  PillButton,
} from "@/components/dashboard";
import { Topbar } from "@/components/app/topbar";
import {
  ImageUploader,
  RatioSelector,
  type RatioValue,
  type UploadedImage,
} from "@/components/fabrica";
import {
  CURATED_STYLES,
  type CuratedStyleId,
} from "@/app/(app)/referencias/page";
import { useAnalyses, type Analysis } from "@/lib/analyses/store";
import { formatRelativeTime } from "@/lib/generations/format";
import { useUserInitials } from "@/lib/auth/use-user";
import { cn } from "@/lib/utils";

/**
 * Análisis con IA — herramienta independiente de inteligencia competitiva.
 *
 * El usuario sube UNA imagen (propia o de competencia) + indica el ratio.
 * La app devuelve un análisis sustancioso (composición, iluminación,
 * por qué vende) + los estilos curados identificados.
 *
 * Los análisis se persisten en `vendi:analyses` (localStorage) para que el
 * usuario pueda volver a verlos como una galería editorial — antes se
 * descartaban en cada análisis nuevo.
 *
 * Tres estados de pantalla:
 *   A) gallery  — galería de análisis previos (default cuando hay >= 1).
 *   B) creating — formulario para nuevo análisis (default cuando hay 0).
 *   C) viewing  — un análisis específico abierto.
 *
 * NO hay deep-link con `?id=` — el viewing state es solo memoria local.
 * Si el usuario refresca viendo un análisis, vuelve a la galería; el
 * análisis sigue ahí, lo abre con un click. Trade-off conscientemente
 * tomado para no acoplar la URL al store hasta que conectemos backend.
 *
 * Todo el análisis es MOCK por ahora — devuelve siempre el mismo texto
 * sustancioso independiente de la imagen subida. Cuando conectemos
 * Gemini Vision, este mock se reemplaza por una llamada real al backend.
 */

/* -------------------------------------------------------------------------- */
/*  Tipos locales                                                              */
/* -------------------------------------------------------------------------- */

type IdentifiedStyle = {
  id: CuratedStyleId;
  reason: string;
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const RATIO_LABEL: Record<RatioValue, string> = {
  "1:1": "Cuadrado 1:1",
  "4:5": "Vertical 4:5",
  "9:16": "Historia 9:16",
  "16:9": "Horizontal 16:9",
};

/**
 * aspect-ratio CSS para cada ratio del Cuaderno. Usamos un string `w / h`
 * directamente — Tailwind no tiene una clase nativa para `9 / 16`, pero
 * aspect-* acepta arbitrary values: `aspect-[9/16]`.
 */
const RATIO_ASPECT: Record<RatioValue, string> = {
  "1:1": "aspect-square",
  "4:5": "aspect-[4/5]",
  "9:16": "aspect-[9/16]",
  "16:9": "aspect-video",
};


/**
 * Convierte un `blob:` URL del uploader a un dataURL base64 que persiste en
 * localStorage. Los blob URLs viven solo en memoria del navegador y mueren
 * en el siguiente refresh — inservibles para una galería persistida.
 *
 * Si la imagen es grande (>2MB), el dataURL puede saturar el quota de
 * localStorage (~5MB total entre todos los stores). TODO: comprimir antes
 * de persistir si vemos quota errors en producción; mientras tanto el
 * uploader limita a 8MB por archivo.
 */
async function blobUrlToDataUrl(blobUrl: string): Promise<string> {
  const res = await fetch(blobUrl);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("FileReader did not return a string"));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Saca un título corto para una card de galería. Toma los primeros 60
 * chars del primer párrafo de composición, recortando en la palabra
 * más cercana — más editorial que "Análisis del lunes 19".
 */
function shortTitle(analysis: Analysis): string {
  const firstParagraph = analysis.composition.split(/\n\s*\n/)[0] ?? "";
  const clean = firstParagraph.replace(/\s+/g, " ").trim();
  if (clean.length <= 60) return clean;
  const slice = clean.slice(0, 60);
  const lastSpace = slice.lastIndexOf(" ");
  return `${lastSpace > 30 ? slice.slice(0, lastSpace) : slice}…`;
}

/* -------------------------------------------------------------------------- */
/*  Estado de pantalla                                                          */
/* -------------------------------------------------------------------------- */

type ScreenState =
  | { kind: "gallery" }
  | { kind: "creating" }
  | { kind: "viewing"; id: string };

type CreatingState =
  | { kind: "idle" }
  | { kind: "uploading"; image: UploadedImage; ratio: RatioValue | null }
  | { kind: "analyzing"; image: UploadedImage; ratio: RatioValue };

/* -------------------------------------------------------------------------- */
/*  Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function AnalisisPage() {
  const analyses = useAnalyses();
  const brandInitials = useUserInitials();

  // El estado de pantalla arranca en "gallery" porque preferimos pintar la
  // galería ni bien hidrate. La transición a "creating" cuando hay 0
  // análisis la hace el efecto de abajo — así evitamos un flash de "0
  // análisis" antes de saberlo realmente.
  const [screen, setScreen] = useState<ScreenState>({ kind: "gallery" });
  const [creating, setCreating] = useState<CreatingState>({ kind: "idle" });
  // Banner de error inline. Mismo sentinel `"missing_key"` que usa /fabrica
  // para activar copy + CTA específicos a Mi Negocio.
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Si recién hidrata y no hay análisis previos, saltamos directo al
  // estado B (nuevo análisis). Si hay, nos quedamos en galería. Esto
  // corre una sola vez por hidratación.
  const hasAnalyses = analyses.state.analyses.length > 0;
  useEffect(() => {
    if (!analyses.hydrated) return;
    if (!hasAnalyses && screen.kind === "gallery") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- transición post-hidratación inevitable.
      setScreen({ kind: "creating" });
    }
  }, [analyses.hydrated, hasAnalyses, screen.kind]);

  // Dispara la llamada real a Gemini Vision cuando entramos a estado
  // `analyzing`. El `cancelled` flag previene setState fantasmas si el
  // usuario navega fuera mientras la request está en vuelo (3-8s típico).
  useEffect(() => {
    if (creating.kind !== "analyzing") return;
    let cancelled = false;

    (async () => {
      try {
        // 1. Convertimos el blob URL del uploader a dataURL persistente.
        //    Necesario para guardar en localStorage Y para mandarlo a Gemini
        //    como `inlineData` base64.
        const dataUrl = await blobUrlToDataUrl(creating.image.previewUrl);
        if (cancelled) return;

        // 2. Análisis SERVER-SIDE (Oráculo) con la key propia de Vendí.
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageDataUrl: dataUrl, ratio: creating.ratio }),
        });
        if (cancelled) return;

        if (!res.ok) {
          setErrorBanner(
            "No se pudo analizar la imagen. Intentá de nuevo en un momento.",
          );
          setCreating({ kind: "idle" });
          return;
        }
        const analysis = (await res.json()) as {
          composition: string;
          lighting: string;
          why_it_sells: string;
          identified_styles: { id: CuratedStyleId; reason: string }[];
        };
        if (cancelled) return;

        // 3. Persistimos en el store y navegamos a la vista de detalle.
        const saved = analyses.createAnalysis({
          image_url: dataUrl,
          output_ratio: creating.ratio,
          composition: analysis.composition,
          lighting: analysis.lighting,
          why_it_sells: analysis.why_it_sells,
          identified_styles: [...analysis.identified_styles],
        });
        setCreating({ kind: "idle" });
        setScreen({ kind: "viewing", id: saved.id });
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error
            ? err.message
            : "No pudimos leer la imagen para analizar.";
        setErrorBanner(message);
        setCreating({ kind: "idle" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [creating, analyses]);

  function handleImageChange(next: UploadedImage[]) {
    const image = next[0] ?? null;
    if (!image) {
      setCreating({ kind: "idle" });
      return;
    }
    const currentRatio =
      creating.kind === "uploading" ? creating.ratio : null;
    setCreating({ kind: "uploading", image, ratio: currentRatio });
  }

  function handleRatioChange(ratio: RatioValue) {
    if (creating.kind === "uploading") {
      setCreating({ kind: "uploading", image: creating.image, ratio });
    }
  }

  function handleAnalyze() {
    if (creating.kind !== "uploading") return;
    if (!creating.ratio) return;

    setErrorBanner(null);
    setCreating({
      kind: "analyzing",
      image: creating.image,
      ratio: creating.ratio,
    });
  }

  function startNew() {
    setCreating({ kind: "idle" });
    setScreen({ kind: "creating" });
  }

  function backToGallery() {
    setCreating({ kind: "idle" });
    setScreen({ kind: "gallery" });
  }

  function viewAnalysis(id: string) {
    setScreen({ kind: "viewing", id });
  }

  function deleteAnalysis(id: string) {
    analyses.removeAnalysis(id);
    // Después de borrar, si quedó vacío, vamos directo a creating.
    const remaining = analyses.state.analyses.filter((a) => a.id !== id);
    if (remaining.length === 0) {
      setScreen({ kind: "creating" });
    } else {
      setScreen({ kind: "gallery" });
    }
  }

  // Subtítulo del topbar — cambia según la pantalla activa para dar
  // contexto editorial sin sumar más chrome.
  const topbarSubtitle =
    screen.kind === "gallery"
      ? "Tu colección de análisis. Aprendé qué hace funcionar cada imagen."
      : screen.kind === "creating"
        ? "Subí una imagen y descubrí por qué funciona — y cómo replicar su estilo."
        : "Análisis guardado en tu colección.";

  const showNewCta =
    screen.kind === "gallery" && hasAnalyses && analyses.hydrated;

  return (
    <>
      <Topbar
        title="Análisis con IA"
        subtitle={topbarSubtitle}
        right={
          <>
            {showNewCta ? (
              <PillButton size="md" onClick={startNew}>
                <Plus className="h-4 w-4" aria-hidden />
                Nuevo análisis
              </PillButton>
            ) : null}
            <AvatarCircle initials={brandInitials} size={40} />
          </>
        }
      />

      <div className="flex flex-1 flex-col gap-6 px-5 pb-10 pt-2 sm:px-8 lg:px-10">
        {errorBanner ? (
          <ErrorBanner
            message={errorBanner}
            onDismiss={() => setErrorBanner(null)}
          />
        ) : null}
        {!analyses.hydrated ? (
          <GallerySkeleton />
        ) : screen.kind === "gallery" ? (
          <Gallery
            analyses={analyses.getRecent()}
            onSelect={viewAnalysis}
            onStartNew={startNew}
          />
        ) : screen.kind === "creating" ? (
          <CreatingFlow
            state={creating}
            hasAnalyses={hasAnalyses}
            onImageChange={handleImageChange}
            onRatioChange={handleRatioChange}
            onAnalyze={handleAnalyze}
            onBack={hasAnalyses ? backToGallery : undefined}
          />
        ) : (
          <ViewingScreen
            analysisId={screen.id}
            onStartNew={startNew}
            onBackToGallery={backToGallery}
            onDelete={deleteAnalysis}
          />
        )}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Estado A — galería                                                          */
/* -------------------------------------------------------------------------- */

function Gallery({
  analyses,
  onSelect,
  onStartNew,
}: {
  analyses: Analysis[];
  onSelect: (id: string) => void;
  onStartNew: () => void;
}) {
  // Defensa: si por timing entramos a gallery con 0 análisis, mostramos
  // un empty state con CTA en lugar de un grid vacío.
  if (analyses.length === 0) {
    return <EmptyGallery onStartNew={onStartNew} />;
  }
  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:gap-6">
        {analyses.map((a) => (
          <AnalysisCard key={a.id} analysis={a} onClick={() => onSelect(a.id)} />
        ))}
      </div>
    </div>
  );
}

function AnalysisCard({
  analysis,
  onClick,
}: {
  analysis: Analysis;
  onClick: () => void;
}) {
  const title = shortTitle(analysis);
  const relative = formatRelativeTime(analysis.created_at);
  // Top-3 estilos identificados; si vienen menos los pintamos igual.
  const chips = analysis.identified_styles.slice(0, 3);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-[18px] text-left",
        "bg-card border border-border",
        "shadow-[0_1px_0_rgba(15,31,22,0.06),0_12px_32px_-16px_rgba(15,31,22,0.32),0_40px_80px_-40px_rgba(15,31,22,0.18)]",
        "transition-all duration-300",
        "hover:-translate-y-1 hover:shadow-[0_2px_0_rgba(15,31,22,0.08),0_24px_56px_-20px_rgba(15,31,22,0.45),0_48px_96px_-32px_rgba(15,31,22,0.22)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
      )}
    >
      <div className="relative w-full aspect-square overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={analysis.image_url}
          alt="Imagen analizada"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05]"
        />
        {/* Sheen sutil para profundidad */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/8 to-transparent"
        />
      </div>

      <div aria-hidden className="h-px w-full bg-border" />

      <div className="flex flex-col gap-2.5 px-5 py-5">
        <div className="flex items-center justify-between gap-2">
          <span className="eyebrow">Análisis</span>
          <span className="text-[11px] font-medium text-muted-foreground">
            {relative}
          </span>
        </div>
        <h3
          className="line-clamp-2 font-display text-[17px] italic leading-[1.2] tracking-[-0.01em] text-foreground"
          title={title}
        >
          {title}
        </h3>
        {chips.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {chips.map((chip) => {
              const style = CURATED_STYLES.find((s) => s.id === chip.id);
              const label = style?.label ?? chip.id;
              return (
                <span
                  key={chip.id}
                  className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                >
                  {label}
                </span>
              );
            })}
          </div>
        ) : null}
      </div>
    </button>
  );
}

function EmptyGallery({ onStartNew }: { onStartNew: () => void }) {
  return (
    <div className="glass-card mx-auto mt-4 flex max-w-md flex-col items-center gap-3 p-8 text-center sm:p-10">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-foreground/5 text-foreground">
        <ScanSearch className="h-5 w-5" strokeWidth={1.6} />
      </div>
      <h2 className="font-display text-2xl italic text-foreground">
        Sin análisis todavía
      </h2>
      <p className="max-w-sm text-sm text-mute">
        Subí una imagen para descubrir su composición, mood y estilos
        identificados.
      </p>
      <div className="mt-2">
        <PillButton size="md" onClick={onStartNew}>
          <Plus className="h-4 w-4" aria-hidden />
          Nuevo análisis
        </PillButton>
      </div>
    </div>
  );
}

function GallerySkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 xl:gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-[18px] border border-border bg-card"
          >
            <div className="aspect-square w-full animate-pulse bg-foreground/5" />
            <div className="h-px w-full bg-border" />
            <div className="flex flex-col gap-2 px-5 py-5">
              <div className="h-5 w-2/3 animate-pulse rounded bg-foreground/10" />
              <div className="h-3.5 w-1/2 animate-pulse rounded bg-foreground/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Estado B — creando                                                          */
/* -------------------------------------------------------------------------- */

function CreatingFlow({
  state,
  hasAnalyses,
  onImageChange,
  onRatioChange,
  onAnalyze,
  onBack,
}: {
  state: CreatingState;
  hasAnalyses: boolean;
  onImageChange: (next: UploadedImage[]) => void;
  onRatioChange: (ratio: RatioValue) => void;
  onAnalyze: () => void;
  onBack?: () => void;
}) {
  const uploaderValue: UploadedImage[] =
    state.kind === "uploading" || state.kind === "analyzing"
      ? [state.image]
      : [];
  const selectedRatio: RatioValue | null =
    state.kind === "uploading" ? state.ratio : null;
  const canAnalyze =
    state.kind === "uploading" &&
    state.image !== null &&
    state.ratio !== null;

  return (
    <section className="mx-auto w-full max-w-3xl">
      {/* Toolbar superior — visible solo si hay galería a la que volver */}
      {onBack && hasAnalyses ? (
        <div className="mb-4">
          <PillButton size="sm" onClick={onBack}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Volver a la galería
          </PillButton>
        </div>
      ) : null}

      {state.kind === "analyzing" ? (
        <AnalyzingCard image={state.image} />
      ) : (
        <div className="glass-card flex flex-col gap-7 p-6 sm:p-9">
          <header className="flex flex-col gap-2">
            <span className="eyebrow">Análisis</span>
            <h2 className="font-display text-2xl italic leading-tight text-foreground sm:text-[28px]">
              Subí una imagen para analizar
            </h2>
            <p className="max-w-xl text-sm text-mute">
              Funciona con fotos propias o de competencia. La IA identifica
              composición, mood, estilos y por qué la imagen vende.
            </p>
          </header>

          <ImageUploader
            multi={false}
            max={1}
            value={uploaderValue}
            onChange={onImageChange}
            hint="PNG, JPG o WebP. Una sola imagen por análisis."
          />

          <div className="flex flex-col gap-3">
            <span className="eyebrow">Formato de la imagen</span>
            <RatioSelector value={selectedRatio} onChange={onRatioChange} />
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <div
              className={cn(!canAnalyze && "pointer-events-none opacity-50")}
              aria-disabled={!canAnalyze}
            >
              <HeroCTAButton icon={ScanSearch} onClick={onAnalyze}>
                Analizar imagen
              </HeroCTAButton>
            </div>
            {!canAnalyze ? (
              <span className="text-center text-[11px] text-mute sm:text-right">
                {uploaderValue.length === 0
                  ? "Subí una imagen para empezar."
                  : "Elegí un formato para habilitar el análisis."}
              </span>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

function AnalyzingCard({ image }: { image: UploadedImage }) {
  return (
    <div className="glass-card flex flex-col items-center gap-6 p-8 text-center sm:p-12">
      <div className="relative h-32 w-32 overflow-hidden rounded-xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.previewUrl}
          alt="Imagen en análisis"
          className="h-full w-full animate-pulse object-cover"
        />
      </div>
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="h-7 w-7 animate-spin text-primary" aria-hidden />
        <span className="eyebrow">Analizando</span>
        <p className="text-sm text-mute">
          Analizando composición, mood y estilos…
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Estado C — viendo un análisis                                               */
/* -------------------------------------------------------------------------- */

function ViewingScreen({
  analysisId,
  onStartNew,
  onBackToGallery,
  onDelete,
}: {
  analysisId: string;
  onStartNew: () => void;
  onBackToGallery: () => void;
  onDelete: (id: string) => void;
}) {
  const analyses = useAnalyses();
  const analysis = analyses.getById(analysisId);

  // Si el análisis no existe (fue borrado por otra pestaña, p. ej.) volvemos
  // a la galería en el siguiente tick para no romper el render.
  useEffect(() => {
    if (!analysis) onBackToGallery();
  }, [analysis, onBackToGallery]);

  if (!analysis) return null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <PillButton size="sm" onClick={onStartNew}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Nuevo análisis
          </PillButton>
          <button
            type="button"
            onClick={onBackToGallery}
            className={cn(
              "inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-all",
              "hover:bg-foreground/5",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            )}
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Ver galería
          </button>
        </div>
        <button
          type="button"
          onClick={() => onDelete(analysis.id)}
          className={cn(
            "inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all",
            "hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40",
          )}
          aria-label="Eliminar análisis"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          Eliminar
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:items-start">
        <ImagePanel analysis={analysis} />
        <AnalysisPanel analysis={analysis} />
      </div>
    </div>
  );
}

function ImagePanel({ analysis }: { analysis: Analysis }) {
  const relative = formatRelativeTime(analysis.created_at);
  return (
    <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
      <div className="glass-card flex flex-col gap-4 p-4 sm:p-5">
        <div
          className={cn(
            "relative w-full overflow-hidden rounded-xl bg-foreground/5",
            RATIO_ASPECT[analysis.output_ratio],
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={analysis.image_url}
            alt="Imagen analizada"
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-mute">
            Formato:{" "}
            <span className="font-medium text-foreground">
              {RATIO_LABEL[analysis.output_ratio]}
            </span>
          </span>
          <span className="text-xs text-mute">{relative}</span>
        </div>
      </div>
    </aside>
  );
}

function AnalysisPanel({ analysis }: { analysis: Analysis }) {
  return (
    <div className="flex flex-col gap-4">
      <AnalysisSection eyebrow="Composición" body={analysis.composition} />
      <AnalysisSection eyebrow="Iluminación y mood" body={analysis.lighting} />
      <AnalysisSection eyebrow="Por qué vende" body={analysis.why_it_sells} />
      <IdentifiedStylesSection identified={analysis.identified_styles} />
    </div>
  );
}

function AnalysisSection({
  eyebrow,
  body,
}: {
  eyebrow: string;
  body: string;
}) {
  // Partimos el texto en párrafos por doble salto de línea. Cada párrafo
  // mantiene leading-relaxed para que los bloques largos respiren.
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <section className="glass-card-compact flex flex-col gap-3 p-5 sm:p-6">
      <span className="eyebrow">{eyebrow}</span>
      <div className="flex flex-col gap-3">
        {paragraphs.map((p, i) => (
          <p key={i} className="text-[14px] leading-[1.65] text-foreground">
            {p}
          </p>
        ))}
      </div>
    </section>
  );
}

function IdentifiedStylesSection({
  identified,
}: {
  identified: ReadonlyArray<IdentifiedStyle>;
}) {
  // Set para lookup O(1) al pintar cada chip de los 9 curados.
  const identifiedMap = useMemo(() => {
    const map = new Map<CuratedStyleId, string>();
    for (const s of identified) map.set(s.id, s.reason);
    return map;
  }, [identified]);

  return (
    <section className="glass-card-compact flex flex-col gap-4 p-5 sm:p-6">
      <span className="eyebrow">Estilos identificados</span>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-3 md:grid-cols-3">
        {CURATED_STYLES.map((style) => {
          const isIdentified = identifiedMap.has(style.id);
          const reason = identifiedMap.get(style.id);
          const textColor = style.textOn === "white" ? "#FFFFFF" : "#1B1B1B";
          return (
            <div key={style.id} className="flex flex-col gap-1.5">
              <div
                className={cn(
                  "relative flex aspect-square min-h-[44px] items-end overflow-hidden rounded-lg p-3 text-left transition-all",
                  isIdentified
                    ? "shadow-[0_0_0_3px_var(--color-pill-bg),0_8px_22px_-12px_rgba(15,31,22,0.34)] ring-2 ring-pill-bg/40"
                    : "opacity-40 grayscale shadow-[0_1px_0_rgba(15,31,22,0.06)]",
                )}
                style={{ backgroundColor: style.color, color: textColor }}
                aria-label={
                  isIdentified
                    ? `Estilo identificado: ${style.label}`
                    : `Estilo no presente: ${style.label}`
                }
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      "radial-gradient(circle at 30% 25%, rgba(255,255,255,0.18), transparent 55%), linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.12) 100%)",
                  }}
                />
                <span className="relative z-10 flex flex-col gap-0.5">
                  <span
                    className={cn(
                      "font-display text-base italic leading-none sm:text-lg",
                      isIdentified && "font-medium",
                    )}
                  >
                    {style.label}
                  </span>
                </span>
              </div>
              {isIdentified && reason ? (
                <p className="text-[11px] leading-relaxed text-mute">
                  <span className="font-medium text-foreground">
                    {style.label}
                  </span>
                  {" — "}
                  {reason}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  ErrorBanner                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Banner inline rojo. Igual API que en /fabrica y /productos/.../versiones.
 * El sentinel `"missing_key"` activa copy + CTA a Mi Negocio; cualquier otra
 * cadena se renderiza tal cual (viene ya formateada por `formatGenerationError`).
 */
function ErrorBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  const isMissingKey = message === "missing_key";
  const displayMessage = isMissingKey
    ? "Para analizar imágenes reales, configurá tu API key de Gemini en Mi Negocio."
    : message;

  return (
    <div
      role="alert"
      className="mx-auto flex w-full max-w-3xl items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/[0.06] px-4 py-3 text-sm text-foreground"
    >
      <AlertCircle
        className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
        aria-hidden
      />
      <div className="flex-1">
        <p className="font-medium leading-snug">{displayMessage}</p>
        {isMissingKey ? (
          <Link
            href="/mi-negocio"
            className="mt-1 inline-block text-xs font-semibold text-sage-strong hover:underline"
          >
            Ir a Mi Negocio →
          </Link>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Descartar mensaje"
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
