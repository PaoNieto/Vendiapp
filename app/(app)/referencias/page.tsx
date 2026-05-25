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
 * Estación 01 — Referencias.
 *
 * Según mock v2 `screen-referencias.jsx`:
 *   - Sección "Sube tu propia inspiración" — ImageUploader controlado.
 *   - Sección "O elige un estilo curado" — grid 3 / 5 cols de 9 tiles con
 *     colores planos exactos del handoff. Tap toggle.
 *
 * Las refs viven en `version.reference_images` (string[]) y mezclan:
 *   - URLs subidas (object URLs)
 *   - SVG dataURIs marcados con `<!--curated:<id>-->` para que podamos
 *     reconocerlos en cualquier otra pantalla y pintar el dot del estilo.
 *
 * Helpers exportados para que otras pantallas (versión detalle, fábrica)
 * puedan parsear si una ref es curada o no.
 */

/* -------------------------------------------------------------------------- */
/*  Catálogo curado — colores exactos del handoff                              */
/* -------------------------------------------------------------------------- */

export type CuratedStyleId =
  | "mineral"
  | "calido"
  | "editorial"
  | "mostaza"
  | "nocturno"
  | "pastel"
  | "mint"
  | "mono"
  | "champagne";

export type CuratedStyle = {
  id: CuratedStyleId;
  label: string;
  color: string;
  textOn: "dark" | "white";
};

export const CURATED_STYLES: ReadonlyArray<CuratedStyle> = [
  { id: "mineral", label: "Mineral", color: "#E8DFC8", textOn: "dark" },
  { id: "calido", label: "Cálido", color: "#B8694F", textOn: "white" },
  { id: "editorial", label: "Editorial", color: "#5C6B3F", textOn: "white" },
  { id: "mostaza", label: "Mostaza", color: "#C99A4B", textOn: "dark" },
  { id: "nocturno", label: "Nocturno", color: "#26395A", textOn: "white" },
  { id: "pastel", label: "Pastel", color: "#E8B8C6", textOn: "dark" },
  { id: "mint", label: "Mint", color: "#9ECDB9", textOn: "dark" },
  { id: "mono", label: "Mono", color: "#1B1B1B", textOn: "white" },
  { id: "champagne", label: "Champagne", color: "#DCC59A", textOn: "dark" },
];

/**
 * Construye el dataURI de un estilo curado. Lleva un marker `<!--curated:<id>-->`
 * para que `parseCuratedRef` pueda extraer el id desde cualquier consumer.
 */
export function curatedRefDataUrl(style: CuratedStyle): string {
  const textColor = style.textOn === "white" ? "#FFFFFF" : "#1B1B1B";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><!--curated:${style.id}--><rect width="200" height="200" fill="${style.color}"/><text x="100" y="110" font-family="Georgia,serif" font-style="italic" font-size="22" fill="${textColor}" text-anchor="middle">${style.label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Si la URL pertenece a un estilo curado, devuelve el style. Si no, null.
 * Tolerante a encoding (busca tanto `<!--curated:xxx-->` como su forma
 * url-encoded `%3C!--curated:xxx--%3E`).
 */
export function parseCuratedRef(url: string): CuratedStyle | null {
  if (!url.startsWith("data:image/svg+xml")) return null;
  const rawMatch = url.match(/<!--curated:([a-z]+)-->/);
  const encMatch = url.match(/%3C!--curated:([a-z]+)--%3E/);
  const id = (rawMatch?.[1] ?? encMatch?.[1]) as CuratedStyleId | undefined;
  if (!id) return null;
  return CURATED_STYLES.find((s) => s.id === id) ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function ReferenciasPage() {
  const router = useRouter();
  const recorrido = useRecorrido();
  const versions = useVersions();

  const allHydrated = recorrido.hydrated && versions.hydrated;
  const { productId, versionId } = recorrido.state;
  const version = versionId ? versions.getById(versionId) : undefined;

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
  const [uploaderState, setUploaderState] = useState<UploadedImage[]>([]);
  const refsSet = useMemo(() => new Set(referenceImages), [referenceImages]);

  function handleUploaderChange(next: UploadedImage[]) {
    const previousUploaderUrls = new Set(uploaderState.map((p) => p.previewUrl));
    const currentUploaderUrls = new Set(next.map((p) => p.previewUrl));

    const kept = referenceImages.filter(
      (url) => !previousUploaderUrls.has(url) || currentUploaderUrls.has(url),
    );
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
      description="Subí refs propias o elegí un estilo curado. Definen el look de las imágenes generadas."
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
          <h2 className="font-display text-xl italic text-foreground">
            Sube tu propia inspiración
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
          <h2 className="font-display text-xl italic text-foreground">
            O elegí un estilo curado
          </h2>
          <p className="text-xs font-medium text-mute">
            Estilos pre-armados — tocá los que quieras sumar.
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

/* -------------------------------------------------------------------------- */
/*  Galería curada                                                             */
/* -------------------------------------------------------------------------- */

function CuratedGallery({
  selected,
  onToggle,
}: {
  selected: Set<string>;
  onToggle: (dataUrl: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
      {CURATED_STYLES.map((style) => {
        const dataUrl = curatedRefDataUrl(style);
        const isSelected = selected.has(dataUrl);
        const textColor = style.textOn === "white" ? "#FFFFFF" : "#1B1B1B";
        return (
          <button
            key={style.id}
            type="button"
            onClick={() => onToggle(dataUrl)}
            aria-pressed={isSelected}
            className={cn(
              "group relative flex aspect-square min-h-[44px] items-end overflow-hidden rounded-lg p-3 text-left transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40",
              isSelected
                ? "shadow-[0_0_0_3px_var(--color-pill-bg),0_8px_22px_-12px_rgba(15,31,22,0.34)]"
                : "shadow-[0_1px_0_rgba(15,31,22,0.06),0_8px_20px_-12px_rgba(15,31,22,0.24)] hover:scale-[1.01]",
            )}
            style={{ backgroundColor: style.color, color: textColor }}
          >
            {/* Overlay para profundidad */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(circle at 30% 25%, rgba(255,255,255,0.18), transparent 55%), linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.12) 100%)",
              }}
            />
            {isSelected ? (
              <span className="absolute right-2.5 top-2.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-pill-bg text-pill-fg shadow-md">
                <Check className="h-3.5 w-3.5" strokeWidth={2.4} />
              </span>
            ) : null}
            <span className="relative z-10 flex flex-col gap-0.5">
              <span className="font-display text-lg italic leading-none">
                {style.label}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Skeleton                                                                   */
/* -------------------------------------------------------------------------- */

function ReferenciasSkeleton() {
  return (
    <div className="px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <div className="h-3 w-12 animate-pulse rounded-full bg-foreground/10" />
        <div className="mt-2 h-8 w-56 animate-pulse rounded-full bg-foreground/10" />
        <div className="mt-8 h-40 animate-pulse rounded-xl bg-foreground/5" />
        <div className="mt-8 grid grid-cols-3 gap-3 sm:grid-cols-5">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-lg bg-foreground/5" />
          ))}
        </div>
      </div>
    </div>
  );
}
