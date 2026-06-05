"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, Copy, Plus, X } from "lucide-react";

import { AvatarCircle, PillButton } from "@/components/dashboard";
import { Topbar } from "@/components/app/topbar";
import { CreditBadge } from "@/components/app/credit-badge";
import { GeneratingOverlay } from "@/components/app/generating-overlay";
import { VersionGallery } from "@/components/app/version-gallery";
import { useVersions } from "@/lib/versions/store";
import { useProducts } from "@/lib/products/store";
import { useGenerations } from "@/lib/generations/store";
import { useGeneracion } from "@/lib/generacion/store";
import { useCreditos } from "@/lib/creditos/use-creditos";
import { useUserInitials } from "@/lib/auth/use-user";
import { getStyleFragment } from "@/lib/styles";
import { isVersionReady } from "@/lib/validations/recorrido";

/**
 * Página completa de una versión dentro de la Fábrica.
 *
 * Decisión de producto (2026-06): al abrir una campaña/versión desde la
 * Fábrica se navega a ESTA página (no a un modal). Acá se ven TODAS las
 * imágenes generadas de la versión, se generan más (con créditos) y se
 * duplica.
 */
export default function FabricaVersionPage() {
  const params = useParams<{ versionId: string }>();
  const router = useRouter();
  const versions = useVersions();
  const products = useProducts();
  const generations = useGenerations();
  const generacion = useGeneracion();
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

  useEffect(() => {
    if (!allHydrated) return;
    if (!version) router.replace("/fabrica");
  }, [allHydrated, version, router]);

  const latestGen = versionGens[0] ?? null;
  const isGenerating =
    latestGen?.status === "processing" || latestGen?.status === "pending";

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

  function handleDuplicate() {
    if (!version) return;
    const copy = versions.duplicateVersion(version.id);
    if (copy) router.push(`/fabrica/${copy.id}`);
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

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDuplicate}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-[13px] font-semibold text-foreground transition-colors hover:bg-foreground/5"
            >
              <Copy className="h-4 w-4" />
              Duplicar
            </button>
            <PillButton size="md" onClick={handleGenerateMore}>
              <Plus className="h-4 w-4" />
              {versionImages.length > 0 ? "Más variaciones" : "Generar"}
            </PillButton>
          </div>
        </div>

        {errorBanner ? (
          <ErrorBanner
            message={errorBanner}
            onDismiss={() => setErrorBanner(null)}
          />
        ) : null}

        <VersionGallery
          images={versionImages}
          isGenerating={isGenerating}
          latestGen={latestGen}
          onGenerateMore={handleGenerateMore}
        />
      </div>

      {isSubmitting ? <GeneratingOverlay /> : null}
    </>
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
