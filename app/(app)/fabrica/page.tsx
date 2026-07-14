"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Factory, Plus } from "lucide-react";

import {
  AvatarCircle,
  FilterBar,
  PillButton,
  StatusBadge,
  Thumbnail,
  type FilterProduct,
  type FilterStatus,
  type StatusBadgeStatus,
  type ThumbnailTone,
} from "@/components/dashboard";
import { Topbar } from "@/components/app/topbar";
import { formatRelativeTime } from "@/lib/generations/format";
import { useGenerations } from "@/lib/generations/store";
import { CreditBadge } from "@/components/app/credit-badge";
import { useUserInitials } from "@/lib/auth/use-user";
import { useProducts } from "@/lib/products/store";
import { useVersions } from "@/lib/versions/store";
import type { Version } from "@/lib/versions/store";
import type { Generation } from "@/lib/generations/store";
import type { Product } from "@/lib/products/store";

/**
 * Fábrica — inbox de versiones según mock v2 `screen-fabrica.jsx`.
 *
 * Cambio respecto a la versión anterior: ya NO es un panel de "generar prompt".
 * Ahora es un grid filtrado de TODAS las versiones del usuario. Cada card
 * comunica producto padre + estado + ratio. Click → abre `<VersionDrawer>`.
 *
 * El botón "Generar" vive ahora DENTRO del drawer (handleGenerateMore) y en
 * el detalle de versión (`/productos/[id]/versiones/[versionId]`).
 */
export default function FabricaPage() {
  // Next 16 exige envolver cualquier componente que use `useSearchParams()`
  // en `<Suspense>` para que el prerender no falle.
  return (
    <Suspense fallback={<FabricaSkeleton />}>
      <FabricaContent />
    </Suspense>
  );
}

function FabricaContent() {
  const products = useProducts();
  const versions = useVersions();
  const generations = useGenerations();
  const brandInitials = useUserInitials();
  const router = useRouter();

  const allHydrated =
    products.hydrated && versions.hydrated && generations.hydrated;

  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterProductId, setFilterProductId] = useState<FilterProduct>("all");

  // Estado efectivo de cada versión a partir de sus generations.
  //
  // Buckets (sin chip "Generando"):
  //  - `completed`: la versión tiene AL MENOS una generation `completed`.
  //    Aunque haya otras pending/processing en paralelo, el usuario quiere
  //    ver el progreso bajo "Listas" — apenas hay un resultado concreto, salta.
  //  - `processing`: tiene generations pending/processing pero todavía
  //    NINGUNA completed. La conservamos como sub-estado interno para el
  //    `StatusBadge` de la card (sigue mostrando "Generando…"), pero a efectos
  //    del FilterBar cae en el bucket `draft` (ver `bucketFor` más abajo).
  //  - `draft`: sin generations.
  const effectiveStatus = useMemo(() => {
    const map = new Map<string, "processing" | "completed" | "draft">();
    for (const v of versions.state.versions) {
      const gens = generations.state.generations.filter(
        (g) => g.version_id === v.id,
      );
      if (gens.length === 0) {
        map.set(v.id, "draft");
        continue;
      }
      const hasCompleted = gens.some((g) => g.status === "completed");
      if (hasCompleted) {
        map.set(v.id, "completed");
        continue;
      }
      const hasProcessing = gens.some(
        (g) => g.status === "processing" || g.status === "pending",
      );
      if (hasProcessing) {
        map.set(v.id, "processing");
        continue;
      }
      map.set(v.id, "draft");
    }
    return map;
  }, [versions.state.versions, generations.state.generations]);

  const filteredVersions = useMemo(() => {
    const sorted = [...versions.state.versions].sort((a, b) =>
      a.updated_at < b.updated_at ? 1 : -1,
    );
    return sorted.filter((v) => {
      if (filterProductId !== "all" && v.product_id !== filterProductId)
        return false;
      if (filterStatus === "all") return true;
      // El bucket de FilterBar es `"all" | "completed" | "draft"` — sin
      // "processing". Mapeamos el effectiveStatus interno al bucket público:
      //   completed → "completed" (Listas)
      //   processing | draft → "draft" (Sin generar)
      const internal = effectiveStatus.get(v.id) ?? "draft";
      const bucket = internal === "completed" ? "completed" : "draft";
      return bucket === filterStatus;
    });
  }, [
    versions.state.versions,
    effectiveStatus,
    filterProductId,
    filterStatus,
  ]);

  const filteredProductOptions = useMemo(
    () => products.state.products.map((p) => ({ id: p.id, name: p.name })),
    [products.state.products],
  );

  if (!allHydrated) {
    return <FabricaSkeleton />;
  }

  const totalVersions = versions.state.versions.length;
  const hasAnyVersions = totalVersions > 0;
  const hasFilteredResults = filteredVersions.length > 0;

  return (
    <>
      <Topbar
        title="La"
        titleAccent="Fábrica"
        subtitle="Tus versiones en marcha y entregadas."
        right={
          <>
            <CreditBadge />
            <AvatarCircle initials={brandInitials} size={40} />
          </>
        }
      />

      <div className="flex flex-1 flex-col gap-5 px-5 pb-8 pt-2 sm:px-8 lg:px-10">
        {hasAnyVersions ? (
          <>
            <FilterBar
              status={filterStatus}
              onStatusChange={setFilterStatus}
              productId={filterProductId}
              onProductChange={setFilterProductId}
              products={filteredProductOptions}
              total={filteredVersions.length}
            />

            {hasFilteredResults ? (
              <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredVersions.map((v) => (
                  <FabricaVersionCard
                    key={v.id}
                    version={v}
                    product={products.getById(v.product_id) ?? null}
                    generations={generations.state.generations.filter(
                      (g) => g.version_id === v.id,
                    )}
                    status={statusFor(effectiveStatus.get(v.id) ?? "draft")}
                    images={generations.state.images}
                    onOpen={() => router.push(`/fabrica/${v.id}`)}
                  />
                ))}
              </section>
            ) : (
              <FilteredEmptyState
                onReset={() => {
                  setFilterStatus("all");
                  setFilterProductId("all");
                }}
              />
            )}
          </>
        ) : (
          <EmptyState />
        )}
      </div>

    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Card — versión clickeable (vertical, abre drawer)                          */
