"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { AlertCircle, Factory, Plus, X } from "lucide-react";

import {
  AvatarCircle,
  FilterBar,
  PillButton,
  StatusBadge,
  Thumbnail,
  VersionDrawer,
  type FilterProduct,
  type FilterStatus,
  type StatusBadgeStatus,
  type ThumbnailTone,
} from "@/components/dashboard";
import { Topbar } from "@/components/app/topbar";
import { formatRelativeTime } from "@/lib/generations/format";
import { useGenerations } from "@/lib/generations/store";
import { useNegocio } from "@/lib/negocio/store";
import { useUserInitials } from "@/lib/auth/use-user";
import { useProducts } from "@/lib/products/store";
import { useVersions } from "@/lib/versions/store";
import { isVersionReady } from "@/lib/validations/recorrido";
import {
  formatGenerationError,
  generateImages,
} from "@/lib/ai/image-generator";
import type { Version } from "@/lib/versions/store";
import type { Generation } from "@/lib/generations/store";
import type { Product } from "@/lib/products/store";
import {
  parseCuratedRef,
  type CuratedStyle,
} from "@/app/(app)/referencias/page";

/**
 * Fábrica — inbox de versiones según mock v2 `screen-fabrica.jsx`.
 *
 * Cambio respecto a la versión anterior: ya NO es un panel de "generar prompt".
 * Ahora es un grid filtrado de TODAS las versiones del usuario. Cada card
 * comunica producto padre + estilo curado (dot de color) + estado + ratio.
 * Click → abre `<VersionDrawer>`.
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
  const negocio = useNegocio();
  const brandInitials = useUserInitials();
  const router = useRouter();
  const searchParams = useSearchParams();

  const allHydrated =
    products.hydrated &&
    versions.hydrated &&
    generations.hydrated &&
    negocio.hydrated;

  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterProductId, setFilterProductId] = useState<FilterProduct>("all");
  const [openVersionId, setOpenVersionId] = useState<string | null>(null);
  // Banner de error a tope de la página cuando el handler de generación falla
  // (sin API key, key inválida, rate-limit, etc). Lo limpiamos al cerrar el
  // drawer o al reintentar exitosamente.
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  // Lock para evitar dobles clicks mientras una generación está en curso.
  // El status `processing` del store ya filtra a nivel store, pero deshabilitar
  // el botón visualmente es responsabilidad nuestra.
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Deep-link: la vista de versión redirige acá con `?open=<versionId>` después
  // de generar la primera tanda. Abrimos el drawer y limpiamos el query param
  // para que no quede pegado al historial.
  //
  // Esperamos `allHydrated` antes de validar el id para no abrir un drawer con
  // una versión que todavía no se cargó del localStorage. Si el id no matchea
  // nada (caso edge), simplemente limpiamos el query y no abrimos nada.
  useEffect(() => {
    if (!allHydrated) return;
    const openParam = searchParams.get("open");
    if (!openParam) return;
    const exists = versions.getById(openParam);
    if (exists) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- deep-link desde `/fabrica?open=…`: sincronizamos un query param con state local. Es un caso legítimo de "subscribe external -> setState".
      setOpenVersionId(openParam);
    }
    router.replace("/fabrica");
    // `versions` no va al array de deps: queremos correr esto SOLO cuando
    // cambia el query param o se completa la hidratación inicial. El store
    // ya está hidratado cuando entramos a este efecto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allHydrated, searchParams, router]);

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

  // Drawer state derivado.
  const openVersion = openVersionId
    ? (versions.getById(openVersionId) ?? null)
    : null;
  const openProduct = openVersion
    ? (products.getById(openVersion.product_id) ?? null)
    : null;
  const openGenerations = useMemo(
    () => (openVersionId ? generations.getByVersionId(openVersionId) : []),
    [openVersionId, generations],
  );
  const openImages = useMemo(() => {
    if (openGenerations.length === 0) return [];
    const genIds = new Set(openGenerations.map((g) => g.id));
    return generations.state.images.filter((img) =>
      genIds.has(img.generation_id),
    );
  }, [openGenerations, generations.state.images]);

  function handleDrawerOpenChange(open: boolean) {
    if (!open) setOpenVersionId(null);
  }

  function handleDuplicate() {
    if (!openVersion) return;
    const copy = versions.duplicateVersion(openVersion.id);
    if (copy) {
      // Cerrar el modal actual y abrir el de la copia recién creada.
      setOpenVersionId(copy.id);
    }
  }

  async function handleGenerateMore() {
    if (!openVersion) return;
    if (!isVersionReady(openVersion)) return;
    if (isSubmitting) return;
    const product = products.getById(openVersion.product_id);
    if (!product) return;

    // Guard de API key: sin key validada NO seguimos al store. Preferimos
    // banner explícito a un fallback mock confuso. El componente
    // `<ApiKeyBanner>` agrega un CTA a /mi-negocio.
    if (!negocio.state.apiKey || !negocio.state.apiKeyValidated) {
      setErrorBanner("missing_key");
      return;
    }

    setErrorBanner(null);
    setIsSubmitting(true);

    const created = generations.createGeneration({
      project_id: product.id,
      version_id: openVersion.id,
      product_images: product.product_images,
      reference_images: openVersion.reference_images,
      output_ratio: openVersion.output_ratio,
      variations_requested: openVersion.variations_default,
      user_prompt: openVersion.user_prompt,
    });
    generations.markProcessing(created.id);

    try {
      const result = await generateImages({
        apiKey: negocio.state.apiKey,
        product,
        version: openVersion,
      });
      if (result.ok) {
        generations.attachImages(created.id, result.images);
        generations.markCompleted(created.id);
      } else {
        const message = formatGenerationError(result.error);
        generations.markFailed(created.id, message);
        setErrorBanner(message);
      }
    } catch (err) {
      // Catch-all defensivo: `generateImages` no debería throw, pero si algo
      // explota en `imagesToParts` lo cubrimos.
      const message =
        err instanceof Error ? err.message : "Error desconocido al generar.";
      generations.markFailed(created.id, message);
      setErrorBanner(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!allHydrated) {
    return <FabricaSkeleton />;
  }

  const totalVersions = versions.state.versions.length;
  const hasAnyVersions = totalVersions > 0;
  const hasFilteredResults = filteredVersions.length > 0;

  return (
    <>
      <Topbar
        title="Fábrica"
        subtitle="Tus versiones en marcha y entregadas."
        right={<AvatarCircle initials={brandInitials} size={40} />}
      />

      <div className="flex flex-1 flex-col gap-5 px-5 pb-8 pt-2 sm:px-8 lg:px-10">
        {errorBanner ? (
          <ErrorBanner
            message={errorBanner}
            onDismiss={() => setErrorBanner(null)}
          />
        ) : null}
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
                    onOpen={() => setOpenVersionId(v.id)}
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

      <VersionDrawer
        open={openVersion !== null}
        onOpenChange={handleDrawerOpenChange}
        version={openVersion}
        product={openProduct}
        generations={openGenerations}
        images={openImages}
        onGenerateMore={handleGenerateMore}
        onDuplicate={handleDuplicate}
      />
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
  // Buscamos el estilo curado entre las referencias para el dot de color.
  const curated = pickCuratedStyle(version.reference_images);
  // Buscamos la primera imagen generada — la usamos como cover si existe.
  const firstImageUrl = useMemo(() => {
    for (const gen of versionGens) {
      if (gen.status !== "completed") continue;
      const img = images.find((i) => i.generation_id === gen.id);
      if (img) return img.image_url;
    }
    return undefined;
  }, [versionGens, images]);

  const latestGen = versionGens[0];
  const lastActivity = latestGen
    ? formatRelativeTime(latestGen.created_at)
    : null;

  const generationsCount = versionGens.length;
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
      {/* Hero — color del estilo curado o thumbnail tinteado. */}
      <div
        className="relative overflow-hidden"
        style={{
          aspectRatio: "5 / 3",
          backgroundColor: curated?.color ?? undefined,
        }}
      >
        {firstImageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={firstImageUrl}
            alt={version.name}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : curated ? (
          <CuratedHero curated={curated} />
        ) : (
          <Thumbnail tone={toneFromVersion(version.id)} radius={0} />
        )}

        {/* Status pill + ratio chip. */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-3 pt-3">
          <StatusBadge status={status} size="sm" />
          <span className="rounded-md bg-[rgba(15,31,22,0.78)] px-2 py-[3px] font-mono text-[10.5px] font-bold tracking-[0.4px] text-pill-fg">
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
          {curated ? (
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{
                  backgroundColor: curated.color,
                  boxShadow: "inset 0 0 0 1px rgba(15,31,22,0.08)",
                }}
              />
              <span className="font-semibold text-ink-soft">{curated.label}</span>
            </span>
          ) : null}
          {curated ? <span aria-hidden className="h-[3px] w-[3px] rounded-sm bg-mute" /> : null}
          <span>
            <span className="font-semibold text-ink-soft">{refsCount}</span>{" "}
            {refsCount === 1 ? "ref" : "refs"}
          </span>
          <span aria-hidden className="h-[3px] w-[3px] rounded-sm bg-mute" />
          <span>
            <span className="font-semibold text-ink-soft">
              {generationsCount}
            </span>{" "}
            {generationsCount === 1 ? "gen" : "gens"}
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

