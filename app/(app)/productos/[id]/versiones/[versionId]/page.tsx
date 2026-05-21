"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { ImagePlus, Plus } from "lucide-react";
import {
  GenerationCard,
  PillButton,
} from "@/components/dashboard";
import { formatRelativeTime } from "@/lib/generations/format";
import { useGenerations } from "@/lib/generations/store";
import { useProducts } from "@/lib/products/store";
import { useRecorrido } from "@/lib/recorrido/store";
import { useVersions } from "@/lib/versions/store";

/**
 * Detalle de una versión — muestra referencias, configuración (ratio +
 * variations), prompt actual y todas las generaciones que cuelgan de la
 * versión. Cada sección tiene su botón "editar" que setea el recorrido
 * (productId + versionId) y manda a la estación correspondiente.
 *
 * Si el versionId no matchea (o el productId del path no coincide con
 * `version.product_id`) → redirect a `/productos`.
 */
export default function VersionDetailPage() {
  const params = useParams<{ id: string; versionId: string }>();
  const router = useRouter();
  const products = useProducts();
  const versions = useVersions();
  const generations = useGenerations();
  const recorrido = useRecorrido();

  const productId = params.id;
  const versionId = params.versionId;
  const allHydrated =
    products.hydrated && versions.hydrated && generations.hydrated;

  const product = productId ? products.getById(productId) : undefined;
  const version = versionId ? versions.getById(versionId) : undefined;

  // Si después de hidratar falta producto / versión o no se corresponden,
  // volvemos al catálogo. Mismo criterio que el detalle de producto.
  useEffect(() => {
    if (!allHydrated) return;
    if (!product || !version || version.product_id !== product.id) {
      router.replace("/productos");
    }
  }, [allHydrated, product, version, router]);

  const versionGenerations = useMemo(() => {
    if (!version) return [];
    return generations.getByVersionId(version.id);
  }, [generations, version]);

  function activateVersionAnd(path: string) {
    if (!product || !version) return;
    recorrido.setState({ productId: product.id, versionId: version.id });
    router.push(path);
  }

  if (!allHydrated || !product || !version) {
    return <VersionSkeleton />;
  }

  return (
    <div className="px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <VersionHeader
          product={product}
          version={version}
          onMoreVariations={() => activateVersionAnd("/fabrica")}
        />

        <VersionReferencesSection
          version={version}
          onEdit={() => activateVersionAnd("/referencias")}
        />

        <VersionConfigSection
          version={version}
          onEdit={() => activateVersionAnd("/formato")}
        />

        <VersionPromptSection
          version={version}
          onEdit={() => activateVersionAnd("/fabrica")}
        />

        <VersionGenerationsSection
          versionName={version.name}
          generations={versionGenerations}
          generationImages={generations.state.images}
          onGenerate={() => activateVersionAnd("/fabrica")}
        />
      </div>
    </div>
  );
}

