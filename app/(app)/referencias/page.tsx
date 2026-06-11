"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { StationShell } from "@/components/app/station-shell";
import { ImageUploader, type UploadedImage } from "@/components/fabrica";
import { useRecorrido } from "@/lib/recorrido/store";
import { useVersions } from "@/lib/versions/store";

/**
 * Estación — Referencias (OPCIONAL).
 *
 * Subir referencias propias es opcional: una versión puede generar con
 * referencias, con un Estilo Profesional solo (estación "Estilos
 * profesionales"), con ambos o sin nada. Por eso esta estación ya no gatea el
 * avance ni ofrece el viejo selector de "estilos curados" (cuadrados de color
 * planos que, usados como referencia visual, no aportaban nada al modelo).
 *
 * Las refs viven en `version.reference_images` (string[]).
 *
 * COMPAT: se conservan los helpers `CURATED_STYLES` / `parseCuratedRef` y los
 * tipos `CuratedStyle` / `CuratedStyleId`. NO se usan más como selector acá,
 * pero otras pantallas los siguen importando:
 *   - Análisis con IA (El Oráculo) los usa como vocabulario de estilos.
 *   - Versión / Fábrica los usan para reconocer refs curadas de versiones
 *     viejas ya guardadas (retrocompatibilidad).
 */

/* -------------------------------------------------------------------------- */
/*  Catálogo curado (legacy) — vocabulario de El Oráculo + parseo retrocompat  */
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
 * (Legacy: ya no se generan nuevas refs curadas, pero se conserva por simetría
 * con `parseCuratedRef`.)
 */
export function curatedRefDataUrl(style: CuratedStyle): string {
  const textColor = style.textOn === "white" ? "#FFFFFF" : "#1B1B1B";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><!--curated:${style.id}--><rect width="200" height="200" fill="${style.color}"/><text x="100" y="110" font-family="Georgia,serif" font-style="italic" font-size="22" fill="${textColor}" text-anchor="middle">${style.label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Si la URL pertenece a un estilo curado (versión vieja), devuelve el style.
 * Si no, null. Tolerante a encoding (busca tanto `<!--curated:xxx-->` como su
 * forma url-encoded `%3C!--curated:xxx--%3E`).
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

  return (
    <StationShell
      number="02"
      title="Referencias"
      description="Opcional: subí fotos que te gusten como inspiración. Si no, podés ir directo a elegir un Estilo Profesional."
      prevHref={`/productos/${productId}`}
      prevLabel="Volver al producto"
      nextHref="/estilo"
      nextLabel="Continuar a Estilos"
    >
      <div className="flex flex-col gap-8">
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-xl italic text-foreground">
            Sube tu propia inspiración{" "}
            <span className="text-base not-italic text-mute">(opcional)</span>
          </h2>
          <ImageUploader
            multi
            max={5}
            value={uploaderState}
            onChange={handleUploaderChange}
            hint="PNG, JPG o WebP. Inspiraciones que te gusten estéticamente."
          />
        </section>
      </div>
    </StationShell>
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
      </div>
    </div>
  );
}
