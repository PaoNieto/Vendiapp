"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { StationShell } from "@/components/app/station-shell";
import { ForkedVersionNotice } from "@/components/app/forked-version-notice";
import { StyleCard } from "@/components/app/style-card";
import {
  ImageUploader,
  NumberStepper,
  RatioSelector,
  type RatioValue,
  type UploadedImage,
} from "@/components/fabrica";
import { useGeneracion } from "@/lib/generacion/store";
import { useRecorrido } from "@/lib/recorrido/store";
import { useVersions } from "@/lib/versions/store";
import { STYLE_LIST, type StyleId } from "@/lib/styles";
import { MAX_VARIATIONS } from "@/lib/constants";

/**
 * Estación 02 — "¿Cómo querés que se vea?" (Estilo + Referencias + Formato).
 *
 * UNA sola estación para toda la decisión estética. Antes eran dos pantallas
 * separadas (`/estilo` y `/formato`) para lo que el usuario vive como una sola
 * pregunta; fusionarlas ahorra un paso entero del recorrido. Decisión de Paolo
 * (2026-09-09), sobre la variante E de los mockups.
 *
 * Anatomía:
 *   ┌────────────────────┬──────────────────────────────────────────┐
 *   │ RAIL (260px)       │ VITRINA                                   │
 *   │  · Tu inspiración  │  · Los 10 Estilos Profesionales en 3      │
 *   │    (hasta 5 refs)  │    columnas, con la foto GRANDE           │
 *   │  · Formato         │    (`StyleCard size="lg"`) para que se    │
 *   │    ratio + tanda   │    aprecien sin abrir nada                │
 *   └────────────────────┴──────────────────────────────────────────┘
 *
 * Es el mismo patrón de rail + vitrina que la hoja de versión, así el usuario
 * lee las dos pantallas igual.
 *
 * Los 3 modos siguen abiertos —estilo solo / refs solas / ambos— y también
 * "nada" (el Director propone). El contrato de datos NO cambia: el estilo
 * persiste en `version.style_id`, las refs en `version.reference_images`, el
 * ratio en `version.output_ratio` y la cantidad en `version.variations_default`.
 * Cero migración de DB.
 *
 * `/formato` y `/referencias` quedan como redirects a esta ruta para no romper
 * deep-links, historial ni código que todavía apunte ahí.
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

  /*
   * Stepper de variaciones: el número se mueve al instante en pantalla, pero se
   * GUARDA una sola vez, cuando dejás de tocar.
   *
   * Viene de `/formato` junto con el control. Antes cada click escribía su
   * propio PATCH: bajar de 5 a 2 son tres escrituras en carrera (5→4, 4→3, 3→2)
   * sin garantía de orden de llegada, y gana la última en ejecutarse, no la
   * última que tocaste. Pasó en prod el 2026-09-09.
   */
  const persistedVariations = version?.variations_default ?? 1;
  const [variations, setVariations] = useState(persistedVariations);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ versionId: string; value: number } | null>(null);
  const syncedFor = useRef<string | null>(null);

  // Sincronizamos el stepper UNA vez por versión (cubre la hidratación).
  // Re-sincronizar en cada cambio pisaría lo que el usuario acaba de tocar.
  useEffect(() => {
    if (syncedFor.current === versionId) return;
    syncedFor.current = versionId;
    setVariations(persistedVariations);
  }, [versionId, persistedVariations]);

  const versionsRef = useRef(versions);
  useEffect(() => {
    versionsRef.current = versions;
  }, [versions]);

  // Si te vas antes de que corra el debounce, guardamos igual: continuar a la
  // hoja de versión no puede costarte el número que acabás de elegir.
  useEffect(() => {
    return () => {
      if (!saveTimer.current) return;
      clearTimeout(saveTimer.current);
      const last = pending.current;
      if (last) {
        versionsRef.current.updateVersion(last.versionId, {
          variations_default: last.value,
        });
      }
    };
  }, []);

  function toggleStyle(id: StyleId) {
    const next: StyleId | null = selectedId === id ? null : id;
    setStyle(next);
    versions.updateVersion(versionId, { style_id: next });
  }

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

  function handleRatioChange(ratio: RatioValue) {
    versions.updateVersion(versionId, { output_ratio: ratio });
  }

  function handleVariationsChange(n: number) {
    setVariations(n);
    pending.current = { versionId, value: n };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      const last = pending.current;
      if (!last) return;
      versions.updateVersion(last.versionId, {
        variations_default: last.value,
      });
    }, 400);
  }

  return (
    <StationShell
      number="02"
      title="¿Cómo querés que se"
      titleAccent="vea?"
      description="Subí inspiración, elegí el formato y el estilo. Todo es opcional: si no elegís nada, la IA propone el look."
      prevHref={`/productos/${productId}`}
      prevLabel="Volver al producto"
      nextHref={`/productos/${productId}/versiones/${versionId}`}
      nextLabel="Revisar y generar"
      wide
    >
      {/* Si llegaste acá editando una versión que ya tenía fotos, la hoja de
          versión bifurcó y estás sobre una copia. No renderiza nada si no
          hubo bifurcación. */}
      <ForkedVersionNotice />

      {/*
        Rail + vitrina, el mismo reparto que la hoja de versión: lo que se
        configura vive en la columna angosta, lo que se mira ocupa el resto.
        En mobile colapsa a una sola columna, con el rail primero.
      */}
      <div className="glass-card grid overflow-hidden p-0 lg:grid-cols-[260px_1px_minmax(0,1fr)]">
        <div className="flex flex-col gap-5 p-5 sm:p-6">
          <section>
            <span className="eyebrow">
              TU INSPIRACIÓN{" "}
              <span className="normal-case text-mute">· opcional</span>
            </span>
            <p className="mb-3 mt-1 text-xs font-medium leading-relaxed text-mute">
              Fotos que te gusten estéticamente. La IA toma la vibra, no copia el
              producto.
            </p>
            <ImageUploader
              multi
              max={5}
              value={uploaderState}
              onChange={handleUploaderChange}
              hint="PNG, JPG o WebP."
            />
          </section>

          <section className="border-t border-border pt-5">
            <span className="eyebrow">FORMATO DE SALIDA</span>
            <p className="mb-3 mt-1 text-xs font-medium leading-relaxed text-mute">
              La proporción de cada imagen y cuántas querés por tirada.
            </p>
            {/* Dos columnas en vez de las cuatro por defecto: el rail es
                angosto y con cuatro los ratios quedaban ilegibles. */}
            <RatioSelector
              value={(version?.output_ratio as RatioValue) ?? "1:1"}
              onChange={handleRatioChange}
              className="grid-cols-2 sm:grid-cols-2"
            />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="eyebrow">POR TANDA</span>
              <NumberStepper
                value={variations}
                onChange={handleVariationsChange}
                min={1}
                max={MAX_VARIATIONS}
              />
            </div>
          </section>
        </div>

        <div aria-hidden className="hidden bg-border lg:block" />

        <div className="min-w-0 p-5 sm:p-6">
          <span className="eyebrow">
            EL ESTILO <span className="normal-case text-mute">· opcional</span>
          </span>
          <p className="mb-4 mt-1 text-xs font-medium leading-relaxed text-mute">
            Define la luz, la composición y el mood. Tocá uno para elegirlo, tocá
            de nuevo para sacarlo.
          </p>
          {/* Tres columnas y foto grande: el estilo es la decisión difícil de
              esta pantalla y hay que poder verlo, no adivinarlo por el nombre. */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {STYLE_LIST.map((style) => (
              <StyleCard
                key={style.id}
                label={style.label}
                description={style.description}
                previewImage={style.previewImage}
                selected={selectedId === style.id}
                size="lg"
                onSelect={() => toggleStyle(style.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </StationShell>
  );
}

function EstiloSkeleton() {
  return (
    <div className="px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <div className="h-3 w-12 animate-pulse rounded-full bg-foreground/10" />
        <div className="mt-2 h-8 w-64 animate-pulse rounded-full bg-foreground/10" />
        <div className="mt-8 lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-6">
          <div className="h-80 animate-pulse rounded-xl bg-card" />
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:mt-0">
            {STYLE_LIST.map((s) => (
              <div
                key={s.id}
                className="h-[260px] animate-pulse rounded-[14px] bg-card sm:h-[300px]"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
