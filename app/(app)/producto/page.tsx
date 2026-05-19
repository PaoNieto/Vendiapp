"use client";

import { StationShell } from "@/components/app/station-shell";
import { ImageUploader } from "@/components/fabrica";
import { MAX_PRODUCT_IMAGES } from "@/lib/constants";
import { useRecorrido } from "@/lib/recorrido/store";

export default function ProductoPage() {
  const { state, setState, hydrated } = useRecorrido();
  const hasImages = state.productImages.length > 0;

  return (
    <StationShell
      number="01"
      title="Producto"
      description="Subí las fotos de tu producto. Distintos ángulos ayudan a la IA a mantenerlo idéntico en cada variación."
      nextHref="/referencias"
      nextLabel="Continuar a Referencias"
      nextDisabled={!hasImages}
      nextDisabledHint={!hasImages ? "Subí al menos una foto" : undefined}
    >
      {!hydrated ? (
        <div
          aria-busy
          className="glass min-h-[160px] animate-pulse rounded-2xl border border-dashed border-white/70"
        />
      ) : (
        <ImageUploader
          multi
          max={MAX_PRODUCT_IMAGES}
          label="Fotos de tu producto"
          hint="Subí fotos desde distintos ángulos para que la IA mantenga el producto idéntico en cada variación."
          value={state.productImages}
          onChange={(next) => setState({ productImages: next })}
        />
      )}
    </StationShell>
  );
}
