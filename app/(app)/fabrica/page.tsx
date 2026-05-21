"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { Edit3, Factory, Plus, RefreshCw } from "lucide-react";

import {
  FilterBar,
  PillButton,
  VersionCard,
  VersionDrawer,
  type FilterProduct,
  type FilterStatus,
} from "@/components/dashboard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/generations/format";
import { useGenerations } from "@/lib/generations/store";
import { useProducts } from "@/lib/products/store";
import { useRecorrido } from "@/lib/recorrido/store";
import { useVersions } from "@/lib/versions/store";
import { buildPromptFromBrief } from "@/lib/recorrido/build-prompt";
import { isVersionReady } from "@/lib/validations/recorrido";
import type { Version } from "@/lib/versions/store";
import type { Generation } from "@/lib/generations/store";

/**
 * La Fábrica — hub central del trabajo creativo.
 *
 * El comportamiento viejo (caso A: editor de prompt en línea / caso B: picker)
 * desaparece. Ahora es un único grid filtrado de TODAS las versiones del
 * usuario. Cada card abre un drawer lateral (`VersionDrawer`) que muestra
 * generaciones, refs, config y prompt sin perder el contexto del grid.
 *
 * Las acciones "editar prompt" se hacen inline en un Dialog local (sin
 * cambiar de ruta). "Editar referencias" y "Editar configuración" sí navegan
 * a `/referencias` y `/formato` con la versión activa seteada en el recorrido.
 *
 * El generar sigue siendo mock: 2s de delay, placeholder SVG con gradient.
 * Se reemplaza con la llamada real cuando conectemos Gemini.
 */