function VersionHeader({
  product,
  version,
  onMoreVariations,
}: {
  product: { id: string; name: string };
  version: { name: string; description: string | null };
  onMoreVariations: () => void;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <nav
          aria-label="Breadcrumb"
          className="text-xs text-green-text"
        >
          <Link
            href={`/productos/${product.id}`}
            className="hover:text-green-dark hover:underline"
          >
            {product.name}
          </Link>
          <span aria-hidden> / </span>
          <span>Versiones</span>
          <span aria-hidden> / </span>
          <span className="text-green-dark">{version.name}</span>
        </nav>
        <span className="eyebrow mt-2 inline-block">VERSIÓN</span>
        <h1 className="mt-1 truncate text-2xl font-medium tracking-tight text-green-dark sm:text-3xl">
          {version.name}
        </h1>
        {version.description ? (
          <p className="mt-1 text-sm text-green-text">{version.description}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:justify-end">
        <PillButton size="md" onClick={onMoreVariations}>
          <Plus className="h-4 w-4" />
          Más variaciones
        </PillButton>
      </div>
    </header>
  );
}

function VersionReferencesSection({
  version,
  onEdit,
}: {
  version: { reference_images: string[] };
  onEdit: () => void;
}) {
  const refs = version.reference_images;
  return (
    <section className="mt-8">
      <div className="glass-card flex flex-col gap-4 p-6 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <span className="eyebrow">REFERENCIAS</span>
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex min-h-[44px] items-center justify-center rounded-full px-3 py-2 text-xs text-green-text hover:text-green-dark"
          >
            Editar referencias
          </button>
        </div>
        {refs.length === 0 ? (
          <p className="text-sm text-green-text">
            Esta versión no tiene referencias todavía.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {refs.map((url) => (
              <div
                key={url}
                className="glass relative aspect-square overflow-hidden rounded-2xl border border-white/60"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt="Referencia"
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function VersionConfigSection({
  version,
  onEdit,
}: {
  version: { output_ratio: string; variations_default: number };
  onEdit: () => void;
}) {
  return (
    <section className="mt-6">
      <div className="glass-card flex flex-col gap-3 p-6 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <span className="eyebrow">CONFIGURACIÓN</span>
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex min-h-[44px] items-center justify-center rounded-full px-3 py-2 text-xs text-green-text hover:text-green-dark"
          >
            Editar configuración
          </button>
        </div>
        <dl className="grid grid-cols-1 gap-2 text-sm text-green-dark sm:grid-cols-2">
          <div className="flex items-center justify-between gap-2 sm:flex-col sm:items-start sm:gap-0.5">
            <dt className="text-xs text-green-text">Ratio</dt>
            <dd className="font-mono">{version.output_ratio}</dd>
          </div>
          <div className="flex items-center justify-between gap-2 sm:flex-col sm:items-start sm:gap-0.5">
            <dt className="text-xs text-green-text">Variaciones por tanda</dt>
            <dd className="font-mono">{version.variations_default}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function VersionPromptSection({
  version,
  onEdit,
}: {
  version: { user_prompt: string };
  onEdit: () => void;
}) {
  const trimmed = version.user_prompt.trim();
  return (
    <section className="mt-6">
      <div className="glass-card flex flex-col gap-3 p-6 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <span className="eyebrow">PROMPT</span>
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex min-h-[44px] items-center justify-center rounded-full px-3 py-2 text-xs text-green-text hover:text-green-dark"
          >
            Editar prompt
          </button>
        </div>
        {trimmed.length === 0 ? (
          <p className="text-sm italic text-green-text">
            (prompt generado automáticamente al ir a la Fábrica)
          </p>
        ) : (
          <p className="whitespace-pre-line text-sm text-green-dark">
            {version.user_prompt}
          </p>
        )}
      </div>
    </section>
  );
}

function VersionGenerationsSection({
  versionName,
  generations,
  generationImages,
  onGenerate,
}: {
  versionName: string;
  generations: ReturnType<typeof useGenerations>["state"]["generations"];
  generationImages: ReturnType<typeof useGenerations>["state"]["images"];
  onGenerate: () => void;
}) {
  return (
    <section className="mt-10">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-medium text-green-dark">
          Generaciones ({generations.length})
        </h2>
      </div>

      {generations.length === 0 ? (
        <div className="glass-card mt-4 flex flex-col items-center gap-3 p-8 text-center sm:p-10">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-dark/10">
            <ImagePlus className="h-5 w-5 text-green-dark" />
          </div>
          <p className="max-w-sm text-sm text-green-text">
            Todavía no generaste imágenes para esta versión.
          </p>
          <div className="mt-1">
            <PillButton size="md" onClick={onGenerate}>
              <Plus className="h-4 w-4" />
              Generar
            </PillButton>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {generations.map((gen) => {
            // Buscamos la primera imagen generada de esta generación; si no
            // existe (todavía processing/failed), caemos a product_images.
            const firstImage = generationImages.find(
              (img) => img.generation_id === gen.id,
            )?.image_url;
            const previewSrc = firstImage ?? gen.product_images[0];
            return (
              <GenerationCard
                key={gen.id}
                id={gen.id}
                projectName={versionName}
                ratio={gen.output_ratio}
                status={gen.status}
                variations={gen.variations_requested}
                relativeTime={formatRelativeTime(gen.created_at)}
                thumbnailUrl={previewSrc}
                href={`/proyectos/${gen.id}`}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function VersionSkeleton() {
  return (
    <div className="px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2">
            <div className="h-3 w-40 animate-pulse rounded-full bg-white/30" />
            <div className="h-3 w-20 animate-pulse rounded-full bg-white/30" />
            <div className="h-8 w-64 animate-pulse rounded-full bg-white/40" />
          </div>
          <div className="h-11 w-40 animate-pulse rounded-full bg-white/40" />
        </div>
        <div className="glass-card mt-8 h-40 animate-pulse" />
        <div className="glass-card mt-6 h-24 animate-pulse" />
        <div className="glass-card mt-6 h-32 animate-pulse" />
        <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="glass-card-compact h-64 animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
