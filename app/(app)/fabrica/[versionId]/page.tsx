"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, ImageIcon, Plus, X } from "lucide-react";

import { AvatarCircle, PillButton } from "@/components/dashboard";
import { Topbar } from "@/components/app/topbar";
import { CreditBadge } from "@/components/app/credit-badge";
import { GeneratingOverlay } from "@/components/app/generating-overlay";
import {
  VersionGallery,
  type VersionSettings,
} from "@/components/app/version-gallery";
import { useVersions } from "@/lib/versions/store";
import type { Version } from "@/lib/versions/store";
import { useProducts } from "@/lib/products/store";
import { useGenerations } from "@/lib/generations/store";
import { useGeneracion } from "@/lib/generacion/store";
import { useNegocio } from "@/lib/negocio/store";
import { useCreditos } from "@/lib/creditos/use-creditos";
import { useUserInitials } from "@/lib/auth/use-user";
import { getStyleFragment, getStyleById, getStyleLabel } from "@/lib/styles";
import { isVersionReady } from "@/lib/validations/recorrido";
import { OUTPUT_RATIOS } from "@/lib/constants";

/**
 * Página completa de una versión dentro de la Fábrica.
 *
 * Decisión de producto (2026-06): al abrir una campaña/versión desde la
 * Fábrica se navega a ESTA página (no a un modal). Acá se ven los SETEOS
 * read-only de la versión (referencias, estilo, formato) y TODAS las imágenes
 * generadas como un catálogo limpio. Cada imagen abre un modal con su detalle
 * (prompt original + prompt estricto editable). Se pueden generar más
 * variaciones con créditos.
 */