export default function FabricaPage() {
  const products = useProducts();
  const versions = useVersions();
  const generations = useGenerations();
  const recorrido = useRecorrido();
  const router = useRouter();

  const allHydrated =
    products.hydrated && versions.hydrated && generations.hydrated;

  // Estado local — filtros + versión abierta en el drawer + dialog de prompt.
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterProductId, setFilterProductId] = useState<FilterProduct>("all");
  const [openVersionId, setOpenVersionId] = useState<string | null>(null);
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);

  // Para evitar que el setTimeout del mock dispare después del unmount —
  // limpiamos en el cleanup. (En caso de que el usuario navegue mientras
  // está "generando".)
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers) clearTimeout(t);
      timers.clear();
    };
  }, []);

  // Computamos el "estado efectivo" de cada versión a partir de sus
  // generations. Sin generations → 'draft'. Si tiene alguna processing/pending
  // → 'processing'. Si tiene alguna completed → 'completed' (gana sobre
  // 'failed' viejas: si ya hubo al menos una buena, es una versión "lista").
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
      const hasProcessing = gens.some(
        (g) => g.status === "processing" || g.status === "pending",
      );
      if (hasProcessing) {
        map.set(v.id, "processing");
        continue;
      }
      const hasCompleted = gens.some((g) => g.status === "completed");
      if (hasCompleted) {
        map.set(v.id, "completed");
        continue;
      }
      // Sólo failed/no-imágenes: lo tratamos como draft para que el filtro
      // "Sin generar" lo incluya — el usuario tiene que volver a generar.
      map.set(v.id, "draft");
    }
    return map;
  }, [versions.state.versions, generations.state.generations]);

  // Lista filtrada de versiones, ordenada por updated_at desc.
  const filteredVersions = useMemo(() => {
    const sorted = [...versions.state.versions].sort((a, b) =>
      a.updated_at < b.updated_at ? 1 : -1,
    );
    return sorted.filter((v) => {
      if (filterProductId !== "all" && v.product_id !== filterProductId)
        return false;
      if (filterStatus === "all") return true;
      return effectiveStatus.get(v.id) === filterStatus;
    });
  }, [
    versions.state.versions,
    effectiveStatus,
    filterProductId,
    filterStatus,
  ]);

  const filteredProductOptions = useMemo(
    () =>
      products.state.products.map((p) => ({ id: p.id, name: p.name })),
    [products.state.products],
  );

  // Resolución de la versión abierta + sus datos para el drawer.
  // Si la versión deja de existir (p. ej. se elimina), `openVersion` cae a
  // `null` y el drawer se cierra automáticamente sin necesidad de un effect
  // con setState — el `open` derivado se vuelve false en el próximo render.
  const openVersion = openVersionId
    ? (versions.getById(openVersionId) ?? null)
    : null;
  const openProduct = openVersion
    ? (products.getById(openVersion.product_id) ?? null)
    : null;
  const openGenerations = useMemo(
    () =>
      openVersionId ? generations.getByVersionId(openVersionId) : [],
    [openVersionId, generations],
  );
  const openImages = useMemo(() => {
    if (openGenerations.length === 0) return [];
    const genIds = new Set(openGenerations.map((g) => g.id));
    return generations.state.images.filter((img) =>
      genIds.has(img.generation_id),
    );
  }, [openGenerations, generations.state.images]);

  // Índice de la versión abierta dentro del grid filtrado — para prev/next.
  const openIndex = openVersionId
    ? filteredVersions.findIndex((v) => v.id === openVersionId)
    : -1;
  const hasPrev = openIndex > 0;
  const hasNext = openIndex >= 0 && openIndex < filteredVersions.length - 1;

  function handleOpenVersion(id: string) {
    setOpenVersionId(id);
  }

  function handleDrawerOpenChange(open: boolean) {
    if (!open) {
      setOpenVersionId(null);
      setPromptDialogOpen(false);
    }
  }

  function handlePrevVersion() {
    if (!hasPrev) return;
    setOpenVersionId(filteredVersions[openIndex - 1].id);
  }

  function handleNextVersion() {
    if (!hasNext) return;
    setOpenVersionId(filteredVersions[openIndex + 1].id);
  }

  function handleEditReferences() {
    if (!openVersion) return;
    recorrido.setState({
      productId: openVersion.product_id,
      versionId: openVersion.id,
    });
    router.push("/referencias");
  }

  function handleEditConfig() {
    if (!openVersion) return;
    recorrido.setState({
      productId: openVersion.product_id,
      versionId: openVersion.id,
    });
    router.push("/formato");
  }

  function handleEditPrompt() {
    // Abrimos Dialog inline — NO navegamos. El drawer queda abierto detrás.
    setPromptDialogOpen(true);
  }

  function handleGenerateMore() {
    if (!openVersion) return;
    if (!isVersionReady(openVersion)) return;
    const product = products.getById(openVersion.product_id);
    if (!product) return;

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

    // TODO: reemplazar con Gemini real cuando conectemos el backend.
    const versionName = openVersion.name;
    const variations = openVersion.variations_default;
    const timer = setTimeout(() => {
      const placeholderUrls = Array.from({ length: variations }, (_, idx) =>
        buildPlaceholderImage(idx, versionName),
      );
      generations.attachImages(created.id, placeholderUrls);
      generations.markCompleted(created.id);
      timersRef.current.delete(timer);
    }, 2000);
    timersRef.current.add(timer);
  }

  function handleResetFilters() {
    setFilterStatus("all");
    setFilterProductId("all");
  }

  if (!allHydrated) {
    return <FabricaSkeleton />;
  }

  const totalVersions = versions.state.versions.length;
  const hasAnyVersions = totalVersions > 0;
  const hasFilteredResults = filteredVersions.length > 0;

  return (
    <div className="px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-medium tracking-tight text-green-dark sm:text-3xl">
            Fábrica
          </h1>
          <p className="text-sm text-green-text">
            El centro creativo: todas tus versiones en un lugar.
          </p>
        </header>

        {hasAnyVersions ? (
          <>
            <div className="mt-6">
              <FilterBar
                status={filterStatus}
                onStatusChange={setFilterStatus}
                productId={filterProductId}
                onProductChange={setFilterProductId}
                products={filteredProductOptions}
                total={filteredVersions.length}
              />
            </div>

            {hasFilteredResults ? (
              <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredVersions.map((v) => (
                  <VersionCardButton
                    key={v.id}
                    version={v}
                    product={products.getById(v.product_id) ?? null}
                    generations={generations.state.generations.filter(
                      (g) => g.version_id === v.id,
                    )}
                    onOpen={() => handleOpenVersion(v.id)}
                    firstImageUrl={pickThumbnailUrl(
                      v,
                      generations.state.generations,
                      generations.state.images,
                    )}
                  />
                ))}
              </section>
            ) : (
              <FilteredEmptyState onReset={handleResetFilters} />
            )}
          </>
        ) : (
          <EmptyState />
        )}
      </div>

      {/* Drawer lateral — se monta cuando hay versión abierta. */}
      <VersionDrawer
        open={openVersion !== null}
        onOpenChange={handleDrawerOpenChange}
        version={openVersion}
        product={openProduct}
        generations={openGenerations}
        images={openImages}
        onEditReferences={handleEditReferences}
        onEditConfig={handleEditConfig}
        onEditPrompt={handleEditPrompt}
        onGenerateMore={handleGenerateMore}
        onPrevVersion={hasPrev ? handlePrevVersion : undefined}
        onNextVersion={hasNext ? handleNextVersion : undefined}
      />

      {/* Dialog inline — edición de prompt sin perder el drawer. */}
      <EditPromptDialog
        open={promptDialogOpen}
        onOpenChange={setPromptDialogOpen}
        version={openVersion}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Card — versión clickeable. Visualmente equivalente al `VersionCard`        */
