"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ImagePlus, Plus, X } from "lucide-react";

import {
  AvatarCircle,
  HeroCTAButton,
  PillButton,
  VersionCard,
} from "@/components/dashboard";
import { Topbar } from "@/components/app/topbar";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatRelativeTime } from "@/lib/generations/format";
import { useGenerations } from "@/lib/generations/store";
import { useNegocio } from "@/lib/negocio/store";
import { useProducts } from "@/lib/products/store";
import { useRecorrido } from "@/lib/recorrido/store";
import { useVersions } from "@/lib/versions/store";

/**
 * Detalle de producto — según mock v2 `screen-producto.jsx`.
 *
 * Estructura:
 *   <Topbar eyebrow="PRODUCTO" title subtitle right={CTA Nueva versión + Avatar}>
 *   Sección "Fotos del producto" — grid de thumbnails + "Sumar foto"
 *   HeroCTAButton "+ Nueva Versión" (acción dominante)
 *   Sección "Versiones" — h2 + lista de VersionCard
 *   Modal Nueva Versión (Dialog shadcn)
 */
export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const products = useProducts();
  const versions = useVersions();
  const generations = useGenerations();
  const recorrido = useRecorrido();
  const negocio = useNegocio();

  const id = params.id;
  const allHydrated =
    products.hydrated &&
    versions.hydrated &&
    generations.hydrated &&
    negocio.hydrated;
  const product = id ? products.getById(id) : undefined;

  const [modalOpen, setModalOpen] = useState(false);

  // Si después de hidratar el producto no existe, redirect al catálogo.
  useEffect(() => {
    if (!allHydrated) return;
    if (!product) {
      router.replace("/productos");
    }
  }, [allHydrated, product, router]);

  const productVersions = useMemo(() => {
    if (!product) return [];
    return versions.getByProductId(product.id);
  }, [versions, product]);

  function handleCreateVersion(name: string, description: string) {
    if (!product) return;
    const trimmedName = name.trim();
    if (trimmedName.length === 0) return;
    const trimmedDesc = description.trim();
    const created = versions.createVersion({
      product_id: product.id,
      name: trimmedName,
      description: trimmedDesc.length > 0 ? trimmedDesc : undefined,
    });
    recorrido.setState({ productId: product.id, versionId: created.id });
    setModalOpen(false);
    router.push("/referencias");
  }

  if (!allHydrated || !product) {
    return <DetailSkeleton />;
  }

  const brandInitials = pickInitials(negocio.state.brandName);

  return (
    <>
      <Topbar
        eyebrow="PRODUCTO"
        title={product.name}
        subtitle={product.description ?? "Tus fotos base + cada versión que creás encima."}
        right={
          <>
            <PillButton size="md" onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4" />
              Nueva versión
            </PillButton>
            <AvatarCircle initials={brandInitials} size={40} />
          </>
        }
      />

      <div className="flex flex-1 flex-col gap-6 px-5 pb-8 pt-2 sm:px-8 sm:gap-7 lg:px-10">
        <ProductPhotosSection productId={product.id} />

        {/* Hero CTA — acción dominante de la pantalla. */}
        <section className="flex">
          <HeroCTAButton onClick={() => setModalOpen(true)} className="w-full sm:w-auto">
            Nueva Versión
          </HeroCTAButton>
        </section>

        <ProductVersionsSection
          versions={productVersions}
          generations={generations}
        />
      </div>

      <NuevaVersionModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSubmit={handleCreateVersion}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Fotos del producto                                                         */
/* -------------------------------------------------------------------------- */

function ProductPhotosSection({ productId }: { productId: string }) {
  const products = useProducts();
  const product = products.getById(productId);

  if (!product) return null;

  function handleFiles(files: FileList | null) {
    if (!product) return;
    if (!files || files.length === 0) return;
    const created: string[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      created.push(URL.createObjectURL(file));
    }
    if (created.length > 0) products.addImagesToProduct(product.id, created);
  }

  const inputId = `add-photo-${productId}`;
  const urls = product.product_images;

  return (
    <section className="glass-card flex flex-col gap-3 p-5 sm:p-6">
      <span className="eyebrow">FOTOS DEL PRODUCTO</span>
      <p className="-mt-1 text-xs font-medium text-mute">
        Las usamos como base en cada nueva generación. Sumá tantas como
        quieras.
      </p>

      <div className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
        {urls.map((url) => (
          <div
            key={url}
            className="relative aspect-square overflow-hidden rounded-lg border border-border bg-card-cream/60"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt="Foto del producto"
              className="h-full w-full object-cover"
            />
            <button
              type="button"
              onClick={() => products.removeImageFromProduct(product.id, url)}
              aria-label="Quitar foto"
              className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[rgba(15,31,22,0.78)] text-white shadow-md transition-colors hover:bg-[rgba(15,31,22,0.92)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        <label
          htmlFor={inputId}
          className="flex aspect-square min-h-[44px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-foreground/15 bg-card-cream/50 text-center text-ink-soft transition-colors hover:border-foreground/30 hover:bg-card-cream"
        >
          <input
            id={inputId}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="sr-only"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <ImagePlus className="h-5 w-5" strokeWidth={1.6} />
          <span className="text-xs font-semibold">Sumar foto</span>
        </label>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Versiones                                                                  */
/* -------------------------------------------------------------------------- */

function ProductVersionsSection({
  versions,
  generations,
}: {
  versions: ReturnType<typeof useVersions>["state"]["versions"];
  generations: ReturnType<typeof useGenerations>;
}) {
  const versionsStore = useVersions();
  const router = useRouter();

  function handleDuplicate(versionId: string) {
    const copy = versionsStore.duplicateVersion(versionId);
    if (copy) {
      // La copia es una versión existente con su receta lista — la abrimos
      // directo en la Fábrica para que el usuario vea variaciones inline.
      router.push(`/fabrica?open=${copy.id}`);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-[22px] italic leading-tight text-foreground">
        Versiones
      </h2>

      {versions.length === 0 ? (
        <div className="glass-card flex flex-col items-center gap-2 p-7 text-center">
          <p className="max-w-sm text-sm text-mute">
            Todavía no tenés versiones para este producto. Creá la primera para
            empezar.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {versions.map((version) => {
            const versionGens = generations.getByVersionId(version.id);
            const completedWithImage = versionGens.find(
              (g) =>
                g.status === "completed" &&
                generations.state.images.some(
                  (img) => img.generation_id === g.id,
                ),
            );
            const firstImage = completedWithImage
              ? generations.state.images.find(
                  (img) => img.generation_id === completedWithImage.id,
                )?.image_url
              : undefined;
            const thumbnailUrl =
              firstImage ?? version.reference_images[0] ?? undefined;
            const latestGen = versionGens[0];
            const lastActivity = latestGen
              ? formatRelativeTime(latestGen.created_at)
              : null;

            return (
              <VersionCard
                key={version.id}
                id={version.id}
                name={version.name}
                description={version.description}
                referencesCount={version.reference_images.length}
                generationsCount={versionGens.length}
                lastActivity={lastActivity}
                ratio={version.output_ratio}
                href={`/productos/${version.product_id}/versiones/${version.id}`}
                thumbnailUrl={thumbnailUrl}
                onDuplicate={() => handleDuplicate(version.id)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Modal Nueva Versión                                                        */
/* -------------------------------------------------------------------------- */

function NuevaVersionModal({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string, description: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  // Reset cuando se cierra — no dejamos campos sucios entre aperturas.
  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetear inputs cuando el dialog se cierra es un side-effect UI local sin cascada.
      setName("");
      setDescription("");
    }
  }, [open]);

  const trimmedName = name.trim();
  const disabled = trimmedName.length === 0;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    onSubmit(name, description);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl italic">
            Nueva versión
          </DialogTitle>
          <DialogDescription>
            Ponele un nombre y una descripción corta para identificarla.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="version-name"
              className="text-xs font-semibold text-foreground"
            >
              Nombre
            </label>
            <Input
              id="version-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="Día de la Madre"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="version-description"
              className="text-xs font-semibold text-foreground"
            >
              Descripción <span className="font-medium text-mute">(opcional)</span>
            </label>
            <Textarea
              id="version-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              placeholder="Campaña sentimental para mayo"
              rows={3}
            />
          </div>
          <div className="mt-2 flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:justify-end">
            <DialogClose
              render={
                <button
                  type="button"
                  className="inline-flex min-h-[44px] items-center justify-center rounded-full px-4 py-2 text-sm font-medium text-mute hover:text-foreground"
                >
                  Cancelar
                </button>
              }
            />
            <PillButton size="md" disabled={disabled} type="submit">
              <Plus className="h-4 w-4" />
              Crear y empezar
            </PillButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/*  Skeleton                                                                   */
/* -------------------------------------------------------------------------- */

function DetailSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-6 px-5 py-6 sm:px-8 sm:py-8 lg:px-10">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="h-3 w-20 animate-pulse rounded-full bg-foreground/10" />
          <div className="h-9 w-64 animate-pulse rounded-full bg-foreground/10" />
          <div className="h-4 w-48 animate-pulse rounded-full bg-foreground/5" />
        </div>
        <div className="h-11 w-44 animate-pulse rounded-full bg-foreground/10" />
      </div>
      <div className="h-44 animate-pulse rounded-xl bg-foreground/5" />
      <div className="h-16 w-full animate-pulse rounded-2xl bg-foreground/5 sm:w-56" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-foreground/5" />
        ))}
      </div>
    </div>
  );
}

function pickInitials(brandName: string): string {
  const clean = brandName.trim();
  if (!clean) return "N";
  return clean.slice(0, 2).toUpperCase();
}
