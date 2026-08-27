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
 * Estación 02 — Formato.
 *
 * Según mock v2 `screen-formato.jsx`:
 *   - Sección "Proporción" — 4 cards de ratio (1:1, 4:5, 9:16, 16:9) con
 *     mock visual proporcional, label y sub. Tap-toggle.
 *   - Sección "Variaciones por tanda" — stepper (min 1, max 10) controlado.
 *
 * NO créditos. NO costo. NO card "Vas a usar X créditos" — el modelo de
 * créditos ya no aplica al sistema Cuaderno v2.
 *
 * El botón "Continuar" del shell apunta al detalle de la versión activa
 * (`/productos/[productId]/versiones/[versionId]`), donde el usuario revisa la
 * configuración y dispara la primera generación con el HeroCTA "Generar
 * primera tanda". Antes apuntaba a `/fabrica`, pero la Fábrica hoy es un inbox
 * de versiones y no tiene CTA de generar visible para el flujo lineal — eso
 * generaba la pantalla "sin nada" reportada por el usuario.
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

  // Href dinámico al detalle de versión. El gate de arriba garantiza que
  // productId/versionId no son null acá; el fallback a `/fabrica` queda como
  // red de seguridad por si el state se corrompe entre el guard y el render.
  const nextHref =
    productId && versionId
      ? `/productos/${productId}/versiones/${versionId}`
      : "/fabrica";

  return (
    <StationShell
      number="03"
      title="Formato"
      description="Elegí el aspecto y cuántas variaciones querés por tanda."
      prevHref="/estilo"
      prevLabel="Volver al estilo"
      nextHref={nextHref}
      nextLabel="Revisar y generar"
    >
      <div className="flex flex-col gap-8">
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-xl italic text-foreground">
              Proporción
            </h2>
            <span className="text-[11px] font-medium text-mute">
              Optimizado para cada plataforma
            </span>
          </div>
          <RatioSelector
            value={version.output_ratio}
            onChange={handleRatioChange}
          />
        </section>

        <section className="flex flex-col gap-3">
          <div>
            <h2 className="font-display text-xl italic text-foreground">
              Variaciones por tanda
            </h2>
            <p className="mt-1 max-w-md text-xs font-medium text-mute">
              Cuántas imágenes diferentes genera en cada tirada. Podés mandar
              más tandas después.
            </p>
          </div>
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
        <div className="h-3 w-12 animate-pulse rounded-full bg-foreground/10" />
        <div className="mt-2 h-8 w-56 animate-pulse rounded-full bg-foreground/10" />
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-foreground/5" />
          ))}
        </div>
        <div className="mt-8 h-20 w-48 animate-pulse rounded-2xl bg-foreground/5" />
      </div>
    </div>
  );
}