/*  pero envuelta en <button> en vez de <Link> para abrir el drawer.            */
/* -------------------------------------------------------------------------- */

type VersionCardButtonProps = {
  version: Version;
  product: { name: string } | null;
  generations: Generation[];
  firstImageUrl?: string;
  onOpen: () => void;
};

function VersionCardButton({
  version,
  product,
  generations: versionGens,
  firstImageUrl,
  onOpen,
}: VersionCardButtonProps) {
  // Interceptamos el `<Link>` interno del VersionCard con un onClick que
  // hace preventDefault — así reusamos el styling sin duplicar markup.
  // `href` queda como fallback semántico (deep link al detalle de la versión)
  // si JS está deshabilitado o el handler falla.
  const latestGen = versionGens[0];
  const lastActivity = latestGen
    ? formatRelativeTime(latestGen.created_at)
    : null;

  const productLabel = product?.name ?? "Sin producto";
  const description = version.description ?? productLabel;

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    // Ignoramos clicks de teclas modificadoras (ctrl/cmd-click = abrir en
    // pestaña nueva) — dejamos que el Link nativo del VersionCard se encargue.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onOpen();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
  }

  return (
    <div
      role="button"
      tabIndex={-1}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="cursor-pointer rounded-[20px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-dark/40"
    >
      <VersionCard
        id={version.id}
        name={version.name}
        description={description}
        referencesCount={version.reference_images.length}
        generationsCount={versionGens.length}
        lastActivity={lastActivity}
        ratio={version.output_ratio}
        href={`/productos/${version.product_id}/versiones/${version.id}`}
        thumbnailUrl={firstImageUrl}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Edit Prompt Dialog — edición inline del prompt sin navegar.                */
/* -------------------------------------------------------------------------- */

function EditPromptDialog({
  open,
  onOpenChange,
  version,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version: Version | null;
}) {
  const versions = useVersions();
  const [draft, setDraft] = useState("");

  // Sync del draft cuando se abre el dialog o cambia la versión.
  useEffect(() => {
    if (!version) return;
    if (open) {
      const built =
        version.user_prompt.trim().length > 0
          ? version.user_prompt
          : buildPromptFromBrief(version);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- el dialog se abre desde el parent; sincronizamos el draft con la versión activa.
      setDraft(built);
    }
  }, [open, version]);

  function handleSave() {
    if (!version) return;
    versions.updateVersion(version.id, { user_prompt: draft });
    onOpenChange(false);
  }

  function handleRebuild() {
    if (!version) return;
    const blank = { ...version, user_prompt: "" };
    setDraft(buildPromptFromBrief(blank));
  }

  if (!version) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar prompt</DialogTitle>
          <DialogDescription>
            Ajustá las instrucciones que recibe el director de arte para{" "}
            <strong className="text-green-dark">{version.name}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="eyebrow">PROMPT</span>
            <button
              type="button"
              onClick={handleRebuild}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-green-text hover:text-green-dark"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Regenerar desde brief
            </button>
          </div>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={8}
            className="min-h-40"
            placeholder="Describí qué querés generar…"
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={handleSave}>
            <Edit3 className="h-4 w-4" />
            Guardar prompt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*  Empty states                                                               */
/* -------------------------------------------------------------------------- */

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="glass-card mt-8 flex flex-col items-center gap-4 p-8 text-center sm:p-12"
    >
      <div
        aria-hidden
        className="flex h-14 w-14 items-center justify-center rounded-full bg-green-dark/8 text-green-dark"
      >
        <Factory className="h-6 w-6" />
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium text-green-dark sm:text-xl">
          Todavía no creaste versiones
        </h2>
        <p className="mx-auto max-w-md text-sm text-green-text">
          Andá al catálogo y elegí un producto para empezar tu primera versión.
        </p>
      </div>
      <PillButton size="md" asChild>
        <Link href="/productos">
          <Plus className="h-4 w-4" />
          Ir al catálogo
        </Link>
      </PillButton>
    </motion.div>
  );
}

function FilteredEmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="glass-card-compact mt-6 flex flex-col items-center gap-3 px-5 py-10 text-center">
      <p className="text-sm text-green-text">
        Ningún resultado con esos filtros.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-white/70 bg-white/60 px-4 py-2 text-[13px] font-medium text-green-dark transition-colors hover:bg-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-dark/40"
      >
        Limpiar filtros
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Skeleton mientras hidrata                                                  */
/* -------------------------------------------------------------------------- */

function FabricaSkeleton() {
  return (
    <div className="px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <div className="h-8 w-48 animate-pulse rounded-full bg-white/40" />
        <div className="mt-2 h-4 w-80 animate-pulse rounded-full bg-white/30" />
        <div className="mt-6 h-16 w-full animate-pulse rounded-[20px] bg-white/40" />
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="h-[112px] animate-pulse rounded-[20px] bg-white/40"
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Para el thumbnail de cada VersionCard: si la versión tiene al menos una
 * generation completed con imágenes, usamos la primera. Si no, caemos a la
 * primera referencia. Si tampoco hay refs, devolvemos undefined y la card
 * pinta el placeholder verde por default.
 */
function pickThumbnailUrl(
  version: Version,
  allGenerations: Generation[],
  allImages: { generation_id: string; image_url: string }[],
): string | undefined {
  const versionGens = allGenerations.filter((g) => g.version_id === version.id);
  for (const gen of versionGens) {
    if (gen.status !== "completed") continue;
    const img = allImages.find((i) => i.generation_id === gen.id);
    if (img) return img.image_url;
  }
  return version.reference_images[0];
}

/**
 * Placeholder visual para las "imágenes generadas" del mock: gradient + label
 * con el nombre de la versión y el índice de la variación. Cuando conectemos
 * Gemini, este helper desaparece.
 */
function buildPlaceholderImage(index: number, versionName: string): string {
  const palettes = [
    { from: "#C56A4A", to: "#7B3F2A" },
    { from: "#7B8A4F", to: "#4A552E" },
    { from: "#D4A33B", to: "#8C6A1F" },
    { from: "#1F3B5B", to: "#0D1B2C" },
    { from: "#F4C2C2", to: "#D38B8B" },
    { from: "#A8D5BA", to: "#5BAE85" },
    { from: "#F1E2C4", to: "#C9A968" },
    { from: "#2B2A28", to: "#0A0A0A" },
  ];
  const palette = palettes[index % palettes.length];
  const safeName = versionName.replace(/[<>&"]/g, "");
  const label = `${safeName} · ${index + 1}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${palette.from}"/><stop offset="1" stop-color="${palette.to}"/></linearGradient></defs><rect width="600" height="600" fill="url(#g)"/><text x="300" y="320" font-family="system-ui,sans-serif" font-size="28" fill="#fff" text-anchor="middle" opacity="0.95">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
