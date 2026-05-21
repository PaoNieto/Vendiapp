"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { StationShell } from "@/components/app/station-shell";
import {
  NumberStepper,
  RatioSelector,
  type RatioValue,
} from "@/components/fabrica";
import { useRecorrido } from "@/lib/recorrido/store";
import { useVersions } from "@/lib/versions/store";

/**
 * Estación 02 — Formato. Edita `output_ratio` y `variations_default` de la
 * versión activa. Sin versión seteada después de hidratar, redirige al
 * catálogo (mismo gate que `/referencias`).
 *
 * NOTA: la card de "vas a usar X créditos" del flujo viejo ya no aparece —
 * el modelo de créditos lo decide la Fábrica cuando se genere.
 */
export default function FormatoPage() {
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
    return <FormatoSkeleton />;
  }

  function handleRatioChange(ratio: RatioValue) {
    versions.updateVersion(versionId!, { output_ratio: ratio });
  }

  function handleVariationsChange(n: number) {
    versions.updateVersion(versionId!, { variations_default: n });
  }

  return (
    <StationShell
      number="02"
      title="Formato"
      description="Elegí el aspecto y cuántas variaciones querés por tanda."
      prevHref="/referencias"
      prevLabel="Volver a Referencias"
      nextHref="/fabrica"
      nextLabel="Mandar a la Fábrica"
    >
      <div className="flex flex-col gap-8">
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-foreground">Proporción</h2>
          <RatioSelector
            value={version.output_ratio}
            onChange={handleRatioChange}
          />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-foreground">
            Variaciones por tanda
          </h2>
          <NumberStepper
            value={version.variations_default}
            onChange={handleVariationsChange}
            min={1}
            max={10}
            suffix="por tanda"
          />
        </section>
      </div>
    </StationShell>
  );
}

function FormatoSkeleton() {
  return (
    <div className="px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <div className="h-3 w-12 animate-pulse rounded-full bg-white/30" />
        <div className="mt-2 h-8 w-56 animate-pulse rounded-full bg-white/40" />
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-2xl bg-white/40"
            />
          ))}
        </div>
        <div className="mt-8 h-20 w-48 animate-pulse rounded-2xl bg-white/40" />
      </div>
    </div>
  );
}
