"use client";

import { useMemo } from "react";
import { Check } from "lucide-react";
import { motion } from "motion/react";
import { StationShell } from "@/components/app/station-shell";
import { ImageUploader, type UploadedImage } from "@/components/fabrica";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MAX_REFERENCE_IMAGES } from "@/lib/constants";
import { useRecorrido } from "@/lib/recorrido/store";
import { cn } from "@/lib/utils";

type CuratedReference = {
  id: string;
  label: string;
  gradient: string;
};

const CURATED_REFERENCES: CuratedReference[] = [
  {
    id: "gallery-minimal-warm",
    label: "Minimal cálido",
    gradient: "linear-gradient(135deg, #F8F4EC 0%, #E8D7B9 100%)",
  },
  {
    id: "gallery-editorial-bw",
    label: "Editorial blanco y negro",
    gradient: "linear-gradient(135deg, #2B2A28 0%, #6C6A65 100%)",
  },
  {
    id: "gallery-terra",
    label: "Terra natural",
    gradient: "linear-gradient(135deg, #C56A4A 0%, #8B5A3C 100%)",
  },
  {
    id: "gallery-mint",
    label: "Verde fresco",
    gradient: "linear-gradient(135deg, #C8E6D5 0%, #A0C9B0 100%)",
  },
  {
    id: "gallery-night",
    label: "Nocturno urbano",
    gradient: "linear-gradient(135deg, #1F3B5B 0%, #0E1A2D 100%)",
  },
  {
    id: "gallery-pastel",
    label: "Pastel suave",
    gradient: "linear-gradient(135deg, #F4C2C2 0%, #F8F4EC 100%)",
  },
  {
    id: "gallery-mustard",
    label: "Mostaza vintage",
    gradient: "linear-gradient(135deg, #D4A33B 0%, #7B8A4F 100%)",
  },
  {
    id: "gallery-olive",
    label: "Oliva mate",
    gradient: "linear-gradient(135deg, #7B8A4F 0%, #4B5A2F 100%)",
  },
  {
    id: "gallery-azure",
    label: "Azul océano",
    gradient: "linear-gradient(135deg, #1F3B5B 0%, #5A8AB5 100%)",
  },
];

/**
 * Las referencias curadas se modelan como `UploadedImage` con un `File` "virtual"
 * para mantener el shape uniforme con las subidas. El `previewUrl` guarda un data
 * URI inline con el gradiente, así no dependemos de assets externos.
 */
function buildCuratedUploaded(ref: CuratedReference): UploadedImage {
  const file = new File([], `${ref.id}.svg`, { type: "image/svg+xml" });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">${ref.gradient
    .match(/#[0-9A-Fa-f]{6}/g)
    ?.map(
      (c, i, arr) =>
        `<stop offset="${(i / (arr.length - 1)) * 100}%" stop-color="${c}"/>`,
    )
    .join("") ?? ""}</linearGradient></defs><rect width="400" height="400" fill="url(#g)"/></svg>`;
  const previewUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  return { id: ref.id, file, previewUrl };
}

export default function ReferenciasPage() {
  const { state, setState, hydrated } = useRecorrido();

  const selectedGalleryIds = useMemo(
    () =>
      new Set(
        state.referenceImages
          .filter((r) => r.id.startsWith("gallery-"))
          .map((r) => r.id),
      ),
    [state.referenceImages],
  );

  const hasReferences = state.referenceImages.length > 0;
  const reachedMax = state.referenceImages.length >= MAX_REFERENCE_IMAGES;

  function toggleGallery(ref: CuratedReference) {
    const isSelected = selectedGalleryIds.has(ref.id);
    if (isSelected) {
      setState({
        referenceImages: state.referenceImages.filter((r) => r.id !== ref.id),
      });
      return;
    }
    if (reachedMax) return;
    setState({
      referenceImages: [...state.referenceImages, buildCuratedUploaded(ref)],
    });
  }

  return (
    <StationShell
      number="02"
      title="Referencias"
      description="Subí imágenes de la estética que querés lograr o elegí de nuestra galería curada."
      prevHref="/producto"
      prevLabel="Volver"
      nextHref="/estilo"
      nextLabel="Continuar a Estilo"
      nextDisabled={!hasReferences}
      nextDisabledHint={!hasReferences ? "Sumá al menos una referencia" : undefined}
    >
      {!hydrated ? (
        <div
          aria-busy
          className="glass min-h-[200px] animate-pulse rounded-2xl border border-dashed border-white/70"
        />
      ) : (
        <Tabs defaultValue="upload" className="flex flex-col gap-6">
          <TabsList className="self-start" variant="default">
            <TabsTrigger value="upload">Subir referencias</TabsTrigger>
            <TabsTrigger value="gallery">Galería curada</TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-3">
            <ImageUploader
              multi
              max={MAX_REFERENCE_IMAGES}
              label="Referencias visuales"
              hint="Mientras más claras sean las referencias, mejor el resultado. Pueden ser fotos de Pinterest, Instagram o tu propio archivo."
              value={state.referenceImages}
              onChange={(next) => setState({ referenceImages: next })}
            />
          </TabsContent>

          <TabsContent value="gallery" className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-medium text-foreground">
                  Galería curada
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Tocá las estéticas que se acerquen a lo que querés. Se suman a
                  las que subiste.
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-white/50 px-2.5 py-0.5 font-mono text-xs text-muted-foreground">
                {state.referenceImages.length}/{MAX_REFERENCE_IMAGES}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {CURATED_REFERENCES.map((ref) => {
                const selected = selectedGalleryIds.has(ref.id);
                const disabled = !selected && reachedMax;
                return (
                  <motion.button
                    key={ref.id}
                    type="button"
                    role="checkbox"
                    aria-checked={selected}
                    aria-disabled={disabled}
                    disabled={disabled}
                    onClick={() => toggleGallery(ref)}
                    whileTap={disabled ? undefined : { scale: 0.97 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className={cn(
                      "glass relative aspect-square overflow-hidden rounded-2xl border text-left transition-all",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                      selected
                        ? "border-primary/60 shadow-sm ring-2 ring-primary/30"
                        : "border-white/60 hover:shadow-md",
                      disabled && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <div
                      aria-hidden
                      className="absolute inset-0"
                      style={{ background: ref.gradient }}
                    />
                    {selected && (
                      <span className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
                        <Check className="h-4 w-4" />
                      </span>
                    )}
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-3 py-2 text-xs font-medium text-white">
                      {ref.label}
                    </span>
                  </motion.button>
                );
              })}
            </div>

            {reachedMax && (
              <p className="text-[11px] text-muted-foreground">
                Alcanzaste el máximo de {MAX_REFERENCE_IMAGES} referencias.
                Deseleccioná alguna para sumar otra.
              </p>
            )}
          </TabsContent>
        </Tabs>
      )}
    </StationShell>
  );
}
