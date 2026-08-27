"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { StationShell } from "@/components/app/station-shell";
import { StyleCard } from "@/components/app/style-card";
import { LookSummary } from "@/components/app/look-summary";
import { ImageUploader, type UploadedImage } from "@/components/fabrica";
import { useGeneracion } from "@/lib/generacion/store";
import { useRecorrido } from "@/lib/recorrido/store";
import { useVersions } from "@/lib/versions/store";
import { STYLE_LIST, type StyleId } from "@/lib/styles";

/**
 * Estación 02 — "¿Cómo querés que se vea?" (Estilo + Referencias fusionados).
 *
 * Una sola estación responde la decisión estética con dos ingredientes
 * COMBINABLES: un Estilo Profesional (grilla de 10) y/o referencias propias
 * (hasta 5 fotos). Los 3 modos siguen abiertos —estilo solo / refs solas /
 * ambos— y también "nada" (el Director propone). El panel "Tu look"
 * (LookSummary) muestra en vivo lo que se está armando.
 *
 * Reemplaza a las viejas estaciones separadas `/estilo` + `/referencias`
 * (esta última quedó como redirect acá). El contrato de datos NO cambia: el
 * estilo persiste en `version.style_id` (autoritativo server-side) y las refs
 * en `version.reference_images` — cero migración de DB.
 */

export default function EstiloPage() {
  const router = useRouter();
  const { hydrated: genHydrated } = useGeneracion();
  const recorrido = useRecorrido();
  const versions = useVersions();

  const allHydrated = genHydrated && recorrido.hydrated && versions.hydrated;
  const { productId, versionId } = recorrido.state;
  const version = versionId ? versions.getById(versionId) : undefined;

  useEffect(() => {
    if (!allHydrated) return;
    if (!productId || !versionId || !version) {
      router.replace("/productos");
    }
  }, [allHydrated, productId, versionId, version, router]);

  if (!allHydrated || !productId || !versionId || !version) {
    return <EstiloSkeleton />;
  }

  return <EstiloContent productId={productId} versionId={versionId} />;
}

function EstiloContent({
  productId,
  versionId,
}: {
  productId: string;
  versionId: string;
}) {
  const { state, setStyle } = useGeneracion();
  const versions = useVersions();
  const version = versions.getById(versionId);
  const [uploaderState, setUploaderState] = useState<UploadedImage[]>([]);

  const referenceImages = version?.reference_images ?? [];
  // El estilo persistido en la versión manda (sobrevive a un desync del store
  // efímero); el store es solo la capa interactiva.
  const selectedId =
    ((version?.style_id as StyleId | null) ?? state.selectedStyleId) ?? null;
  const selectedStyle = STYLE_LIST.find((s) => s.id === selectedId);

  const toggleStyle = (id: StyleId) => {
    const next: StyleId | null = selectedId === id ? null : id;
    setStyle(next);
    versions.updateVersion(versionId, { style_id: next });
  };

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
      title="¿Cómo querés que se"
      titleAccent="vea?"
      description="Elegí un estilo, subí inspiración, o combiná los dos. También podés dejar que la IA proponga el look."
      prevHref={`/productos/${productId}`}
      prevLabel="Volver al producto"
      nextHref="/formato"
      nextLabel="Continuar a Formato"
      wide
    >
      {/* Comanda mobile: arriba del todo, se llena a medida que elegís. */}
      <div className="mb-6 lg:hidden">
        <LookSummary
          variant="bar"
          style={selectedStyle}
          referencePreviews={referenceImages}
        />
      </div>

      <div className="lg:grid lg:grid-cols-12 lg:gap-8">
        <div className="flex flex-col gap-10 lg:col-span-7">
          <section>
            <span className="eyebrow-on-bg">El estilo</span>
            <p className="mb-4 mt-1 text-sm text-mute">
              Define la luz, la composición y el mood.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {STYLE_LIST.map((style) => (
                <StyleCard
                  key={style.id}
                  label={style.label}
                  description={style.description}
                  previewImage={style.previewImage}
                  selected={selectedId === style.id}
                  onSelect={() => toggleStyle(style.id)}
                />
              ))}
            </div>
          </section>

          <section>
            <span className="eyebrow-on-bg">
              Tu inspiración{" "}
              <span className="normal-case text-mute">· opcional</span>
            </span>
            <p className="mb-4 mt-1 text-sm text-mute">
              Subí fotos que te gusten estéticamente. La IA toma la vibra, no
              copia el producto.
            </p>
            <ImageUploader
              multi
              max={5}
              value={uploaderState}
              onChange={handleUploaderChange}
              hint="PNG, JPG o WebP. Inspiraciones que te gusten estéticamente."
            />
          </section>
        </div>

        {/* Panel sticky (solo desktop). En mobile ya está la comanda de arriba. */}
        <div className="hidden lg:col-span-5 lg:block">
          <LookSummary
            variant="panel"
            style={selectedStyle}
            referencePreviews={referenceImages}
          />
        </div>
      </div>
    </StationShell>
  );
}

function EstiloSkeleton() {
  return (
    <div className="px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <div className="h-3 w-12 animate-pulse rounded-full bg-foreground/10" />
        <div className="mt-2 h-8 w-64 animate-pulse rounded-full bg-foreground/10" />
        <div className="mt-8 lg:grid lg:grid-cols-12 lg:gap-8">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:col-span-7">
            {STYLE_LIST.map((s) => (
              <div
                key={s.id}
                className="h-[180px] animate-pulse rounded-[14px] bg-card sm:h-[200px]"
              />
            ))}
          </div>
          <div className="mt-8 hidden h-80 animate-pulse rounded-xl bg-card lg:col-span-5 lg:mt-0 lg:block" />
        </div>
      </div>
    </div>
  );
}
