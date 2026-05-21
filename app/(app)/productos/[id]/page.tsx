"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ImagePlus, Plus, X } from "lucide-react";
import { HeroCTAButton, PillButton, VersionCard } from "@/components/dashboard";
import { ImageUploader, type UploadedImage } from "@/components/fabrica";
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
import { useProducts } from "@/lib/products/store";
import { useRecorrido } from "@/lib/recorrido/store";
import { useVersions } from "@/lib/versions/store";

/**
 * Detalle de producto — header con CTA "Editar" + sección de fotos del producto
 * (galería + uploader) + hero CTA "+ Nueva Versión" (abre modal) + lista
 * vertical de versiones (`VersionCard`).
 *
 * Las generaciones ya no cuelgan del producto: viven adentro de cada versión.
 * Por eso en este detalle mostramos versiones, no generaciones sueltas.
 */
export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const products = useProducts();
  const versions = useVersions();
  const generations = useGenerations();
  const recorrido = useRecorrido();

  const id = params.id;
  const allHydrated =
    products.hydrated && versions.hydrated && generations.hydrated;
  const product = id ? products.getById(id) : undefined;

  const [modalOpen, setModalOpen] = useState(false);

  // Si después de hidratar el producto no existe, volver al catálogo.
  useEffect(() => {
    if (!allHydrated) return;
    if (!product) {
      router.replace("/productos");
    }
  }, [allHydrated, product, router]);

  // Versiones del producto, ordenadas desc por updated_at (lo hace el store).
  const productVersions = useMemo(() => {
    if (!product) return [];
    return versions.getByProductId(product.id);
  }, [versions, product]);

  function handleOpenModal() {
    setModalOpen(true);
  }

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

  return (
    <div className="px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <DetailHeader product={product} />

        <ProductPhotosSection productId={product.id} />

        {/* Hero CTA — la acción dominante de la página. */}
        <section className="mt-8 flex justify-center sm:justify-start">
          <HeroCTAButton onClick={handleOpenModal} className="w-full sm:w-auto">
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
    </div>
  );
}