function CuratedHero({ curated }: { curated: CuratedStyle }) {
  const fg = curated.textOn === "white" ? "#FFFFFF" : "#1B1B1B";
  return (
    <>
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 22% 18%, rgba(255,255,255,0.20) 0%, transparent 55%), linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.12) 100%)",
        }}
      />
      <span
        aria-hidden
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage: `repeating-linear-gradient(45deg, ${fg}, ${fg} 1px, transparent 1px, transparent 14px)`,
        }}
      />
    </>
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

/**
 * Busca el primer estilo curado dentro del array de refs. Si hay varias refs
 * curadas, gana la primera (orden de selección). Si no hay ninguno, null.
 */
function pickCuratedStyle(refs: string[]): CuratedStyle | null {
  for (const ref of refs) {
    const parsed = parseCuratedRef(ref);
    if (parsed) return parsed;
  }
  return null;
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

/* -------------------------------------------------------------------------- */
/*  ErrorBanner                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Banner inline rojo para errores de generación. Si el mensaje es el sentinel
 * `"missing_key"` mostramos copy específico + CTA a Mi Negocio; cualquier otra
 * cadena se renderiza tal cual (ya viene formateada por `formatGenerationError`).
 */
function ErrorBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  const isMissingKey = message === "missing_key";
  const displayMessage = isMissingKey
    ? "Para generar imágenes reales, configurá tu API key de Gemini en Mi Negocio."
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