export default function FabricaVersionPage() {
  const params = useParams<{ versionId: string }>();
  const router = useRouter();
  const versions = useVersions();
  const products = useProducts();
  const generations = useGenerations();
  const generacion = useGeneracion();
  const negocio = useNegocio();
  const creditos = useCreditos();
  const brandInitials = useUserInitials();

  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const allHydrated =
    versions.hydrated && products.hydrated && generations.hydrated;
  const versionId = params.versionId;
  const version = versionId ? versions.getById(versionId) : undefined;
  const product = version ? products.getById(version.product_id) : undefined;

  const versionGens = useMemo(
    () => (versionId ? generations.getByVersionId(versionId) : []),
    [versionId, generations],
  );
  const versionImages = useMemo(() => {
    const genIds = new Set(versionGens.map((g) => g.id));
    return generations.state.images.filter((i) => genIds.has(i.generation_id));
  }, [versionGens, generations.state.images]);

  // Seteos read-only de la versión que viajan al modal de detalle de cada
  // imagen (catálogo). Cálculo barato (un find sobre 4 ratios + 2 lookups
  // O(1)); lo dejamos inline sin useMemo manual — el React Compiler de Next 16
  // ya memoiza automáticamente y evita el conflicto con
  // react-hooks/preserve-manual-memoization sobre `version`.
  const versionSettings: VersionSettings = version
    ? {
        outputRatio: version.output_ratio,
        ratioLabel:
          OUTPUT_RATIOS.find((r) => r.value === version.output_ratio)?.label ??
          null,
        referencesCount: version.reference_images.length,
        styleLabel: getStyleLabel(version.style_id),
      }
    : {
        outputRatio: "",
        ratioLabel: null,
        referencesCount: 0,
        styleLabel: null,
      };

  useEffect(() => {
    if (!allHydrated) return;
    if (!version) router.replace("/fabrica");
  }, [allHydrated, version, router]);

  async function handleGenerateMore() {
    if (!version) return;
    if (!isVersionReady(version)) return;
    if (isSubmitting) return;

    setErrorBanner(null);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId: version.id,
          styleFragment: getStyleFragment(generacion.state.selectedStyleId),
          // Identidad de marca → coherencia de la imagen con la marca del usuario.
          brand: {
            name: negocio.state.brandName,
            industry: negocio.state.industry,
            description: negocio.state.description,
          },
        }),
      });
      if (res.status === 402) {
        setErrorBanner("insufficient_credits");
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { message?: string; error?: string }
          | null;
        setErrorBanner(
          data?.message ?? data?.error ?? "No se pudo generar. Intentá de nuevo.",
        );
        return;
      }
      await creditos.refetch();
      window.location.reload();
    } catch {
      setErrorBanner(
        "No se pudo conectar. Revisá tu internet e intentá de nuevo.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!allHydrated || !version) {
    return (
      <div className="flex flex-1 flex-col gap-5 px-5 py-6 sm:px-8 lg:px-10">
        <div className="h-8 w-48 animate-pulse rounded-full bg-foreground/10" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-xl bg-foreground/5" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <Topbar
        eyebrow={product ? `${product.name.toUpperCase()} · VERSIÓN` : "VERSIÓN"}
        title={version.name}
        subtitle={version.description ?? "Todas las imágenes de esta campaña."}
        right={
          <>
            <CreditBadge showBuy={false} />
            <AvatarCircle initials={brandInitials} size={40} />
          </>
        }
      />

      <div className="flex flex-1 flex-col gap-5 px-5 pb-10 pt-2 sm:px-8 lg:px-10">
        {/* Barra de acciones */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/fabrica"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-mute transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a la Fábrica
          </Link>

          <PillButton size="md" onClick={handleGenerateMore}>
            <Plus className="h-4 w-4" />
            {versionImages.length > 0 ? "Más variaciones" : "Generar"}
          </PillButton>
        </div>

        {errorBanner ? (
          <ErrorBanner
            message={errorBanner}
            onDismiss={() => setErrorBanner(null)}
          />
        ) : null}

        <SetupPanel version={version} />

        <VersionGallery
          images={versionImages}
          versionSettings={versionSettings}
          onGenerateMore={handleGenerateMore}
        />
      </div>

      {isSubmitting ? <GeneratingOverlay /> : null}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Panel de seteos read-only (Referencias · Estilo · Formato)                 */
/* -------------------------------------------------------------------------- */

/**
 * Resumen de la receta de la versión. Read-only: la edición vive en el flujo
 * de Referencias/Estilo/Formato, no acá. Mismo lenguaje visual que el
 * `SetupRow` de `/productos/[id]/versiones/[versionId]`.
 */
function SetupPanel({ version }: { version: Version }) {
  const refs = version.reference_images;
  const refsCount = refs.length;
  const style = getStyleById(version.style_id);
  const styleLabel = getStyleLabel(version.style_id);
  const ratioInfo = OUTPUT_RATIOS.find((r) => r.value === version.output_ratio);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {/* Referencias */}
      <div className="glass-card p-4 sm:p-5">
        <span className="eyebrow">REFERENCIAS</span>
        <div className="mt-3 flex flex-col gap-3.5">
          <div className="font-display text-[22px] italic leading-tight text-foreground">
            {refsCount > 0
              ? `${refsCount} ${refsCount === 1 ? "referencia" : "referencias"}`
              : "Sin referencias"}
          </div>
          {refsCount > 0 ? (
            <div className="flex flex-wrap gap-2">
              {refs.slice(0, 5).map((url) => (
                <div
                  key={url}
                  className="relative h-[60px] w-[60px] shrink-0 overflow-hidden rounded-lg border border-border bg-card-cream/60 shadow-[0_1px_2px_rgba(15,31,22,.06)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt="Referencia"
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
              {refsCount > 5 ? (
                <div className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-lg border border-border bg-card-cream/60 font-mono text-[13px] font-bold text-mute">
                  +{refsCount - 5}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex h-[60px] w-[60px] items-center justify-center rounded-lg border border-dashed border-foreground/15 bg-card-cream/50 text-mute">
              <ImageIcon className="h-5 w-5" strokeWidth={1.6} />
            </div>
          )}
        </div>
      </div>

      {/* Estilo */}
      <div className="glass-card p-4 sm:p-5">
        <span className="eyebrow">ESTILO</span>
        <div className="mt-3 flex items-center gap-3">
          <div className="relative h-[60px] w-[60px] shrink-0 overflow-hidden rounded-lg border border-border bg-card-cream/60 shadow-[0_1px_2px_rgba(15,31,22,.06)]">
            {style?.previewImage ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={style.previewImage}
                alt={styleLabel ?? "Estilo"}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-mute">
                <ImageIcon className="h-5 w-5" strokeWidth={1.6} />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="truncate font-display text-[22px] italic leading-tight text-foreground">
              {styleLabel ?? "Sin estilo"}
            </div>
            <div className="mt-1 text-xs font-medium text-mute">
              {styleLabel ? "Estilo profesional aplicado" : "Generado sin estilo"}
            </div>
          </div>
        </div>
      </div>

      {/* Formato */}
      <div className="glass-card p-4 sm:p-5">
        <span className="eyebrow">FORMATO</span>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[1.1px] text-mute">
              Ratio
            </div>
            <div className="mt-1 font-mono text-[22px] font-bold text-foreground">
              {version.output_ratio}
            </div>
            {ratioInfo ? (
              <div className="mt-0.5 text-[11px] font-medium text-mute">
                {ratioInfo.label}
              </div>
            ) : null}
          </div>
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[1.1px] text-mute">
              Por tanda
            </div>
            <div className="mt-1 font-mono text-[22px] font-bold text-foreground">
              {version.variations_default}
            </div>
            <div className="mt-0.5 text-[11px] font-medium text-mute">
              {version.variations_default === 1 ? "imagen" : "imágenes"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ErrorBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  const isNoCredits = message === "insufficient_credits";
  const displayMessage = isNoCredits
    ? "Te quedaste sin créditos. Comprá más para seguir generando."
    : message;

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/[0.06] px-4 py-3 text-sm text-foreground"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
      <div className="flex-1">
        <p className="font-medium leading-snug">{displayMessage}</p>
        {isNoCredits ? (
          <Link
            href="/upgrade"
            className="mt-1 inline-block text-xs font-semibold text-sage-strong hover:underline"
          >
            Comprar créditos →
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