/* -------------------------------------------------------------------------- */

type CardProps = {
  version: Version;
  product: Product | null;
  generations: Generation[];
  images: { generation_id: string; image_url: string }[];
  status: StatusBadgeStatus;
  onOpen: () => void;
};

function FabricaVersionCard({
  version,
  product,
  generations: versionGens,
  images,
  status,
  onOpen,
}: CardProps) {
  // Buscamos la primera imagen generada — la usamos como cover si existe.
  const firstImageUrl = useMemo(() => {
    for (const gen of versionGens) {
      if (gen.status !== "completed") continue;
      const img = images.find((i) => i.generation_id === gen.id);
      if (img) return img.image_url;
    }
    return undefined;
  }, [versionGens, images]);

  // "Una imagen = una generación" (Paolo): contamos la cantidad REAL de
  // imágenes de generations `completed` de esta versión, para que el contador
  // de la card coincida con el catálogo (no batches).
  const imagesCount = useMemo(() => {
    const completedGenIds = new Set(
      versionGens.filter((g) => g.status === "completed").map((g) => g.id),
    );
    if (completedGenIds.size === 0) return 0;
    return images.filter((i) => completedGenIds.has(i.generation_id)).length;
  }, [versionGens, images]);

  const latestGen = versionGens[0];
  const lastActivity = latestGen
    ? formatRelativeTime(latestGen.created_at)
    : null;

  const refsCount = version.reference_images.length;

  function handleClick() {
    onOpen();
  }
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
  }

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="glass-card group cursor-pointer overflow-hidden p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
    >
      {/* Hero — imagen generada si existe, si no un placeholder neutro del tema. */}
      <div className="relative overflow-hidden" style={{ aspectRatio: "5 / 3" }}>
        {firstImageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={firstImageUrl}
            alt={version.name}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <Thumbnail tone={toneFromVersion(version.id)} radius={0} />
        )}

        {/* Status pill + ratio chip. */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-3 pt-3">
          <StatusBadge status={status} size="sm" />
          <span className="rounded-md bg-[rgba(15,31,22,0.78)] px-2 py-[3px] font-mono text-[10.5px] font-bold tracking-[0.4px] text-[#F0F4E7]">
            {version.output_ratio}
          </span>
        </div>
      </div>

      {/* Body. */}
      <div className="flex flex-col gap-2 px-4 pb-4 pt-3.5">
        <span className="eyebrow text-[10px]">
          {product?.name ?? "Sin producto"}
        </span>
        <div className="truncate font-display text-[22px] italic leading-tight text-foreground" title={version.name}>
          {version.name}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] font-medium text-mute">
          <span>
            <span className="font-semibold text-ink-soft">{refsCount}</span>{" "}
            {refsCount === 1 ? "ref" : "refs"}
          </span>
          <span aria-hidden className="h-[3px] w-[3px] rounded-sm bg-mute" />
          <span>
            <span className="font-semibold text-ink-soft">{imagesCount}</span>{" "}
            {imagesCount === 1 ? "img" : "imgs"}
          </span>
          {lastActivity ? (
            <>
              <span aria-hidden className="h-[3px] w-[3px] rounded-sm bg-mute" />
              <span>{lastActivity}</span>
            </>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Empty states + skeleton                                                    */
/* -------------------------------------------------------------------------- */

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="glass-card mx-auto flex max-w-md flex-col items-center gap-3 p-8 text-center sm:p-10"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-foreground/5 text-foreground">
        <Factory className="h-5 w-5" strokeWidth={1.6} />
      </div>
      <h2 className="font-display text-2xl italic text-foreground">
        Tu Fábrica está limpia
      </h2>
      <p className="max-w-sm text-sm text-mute">
        Andá al catálogo y elegí un producto para crear tu primera versión.
      </p>
      <div className="mt-2">
        <PillButton size="md" asChild>
          <Link href="/productos">
            <Plus className="h-4 w-4" />
            Ir al catálogo
          </Link>
        </PillButton>
      </div>
    </motion.div>
  );
}

function FilteredEmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="glass-card flex flex-col items-center gap-3 p-7 text-center">
      <p className="text-sm text-mute">Ningún resultado con esos filtros.</p>
      <button
        type="button"
        onClick={onReset}
        className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-border bg-card-cream/60 px-4 py-2 text-[13px] font-semibold text-foreground transition-colors hover:bg-card-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
      >
        Limpiar filtros
      </button>
    </div>
  );
}

function FabricaSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-5 px-5 py-6 sm:px-8 lg:px-10">
      <div className="h-8 w-48 animate-pulse rounded-full bg-foreground/10" />
      <div className="h-4 w-80 animate-pulse rounded-full bg-foreground/5" />
      <div className="h-16 w-full animate-pulse rounded-xl bg-foreground/5" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div
            key={idx}
            className="h-72 animate-pulse rounded-xl bg-foreground/5"
          />
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Mapea el "estado efectivo" interno al status accepted por `StatusBadge`.
 * Decisión del usuario: las cards NO muestran "Generando" — el flujo va directo
 * de "En cola" a "Listo". El sub-estado processing se considera pre-completed
 * y muestra el mismo badge que draft.
 *  - draft | processing → pending (badge "En cola")
 *  - completed → completed (badge "Listo")
 */
function statusFor(effective: "processing" | "completed" | "draft"): StatusBadgeStatus {
  if (effective === "completed") return "completed";
  return "pending";
}

const TONES: ThumbnailTone[] = [
  "sage",
  "butter",
  "paper",
  "clay",
  "mineral",
  "editorial",
  "champagne",
];

function toneFromVersion(versionId: string): ThumbnailTone {
  let hash = 0;
  for (let i = 0; i < versionId.length; i += 1) {
    hash = (hash * 31 + versionId.charCodeAt(i)) | 0;
  }
  return TONES[Math.abs(hash) % TONES.length];
}

