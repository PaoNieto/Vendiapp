"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { StationShell } from "@/components/app/station-shell";
import { ImageUploader, type UploadedImage } from "@/components/fabrica";
import { cn } from "@/lib/utils";
import { useRecorrido } from "@/lib/recorrido/store";
import { useVersions } from "@/lib/versions/store";

/**
 * Estación 01 — Referencias. Ahora escribe directo a `version.reference_images`
 * en el store de versiones; el "recorrido" solo nos dice qué versión está
 * activa. Si llegamos sin `productId + versionId` después de hidratar,
 * volvemos al catálogo: no se puede editar referencias sin una versión.
 *
 * El array de referencias mezcla dos fuentes:
 *   - subidas del usuario (object URLs)
 *   - "galería curada" (placeholders SVG data-URI)
 * Funcionalmente son el mismo array — solo difieren en cómo entraron.
 */
export default function ReferenciasPage() {
  const router = useRouter();
  const recorrido = useRecorrido();
  const versions = useVersions();

  const allHydrated = recorrido.hydrated && versions.hydrated;
  const { productId, versionId } = recorrido.state;
  const version = versionId ? versions.getById(versionId) : undefined;

  // Sin versión activa después de hidratar, no podemos editar nada.
  useEffect(() => {
    if (!allHydrated) return;
    if (!productId || !versionId || !version) {
      router.replace("/productos");
    }
  }, [allHydrated, productId, versionId, version, router]);

  if (!allHydrated || !productId || !versionId || !version) {
    return <ReferenciasSkeleton />;
  }

  return (
    <ReferenciasContent
      productId={productId}
      versionId={versionId}
      referenceImages={version.reference_images}
    />
  );
}

function ReferenciasContent({
  productId,
  versionId,
  referenceImages,
}: {
  productId: string;
  versionId: string;
  referenceImages: string[];
}) {
  const versions = useVersions();

  // Estado local del uploader — guardamos `UploadedImage` con su File para que
  // el componente pueda revocar object URLs. Solo persistimos las URLs al
  // store, no los `File`.
  const [uploaderState, setUploaderState] = useState<UploadedImage[]>([]);

  // Set de referencias actuales para chequeos rápidos (incluye galería curada).
  const refsSet = useMemo(() => new Set(referenceImages), [referenceImages]);

  function handleUploaderChange(next: UploadedImage[]) {
    // Tratamos al estado anterior del uploader como "los URLs del usuario que
    // ya están en la versión". Cualquier URL que aparezca de nuevo se suma,
    // cualquiera que desaparezca se quita. Los URLs de la galería curada no
    // pasan por el uploader, así que no los tocamos acá.
    const previousUploaderUrls = new Set(uploaderState.map((p) => p.previewUrl));
    const currentUploaderUrls = new Set(next.map((p) => p.previewUrl));

    // 1. Sacamos del array las URLs del uploader que ya no están.
    const kept = referenceImages.filter(
      (url) => !previousUploaderUrls.has(url) || currentUploaderUrls.has(url),
    );
    // 2. Sumamos URLs del uploader que aún no estaban registradas.
    const finalRefs = [...kept];
    for (const item of next) {
      if (!finalRefs.includes(item.previewUrl)) {
        finalRefs.push(item.previewUrl);
      }
    }
    versions.updateVersion(versionId, { reference_images: finalRefs });
    setUploaderState(next);
  }

  function handleToggleCurated(dataUrl: string) {
    if (refsSet.has(dataUrl)) {
      versions.updateVersion(versionId, {
        reference_images: referenceImages.filter((u) => u !== dataUrl),
      });
    } else {
      versions.updateVersion(versionId, {
        reference_images: [...referenceImages, dataUrl],
      });
    }
  }

  const nextDisabled = referenceImages.length === 0;

  return (
    <StationShell
      number="01"
      title="Referencias"
      description="Subí refs propias o elegí de nuestra galería curada."
      prevHref={`/productos/${productId}`}
      prevLabel="Volver al producto"
      nextHref="/formato"
      nextLabel="Continuar a Formato"
      nextDisabled={nextDisabled}
      nextDisabledHint={
        nextDisabled ? "Subí o elegí al menos 1 referencia" : undefined
      }
    >
      <div className="flex flex-col gap-8">
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-foreground">
            Subir referencias
          </h2>
          <ImageUploader
            multi
            max={5}
            value={uploaderState}
            onChange={handleUploaderChange}
            hint="PNG, JPG o WebP. Inspiraciones que te gusten estéticamente."
          />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-foreground">
            Galería curada
          </h2>
          <p className="text-xs text-muted-foreground">
            Estilos curados por nosotros — tocá los que quieras sumar.
          </p>
          <CuratedGallery
            selected={refsSet}
            onToggle={handleToggleCurated}
          />
        </section>
      </div>
    </StationShell>
  );
}

