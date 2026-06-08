"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertCircle, ArrowRight, ImageIcon, Sparkles, X } from "lucide-react";

import {
  AvatarCircle,
  HeroCTAButton,
  PillButton,
} from "@/components/dashboard";
import { Topbar } from "@/components/app/topbar";
import {
  parseCuratedRef,
  type CuratedStyle,
} from "@/app/(app)/referencias/page";
import { useGeneracion } from "@/lib/generacion/store";
import { useGenerations } from "@/lib/generations/store";
import { useNegocio } from "@/lib/negocio/store";
import { CreditBadge } from "@/components/app/credit-badge";
import { GeneratingOverlay } from "@/components/app/generating-overlay";
import { useUserInitials } from "@/lib/auth/use-user";
import { useProducts } from "@/lib/products/store";
import { useRecorrido } from "@/lib/recorrido/store";
import { useVersions } from "@/lib/versions/store";
import type { Product } from "@/lib/products/store";
import type { Version } from "@/lib/versions/store";
import { getStyleFragment } from "@/lib/styles";
import { isVersionReady } from "@/lib/validations/recorrido";
import { OUTPUT_RATIOS } from "@/lib/constants";

/**
 * Detalle de versión — pantalla de configuración pura.
 *
 * Decisión de producto (2026-05): esta página es SOLO setup. Las imágenes
 * generadas viven exclusivamente en la Fábrica (drawer). Acá el usuario:
 *  1. Ve los 3 setup cards (Producto, Estilo, Formato) que componen la versión.
 *  2. Dispara la generación con "Generar primera tanda" (o "+ Más variaciones"
 *     si ya hay gens completed).
 *  3. Al terminar el mock, **redirige a `/fabrica?open=<versionId>`** para
 *     que vea el resultado en el drawer de la Fábrica.
 *
 * Si la versión ya tiene generaciones, mostramos una banda discreta arriba
 * del callout con el conteo y un link directo a la Fábrica. NO mostramos
 * grid de imágenes ni strict_prompt acá — eso vive en el drawer.
 */