function DetailHeader({
  product,
}: {
  product: { id: string; name: string; description: string | null };
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <span className="eyebrow">PRODUCTO</span>
        <h1 className="mt-1 truncate text-2xl font-medium tracking-tight text-green-dark sm:text-3xl">
          {product.name}
        </h1>
        {product.description ? (
          <p className="mt-1 text-sm text-green-text">{product.description}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:justify-end">
        {/* TODO(frontend): crear `/productos/[id]/editar` para editar nombre/descripción. */}
        <Link
          href={`/productos/${product.id}/editar`}
          className="inline-flex min-h-[44px] items-center justify-center rounded-full px-3 py-2 text-sm text-green-text hover:text-green-dark"
        >
          Editar
        </Link>
      </div>
    </header>
  );
}

function ProductPhotosSection({ productId }: { productId: string }) {
  const products = useProducts();
  const product = products.getById(productId);
  // Uploader controlado para el caso "todavía no hay fotos": traducimos
  // product_images (string[]) ↔ UploadedImage[] por delta sobre el store.
  const [pending, setPending] = useState<UploadedImage[]>([]);

  if (!product) return null;

  function handleUploaderChange(next: UploadedImage[]) {
    if (!product) return;
    const before = new Set(pending.map((p) => p.previewUrl));
    const after = new Set(next.map((p) => p.previewUrl));
    const added = next.filter((p) => !before.has(p.previewUrl));
    if (added.length > 0) {
      products.addImagesToProduct(
        product.id,
        added.map((p) => p.previewUrl),
      );
    }
    for (const removed of pending) {
      if (!after.has(removed.previewUrl)) {
        products.removeImageFromProduct(product.id, removed.previewUrl);
      }
    }
    setPending(next);
  }

  const hasPhotos = product.product_images.length > 0;

  return (
    <section className="mt-8">
      <div className="glass-card flex flex-col gap-4 p-6 sm:p-7">
        <span className="eyebrow">FOTOS DEL PRODUCTO</span>
        {hasPhotos ? (
          <PhotosGrid
            productId={product.id}
            urls={product.product_images}
            onRemove={(url) =>
              products.removeImageFromProduct(product.id, url)
            }
            onAdd={(urls) => products.addImagesToProduct(product.id, urls)}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-green-text">
              Subí fotos para definir tu producto. Las usamos como base en cada
              nueva generación.
            </p>
            <ImageUploader
              multi
              max={10}
              value={pending}
              onChange={handleUploaderChange}
              hint="PNG, JPG o WebP. Hasta 10 fotos por producto."
            />
          </div>
        )}
      </div>
    </section>
  );
}

function PhotosGrid({
  productId,
  urls,
  onRemove,
  onAdd,
}: {
  productId: string;
  urls: string[];
  onRemove: (url: string) => void;
  onAdd: (urls: string[]) => void;
}) {
  const inputId = `add-photo-${productId}`;

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const created: string[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      created.push(URL.createObjectURL(file));
    }
    if (created.length > 0) onAdd(created);
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {urls.map((url) => (
        <div
          key={url}
          className="glass group relative aspect-square overflow-hidden rounded-2xl border border-white/60"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Foto del producto" className="h-full w-full object-cover" />
          <button
            type="button"
            onClick={() => onRemove(url)}
            aria-label="Quitar foto"
            className="absolute right-2 top-2 inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white shadow-md backdrop-blur-sm transition-all hover:bg-black/70 sm:h-9 sm:w-9"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}

      <label
        htmlFor={inputId}
        className="glass flex aspect-square min-h-[44px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/70 text-center transition-all hover:border-primary/40 hover:bg-white/70"
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
        <ImagePlus className="h-6 w-6 text-primary" />
        <span className="text-xs font-medium text-foreground">Sumar foto</span>
      </label>
    </div>
  );
}

function ProductVersionsSection({
  versions,
  generations,
}: {
  versions: ReturnType<typeof useVersions>["state"]["versions"];
  generations: ReturnType<typeof useGenerations>;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-medium text-green-dark">Versiones</h2>

      {versions.length === 0 ? (
        <div className="glass-card mt-4 flex flex-col items-center gap-3 p-8 text-center sm:p-10">
          <p className="max-w-sm text-sm text-green-text">
            Todavía no tenés versiones para este producto. Creá la primera para
            empezar.
          </p>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
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
            // Fallback: si no hay imágenes generadas todavía, mostramos la
            // primera referencia subida a la versión como cover.
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
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

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

  // Reset al cerrar el modal — así no quedan campos sucios la próxima vez.
  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetear los inputs cuando el dialog se cierra es un caso clásico de side-effect sobre estado UI local; no causa cascada porque sólo dispara cuando `open` pasa de true a false.
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
          <DialogTitle>Nueva versión</DialogTitle>
          <DialogDescription>
            Ponele un nombre y una descripción corta para identificarla.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="version-name"
              className="text-xs font-medium text-foreground"
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
              className="text-xs font-medium text-foreground"
            >
              Descripción <span className="text-muted-foreground">(opcional)</span>
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
                  className="inline-flex min-h-[44px] items-center justify-center rounded-full px-4 py-2 text-sm text-green-text hover:text-green-dark"
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

function DetailSkeleton() {
  return (
    <div className="px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2">
            <div className="h-3 w-20 animate-pulse rounded-full bg-white/30" />
            <div className="h-8 w-64 animate-pulse rounded-full bg-white/40" />
          </div>
          <div className="h-11 w-24 animate-pulse rounded-full bg-white/40" />
        </div>
        <div className="glass-card mt-8 h-44 animate-pulse" />
        <div className="mt-8 h-16 w-full animate-pulse rounded-2xl bg-white/40 sm:w-56" />
        <div className="mt-10 flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="glass-card-compact h-24 animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
