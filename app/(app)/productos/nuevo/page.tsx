"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import { PillButton } from "@/components/dashboard";
import { ImageUploader, type UploadedImage } from "@/components/fabrica";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useProducts } from "@/lib/products/store";

/**
 * Form de creación de producto. Validación con Zod inline — solo lo mínimo:
 * nombre obligatorio (1-60), descripción opcional (≤200), fotos opcionales
 * con preview vía object URL.
 */
const productSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Ponele un nombre a tu producto")
    .max(60, "Máximo 60 caracteres"),
  description: z
    .string()
    .trim()
    .max(200, "Máximo 200 caracteres")
    .optional()
    .or(z.literal("")),
});

type FormErrors = Partial<Record<"name" | "description", string>>;

export default function NuevoProductoPage() {
  const router = useRouter();
  const products = useProducts();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<UploadedImage[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && !submitting;

  function handleCreate() {
    const parsed = productSchema.safeParse({
      name,
      description,
    });
    if (!parsed.success) {
      const nextErrors: FormErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "name" || key === "description") {
          nextErrors[key] = issue.message;
        }
      }
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    setErrors({});
    const created = products.addProduct({
      name: parsed.data.name,
      description: parsed.data.description
        ? parsed.data.description
        : undefined,
      product_images: photos.map((p) => p.previewUrl),
    });
    router.push(`/productos/${created.id}`);
  }

  return (
    <div className="px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-2xl">
        <div className="glass-card flex flex-col gap-6 p-6 sm:p-8">
          <header>
            <span className="eyebrow">NUEVO PRODUCTO</span>
            <h1 className="mt-1 text-2xl font-medium tracking-tight text-green-dark sm:text-3xl">
              Creá un producto
            </h1>
            <p className="mt-1 text-sm text-green-text">
              Lo vas a poder reutilizar para generar imágenes nuevas en
              cualquier momento.
            </p>
          </header>

          <div className="flex flex-col gap-2">
            <Label htmlFor="product-name">Nombre</Label>
            <Input
              id="product-name"
              type="text"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Perfume floral primavera"
              aria-invalid={Boolean(errors.name)}
              className="h-11 px-3 text-sm"
            />
            <div className="flex items-center justify-between gap-2 text-xs">
              {errors.name ? (
                <span role="alert" className="text-destructive">
                  {errors.name}
                </span>
              ) : (
                <span className="text-muted-foreground">Hasta 60 caracteres.</span>
              )}
              <span className="font-mono text-muted-foreground">
                {trimmedName.length}/60
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="product-description">Descripción corta</Label>
            <Textarea
              id="product-description"
              value={description}
              maxLength={200}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: Línea cápsula con notas de jazmín y bergamota."
              className="min-h-[100px]"
              aria-invalid={Boolean(errors.description)}
            />
            <div className="flex items-center justify-between gap-2 text-xs">
              {errors.description ? (
                <span role="alert" className="text-destructive">
                  {errors.description}
                </span>
              ) : (
                <span className="text-muted-foreground">Opcional.</span>
              )}
              <span className="font-mono text-muted-foreground">
                {description.trim().length}/200
              </span>
            </div>
          </div>

          <div data-tour="product-photo" className="flex flex-col gap-2">
            <ImageUploader
              multi
              max={5}
              value={photos}
              onChange={setPhotos}
              label="Fotos del producto"
              hint="Hasta 5 fotos. Las usamos como base de cada generación."
            />
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <Link
              href="/productos"
              className="inline-flex min-h-[44px] items-center justify-center rounded-full px-4 py-2 text-sm text-green-text hover:text-green-dark"
            >
              Cancelar
            </Link>
            <PillButton
              size="md"
              onClick={handleCreate}
              disabled={!canSubmit}
            >
              Crear producto
            </PillButton>
          </div>
        </div>
      </div>
    </div>
  );
}