export default function VersionDetailPage() {
  const params = useParams<{ id: string; versionId: string }>();
  const router = useRouter();
  const products = useProducts();
  const versions = useVersions();
  const generations = useGenerations();
  const recorrido = useRecorrido();
  const negocio = useNegocio();
  const generacion = useGeneracion();
  const brandInitials = useUserInitials();

  const productId = params.id;
  const versionId = params.versionId;
  const allHydrated =
    products.hydrated &&
    versions.hydrated &&
    generations.hydrated &&
    negocio.hydrated;

  const product = productId ? products.getById(productId) : undefined;
  const version = versionId ? versions.getById(versionId) : undefined;

  useEffect(() => {
    if (!allHydrated) return;
    if (!product || !version || version.product_id !== product.id) {
      router.replace("/productos");
    }
  }, [allHydrated, product, version, router]);

  // Derivaciones — React Compiler las memoiza automáticamente.
  const versionGenerations = version
    ? generations.getByVersionId(version.id)
    : [];

  // Conteo de imágenes generadas (de generations completed) — sólo para
  // mostrar la banda informativa. NO renderizamos thumbnails acá.
  const completedImagesCount = (() => {
    if (!version) return 0;
    const completedGenIds = new Set(
      versionGenerations
        .filter((g) => g.status === "completed")
        .map((g) => g.id),
    );
    if (completedGenIds.size === 0) return 0;
    return generations.state.images.filter((img) =>
      completedGenIds.has(img.generation_id),
    ).length;
  })();

  // Banner de error inline cuando la generación falla. Mismo patrón que en
  // `/fabrica`: el sentinel `"missing_key"` activa copy + CTA específicos.
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  // Lock para evitar dobles clicks mientras una tanda está en curso.
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleGenerate() {
    if (!product || !version) return;
    if (!isVersionReady(version)) return;
    if (isSubmitting) return;

    setErrorBanner(null);
    setIsSubmitting(true);
    const targetVersionId = version.id;

    try {
      // Modelo de créditos: generación SERVER-SIDE con la key propia de Vendí.
      const res = await fetch("/api/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId: version.id,
          styleFragment: getStyleFragment(generacion.state.selectedStyleId),
          // Identidad de marca → el Director la usa para que las imágenes salgan
          // coherentes con la marca del usuario.
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

      // OK: vamos a la página completa de la versión. Usamos navegación con
      // recarga (no router.push) para que el store re-hidrate desde la DB y
      // muestre las imágenes recién generadas por el server.
      window.location.assign(`/fabrica/${targetVersionId}`);
    } catch {
      setErrorBanner(
        "No se pudo conectar. Revisá tu internet e intentá de nuevo.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function goEditReferences() {
    if (!product || !version) return;
    recorrido.setState({ productId: product.id, versionId: version.id });
    router.push("/referencias");
  }

  function goEditFormato() {
    if (!product || !version) return;
    recorrido.setState({ productId: product.id, versionId: version.id });
    router.push("/formato");
  }

  if (!allHydrated || !product || !version) {
    return <VersionSkeleton />;
  }

  const hasCompletedGens = versionGenerations.some(
    (g) => g.status === "completed",
  );
  const curated = pickCuratedStyle(version.reference_images);

  return (
    <>
      <Topbar
        eyebrow={`${product.name.toUpperCase()} · VERSIÓN`}
        title={version.name}
        subtitle={
          version.description ??
          "Configurá el set de variaciones y mandalas a la Fábrica."
        }
        right={
          <>
            <div
              className={
                isSubmitting ? "pointer-events-none opacity-60" : undefined
              }
              aria-disabled={isSubmitting}
            >
              {hasCompletedGens ? (
                <PillButton size="md" onClick={handleGenerate}>
                  <Sparkles className="h-4 w-4" />
                  {isSubmitting ? "Generando…" : "Más variaciones"}
                </PillButton>
              ) : (
                <HeroCTAButton icon={Sparkles} onClick={handleGenerate}>
                  {isSubmitting ? "Generando…" : "Generar primera tanda"}
                </HeroCTAButton>
              )}
            </div>
            <CreditBadge showBuy={false} />
            <AvatarCircle initials={brandInitials} size={40} />
          </>
        }
      />

      <div className="flex flex-1 flex-col gap-5 px-5 pb-8 pt-2 sm:px-8 lg:px-10">
        <Breadcrumb product={product} versionName={version.name} />

        {errorBanner ? (
          <ErrorBanner
            message={errorBanner}
            onDismiss={() => setErrorBanner(null)}
          />
        ) : null}

        <SetupRow
          product={product}
          version={version}
          curated={curated}
          onEditReferences={goEditReferences}
          onEditFormato={goEditFormato}
        />

        {hasCompletedGens && completedImagesCount > 0 ? (
          <GeneratedBanner
            versionId={version.id}
            count={completedImagesCount}
          />
        ) : null}

        <CalloutGenerate
          curated={curated}
          version={version}
          hasCompletedGens={hasCompletedGens}
          isSubmitting={isSubmitting}
          onGenerate={handleGenerate}
        />
      </div>

      {isSubmitting ? <GeneratingOverlay /> : null}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Breadcrumb                                                                 */
/* -------------------------------------------------------------------------- */

function Breadcrumb({
  product,
  versionName,
}: {
  product: Product;
  versionName: string;
}) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1.5 text-xs font-semibold text-mute-on-bg"
    >
      <Link
        href={`/productos/${product.id}`}
        className="hover:text-foreground hover:underline"
      >
        {product.name}
      </Link>
      <span aria-hidden className="opacity-50">/</span>
      <span>Versiones</span>
      <span aria-hidden className="opacity-50">/</span>
      <span className="font-bold text-foreground">{versionName}</span>
    </nav>
  );
}

/* -------------------------------------------------------------------------- */
/*  Setup row (3 cards: Producto, Estilo, Formato)                             */
/* -------------------------------------------------------------------------- */

function SetupRow({
  product,
  version,
  curated,
  onEditReferences,
  onEditFormato,
}: {
  product: Product;
  version: Version;
  curated: CuratedStyle | null;
  onEditReferences: () => void;
  onEditFormato: () => void;
}) {
  const photosCount = product.product_images.length;
  const cover = product.cover_image_url ?? product.product_images[0];
  const ratioInfo = OUTPUT_RATIOS.find((r) => r.value === version.output_ratio);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {/* Producto */}
      <div className="glass-card p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <span className="eyebrow">PRODUCTO</span>
          <Link
            href={`/productos/${product.id}`}
            className="text-[11.5px] font-bold text-sage-strong hover:underline"
          >
            Ver producto
          </Link>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="relative h-[74px] w-[74px] shrink-0 overflow-hidden rounded-lg border border-border bg-card-cream/60">
            {cover ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={cover}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-mute">
                <ImageIcon className="h-5 w-5" strokeWidth={1.6} />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="truncate font-display text-[22px] italic leading-tight text-foreground" title={product.name}>
              {product.name}
            </div>
            <div className="mt-1 text-xs font-medium text-mute">
              {photosCount} {photosCount === 1 ? "foto" : "fotos"}
            </div>
          </div>
        </div>
      </div>

      {/* Estilo */}
      <div className="glass-card p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <span className="eyebrow">ESTILO</span>
          <button
            type="button"
            onClick={onEditReferences}
            className="text-[11.5px] font-bold text-sage-strong hover:underline"
          >
            Editar referencias
          </button>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div
            className="relative h-[74px] w-[74px] shrink-0 overflow-hidden rounded-lg shadow-[0_1px_0_rgba(15,31,22,.06),0_6px_16px_-10px_rgba(15,31,22,.22)]"
            style={{ backgroundColor: curated?.color ?? "#E8E4D2" }}
          >
            <span
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(circle at 30% 25%, rgba(255,255,255,0.22), transparent 55%)",
              }}
            />
          </div>
          <div className="min-w-0">
            <div className="truncate font-display text-[22px] italic leading-tight text-foreground">
              {curated?.label ?? "Sin estilo"}
            </div>
            <div className="mt-1 text-xs font-medium text-mute">
              {curated ? "Galería curada" : "Subí o elegí refs"}
            </div>
          </div>
        </div>
      </div>

      {/* Formato */}
      <div className="glass-card p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <span className="eyebrow">FORMATO</span>
          <button
            type="button"
            onClick={onEditFormato}
            className="text-[11.5px] font-bold text-sage-strong hover:underline"
          >
            Editar formato
          </button>
        </div>
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

/* -------------------------------------------------------------------------- */
/*  Banner discreto: "N imágenes generadas — Ver en Fábrica →"                 */
/* -------------------------------------------------------------------------- */

function GeneratedBanner({
  versionId,
  count,
}: {
  versionId: string;
  count: number;
}) {
  return (
    <Link
      href={`/fabrica?open=${encodeURIComponent(versionId)}`}
      className="group inline-flex items-center justify-between gap-3 self-start rounded-full border border-border bg-card-cream/70 px-4 py-2 text-xs font-semibold text-mute-on-bg transition-colors hover:bg-card-cream hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
    >
      <span>
        <span className="font-mono text-foreground">{count}</span>{" "}
        {count === 1 ? "imagen generada" : "imágenes generadas"}
      </span>
      <span className="inline-flex items-center gap-1 text-sage-strong">
        Ver en Fábrica
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/*  Callout "Listo para generar" — siempre presente                            */
/* -------------------------------------------------------------------------- */

function CalloutGenerate({
  curated,
  version,
  hasCompletedGens,
  isSubmitting,
  onGenerate,
}: {
  curated: CuratedStyle | null;
  version: Version;
  hasCompletedGens: boolean;
  isSubmitting: boolean;
  onGenerate: () => void;
}) {
  const count = version.variations_default;
  const ratio = version.output_ratio;
  const styleLabel = curated?.label ?? "neutro";
  const canGenerate = isVersionReady(version) && !isSubmitting;

  const eyebrow = hasCompletedGens ? "GENERAR MÁS" : "LISTO PARA GENERAR";
  const ctaLabel = isSubmitting
    ? "Generando…"
    : hasCompletedGens
      ? "+ Más variaciones"
      : "Generar primera tanda";

  return (
    <div className="glass-card flex flex-col items-stretch gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-7">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
        <div
          aria-hidden
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full shadow-[0_1px_0_rgba(15,31,22,.06),0_6px_16px_-10px_rgba(15,31,22,.22)]"
          style={{
            backgroundColor: curated?.color ?? "#E8E4D2",
            color: curated?.textOn === "white" ? "#FFFFFF" : "#1B1B1B",
          }}
        >
          <Sparkles className="h-6 w-6" strokeWidth={1.6} />
        </div>
        <div className="min-w-0">
          <span className="eyebrow">{eyebrow}</span>
          <h3 className="mt-1 font-display text-[26px] italic leading-snug text-foreground">
            <span className="tabular-nums">{count}</span> imágenes{" "}
            <span className="font-mono text-lg not-italic font-bold">{ratio}</span>{" "}
            en estilo <em className="italic">{styleLabel}</em>
          </h3>
          <p className="mt-1.5 max-w-md text-xs font-medium leading-relaxed text-mute-on-bg">
            {hasCompletedGens
              ? "Sumá otra tanda. El resultado aparece en la Fábrica."
              : "Cuando termine, vas directo a la Fábrica para ver el resultado."}{" "}
            Tarda ~1 minuto.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-none">
        {/* No tenemos `disabled` en `HeroCTAButton` (componente compartido) —
            envolvemos en un wrapper que apaga el click y baja la opacidad
            mientras `isSubmitting` o `!isVersionReady`. */}
        <div
          className={!canGenerate ? "pointer-events-none opacity-50" : undefined}
          aria-disabled={!canGenerate}
        >
          <HeroCTAButton icon={Sparkles} onClick={onGenerate}>
            {ctaLabel}
          </HeroCTAButton>
        </div>
        {isSubmitting ? (
          <span className="text-center text-[11px] text-mute sm:text-right">
            Tarda 5-30s según cantidad de variaciones.
          </span>
        ) : !isVersionReady(version) ? (
          <span className="text-center text-[11px] text-mute sm:text-right">
            Subí al menos 1 referencia para habilitar.
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Skeleton + helpers                                                         */
/* -------------------------------------------------------------------------- */

function VersionSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-5 px-5 py-6 sm:px-8 sm:py-8 lg:px-10">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="h-3 w-32 animate-pulse rounded-full bg-foreground/10" />
          <div className="h-9 w-64 animate-pulse rounded-full bg-foreground/10" />
        </div>
        <div className="h-11 w-44 animate-pulse rounded-full bg-foreground/10" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-xl bg-foreground/5" />
        ))}
      </div>
      <div className="h-44 animate-pulse rounded-xl bg-foreground/5" />
    </div>
  );
}


function pickCuratedStyle(refs: string[]): CuratedStyle | null {
  for (const ref of refs) {
    const parsed = parseCuratedRef(ref);
    if (parsed) return parsed;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*  ErrorBanner                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Mismo banner inline que usa `/fabrica`. Centralizamos un helper local en
 * vez de extraer a `components/` para no inflar la API pública por un caso
 * que sólo se usa en 2 pantallas.
 */
function ErrorBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  const isMissingKey = message === "missing_key";
  const isNoCredits = message === "insufficient_credits";
  const displayMessage = isMissingKey
    ? "Para generar imágenes reales, configurá tu API key de Gemini en Mi Negocio."
    : isNoCredits
      ? "Te quedaste sin créditos. Comprá más para seguir generando."
      : message;

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/[0.06] px-4 py-3 text-sm text-foreground"
    >
      <AlertCircle
        className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
        aria-hidden
      />
      <div className="flex-1">
        <p className="font-medium leading-snug">{displayMessage}</p>
        {isMissingKey ? (
          <Link
            href="/mi-negocio"
            className="mt-1 inline-block text-xs font-semibold text-sage-strong hover:underline"
          >
            Ir a Mi Negocio →
          </Link>
        ) : null}
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