/**
 * Galería curada — 9 placeholders SVG con gradients inline. Cada uno se
 * codifica como `data:image/svg+xml;utf8,...` así sirven como `string` válido
 * dentro de `reference_images` (mismo shape que cualquier otra ref).
 *
 * Definimos las paletas inline porque son representativas, no thematic. Cuando
 * se conecte el backend, este array vendrá de un endpoint público de la
 * galería curada.
 */
const CURATED_TILES = [
  { id: "minimal-light", from: "#F8F4EC", to: "#E5DCC8", label: "Minimal" },
  { id: "warm-terracotta", from: "#C56A4A", to: "#7B3F2A", label: "Cálido" },
  { id: "olive-editorial", from: "#7B8A4F", to: "#4A552E", label: "Editorial" },
  { id: "mustard", from: "#D4A33B", to: "#8C6A1F", label: "Mostaza" },
  { id: "blue-night", from: "#1F3B5B", to: "#0D1B2C", label: "Nocturno" },
  { id: "pastel-rose", from: "#F4C2C2", to: "#D38B8B", label: "Pastel" },
  { id: "mint", from: "#A8D5BA", to: "#5BAE85", label: "Mint" },
  { id: "mono-noir", from: "#2B2A28", to: "#0A0A0A", label: "Mono" },
  { id: "champagne", from: "#F1E2C4", to: "#C9A968", label: "Champagne" },
] as const;

function curatedSvg(from: string, to: string, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="200" height="200" fill="url(#g)"/><text x="100" y="110" font-family="system-ui,sans-serif" font-size="16" fill="#fff" text-anchor="middle" opacity="0.9">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function CuratedGallery({
  selected,
  onToggle,
}: {
  selected: Set<string>;
  onToggle: (dataUrl: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
      {CURATED_TILES.map((tile) => {
        const dataUrl = curatedSvg(tile.from, tile.to, tile.label);
        const isSelected = selected.has(dataUrl);
        return (
          <button
            key={tile.id}
            type="button"
            onClick={() => onToggle(dataUrl)}
            aria-pressed={isSelected}
            className={cn(
              "group relative aspect-square overflow-hidden rounded-2xl border transition-all min-h-[44px]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              isSelected
                ? "border-primary/60 ring-2 ring-primary/40"
                : "border-white/60 hover:border-primary/40",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={dataUrl}
              alt={tile.label}
              className="h-full w-full object-cover"
            />
            {isSelected ? (
              <span className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
                <Check className="h-4 w-4" />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function ReferenciasSkeleton() {
  return (
    <div className="px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <div className="h-3 w-12 animate-pulse rounded-full bg-white/30" />
        <div className="mt-2 h-8 w-56 animate-pulse rounded-full bg-white/40" />
        <div className="mt-8 h-40 animate-pulse rounded-2xl bg-white/40" />
        <div className="mt-8 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square animate-pulse rounded-2xl bg-white/40"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
