"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Upload, X, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { buttonVariants } from "@/components/ui/button";
import { OUTPUT_RATIOS, MAX_PRODUCT_IMAGES, MAX_REFERENCE_IMAGES } from "@/lib/constants";
import { cn } from "@/lib/utils";

// Galería starter mock — TODO: cargar desde Supabase starter_references
const STARTER_REFERENCES = [
  { id: "lifestyle-1", category: "Lifestyle" },
  { id: "lifestyle-2", category: "Lifestyle" },
  { id: "flatlay-1", category: "Flat lay" },
  { id: "flatlay-2", category: "Flat lay" },
  { id: "editorial-1", category: "Editorial" },
  { id: "editorial-2", category: "Editorial" },
];

export default function StudioPage() {
  const router = useRouter();
  const [productImages, setProductImages] = useState<string[]>([]);
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [ratio, setRatio] = useState<string>("1:1");
  const [userPrompt, setUserPrompt] = useState("");
  const [variations, setVariations] = useState(5);
  const [submitting, setSubmitting] = useState(false);

  function handleProductUpload(files: FileList | null) {
    if (!files) return;
    const remaining = MAX_PRODUCT_IMAGES - productImages.length;
    const newUrls = Array.from(files)
      .slice(0, remaining)
      .map((f) => URL.createObjectURL(f));
    setProductImages((prev) => [...prev, ...newUrls]);
  }

  function handleReferenceUpload(files: FileList | null) {
    if (!files) return;
    const remaining = MAX_REFERENCE_IMAGES - referenceImages.length;
    const newUrls = Array.from(files)
      .slice(0, remaining)
      .map((f) => URL.createObjectURL(f));
    setReferenceImages((prev) => [...prev, ...newUrls]);
  }

  function toggleStarter(id: string) {
    if (referenceImages.includes(id)) {
      setReferenceImages((prev) => prev.filter((x) => x !== id));
      return;
    }
    if (referenceImages.length >= MAX_REFERENCE_IMAGES) return;
    setReferenceImages((prev) => [...prev, id]);
  }

  const canGenerate =
    productImages.length > 0 && referenceImages.length > 0 && !submitting;

  async function generate() {
    setSubmitting(true);
    // TODO: reemplazar con upload a Supabase Storage + POST /api/generations real
    const res = await fetch("/api/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productImages: productImages.map((_, i) => `mock://product/${i}`),
        referenceImages: referenceImages.map((_, i) => `mock://ref/${i}`),
        ratio,
        userPrompt: userPrompt || undefined,
        variationsRequested: variations,
      }),
    });
    const data = await res.json();
    router.push(`/generations/${data.id}`);
  }

  return (
    <div className="px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Studio
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Generá variaciones profesionales de tu producto.
        </p>

        {/* 1. Producto */}
        <Card className="glass mt-6 rounded-3xl border-0 p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-semibold text-foreground">
              <span className="font-mono text-xs text-primary">01</span> Tu
              producto
            </h2>
            <span className="text-xs text-muted-foreground">
              {productImages.length}/{MAX_PRODUCT_IMAGES}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            1 a {MAX_PRODUCT_IMAGES} fotos. Distintos ángulos suman calidad.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {productImages.map((url, i) => (
              <div
                key={i}
                className="relative aspect-square overflow-hidden rounded-xl bg-muted"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() =>
                    setProductImages((p) => p.filter((_, idx) => idx !== i))
                  }
                  className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {productImages.length < MAX_PRODUCT_IMAGES && (
              <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border/80 bg-glass text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                <Upload className="h-5 w-5" />
                <span className="text-[11px] font-medium">Subir</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handleProductUpload(e.target.files)}
                />
              </label>
            )}
          </div>
        </Card>

        {/* 2. Referencias */}
        <Card className="glass mt-4 rounded-3xl border-0 p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-semibold text-foreground">
              <span className="font-mono text-xs text-primary">02</span>{" "}
              Referencias visuales
            </h2>
            <span className="text-xs text-muted-foreground">
              {referenceImages.length}/{MAX_REFERENCE_IMAGES}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Subí imágenes de la estética que querés o elegí de la galería.
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {referenceImages.map((url, i) => (
              <div
                key={i}
                className="relative aspect-square overflow-hidden rounded-xl bg-muted"
              >
                {url.startsWith("blob:") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-primary/20 to-accent/30" />
                )}
                <button
                  type="button"
                  onClick={() =>
                    setReferenceImages((p) => p.filter((_, idx) => idx !== i))
                  }
                  className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {referenceImages.length < MAX_REFERENCE_IMAGES && (
              <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border/80 bg-glass text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                <Upload className="h-5 w-5" />
                <span className="text-[11px] font-medium">Subir</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handleReferenceUpload(e.target.files)}
                />
              </label>
            )}
          </div>

          {/* Galería starter */}
          <div className="mt-5">
            <p className="text-xs font-medium text-muted-foreground">
              O elegí de nuestra galería
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {STARTER_REFERENCES.map((s) => {
                const selected = referenceImages.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleStarter(s.id)}
                    className={cn(
                      "relative aspect-square overflow-hidden rounded-xl bg-gradient-to-br from-primary/20 to-accent/30 transition-all",
                      selected
                        ? "ring-2 ring-primary ring-offset-2 ring-offset-transparent"
                        : "hover:scale-[1.03]",
                    )}
                  >
                    <span className="absolute bottom-1 left-1 rounded bg-black/40 px-1.5 py-0.5 text-[9px] font-medium text-white">
                      {s.category}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </Card>

        {/* 3. Ratio */}
        <Card className="glass mt-4 rounded-3xl border-0 p-6">
          <h2 className="text-base font-semibold text-foreground">
            <span className="font-mono text-xs text-primary">03</span> Formato
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {OUTPUT_RATIOS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRatio(r.value)}
                className={cn(
                  "glass rounded-2xl p-4 text-left transition-all hover:scale-[1.02]",
                  ratio === r.value &&
                    "ring-2 ring-primary ring-offset-2 ring-offset-transparent",
                )}
              >
                <div className="font-mono text-sm font-semibold text-primary">
                  {r.value}
                </div>
                <div className="mt-0.5 text-xs font-medium text-foreground">
                  {r.label}
                </div>
                <div className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                  {r.description}
                </div>
              </button>
            ))}
          </div>
        </Card>

        {/* 4. Prompt opcional */}
        <Card className="glass mt-4 rounded-3xl border-0 p-6">
          <h2 className="text-base font-semibold text-foreground">
            <span className="font-mono text-xs text-primary">04</span>{" "}
            Instrucciones extras{" "}
            <span className="font-normal text-muted-foreground">
              (opcional)
            </span>
          </h2>
          <Textarea
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            placeholder="Ej: producto sobre superficie de mármol, luz cálida atardecer, plantas en el fondo"
            maxLength={500}
            rows={3}
            className="mt-3 resize-none rounded-xl"
          />
          <div className="mt-1 text-right text-[10px] text-muted-foreground">
            {userPrompt.length}/500
          </div>
        </Card>

        {/* 5. Variaciones */}
        <Card className="glass mt-4 rounded-3xl border-0 p-6">
          <h2 className="text-base font-semibold text-foreground">
            <span className="font-mono text-xs text-primary">05</span> Cuántas
            variaciones
          </h2>
          <div className="mt-4 flex items-center gap-4">
            <input
              type="range"
              min={1}
              max={10}
              value={variations}
              onChange={(e) => setVariations(Number(e.target.value))}
              className="flex-1 accent-primary"
            />
            <span className="w-12 text-right font-mono text-sm font-semibold text-foreground">
              {variations}
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Cuesta {variations} {variations === 1 ? "crédito" : "créditos"}.
          </p>
        </Card>

        {/* CTA */}
        <button
          type="button"
          onClick={generate}
          disabled={!canGenerate}
          className={cn(
            buttonVariants({ size: "lg" }),
            "mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-base font-semibold disabled:opacity-50",
          )}
        >
          {submitting ? (
            "Generando…"
          ) : (
            <>
              <Sparkles className="h-5 w-5" />
              Generar {variations}{" "}
              {variations === 1 ? "variación" : "variaciones"}
            </>
          )}
        </button>

        {!canGenerate && !submitting && (
          <p className="mt-3 text-center text-xs text-muted-foreground">
            {productImages.length === 0
              ? "Subí al menos una foto del producto."
              : "Agregá al menos una referencia visual."}
          </p>
        )}
      </div>
    </div>
  );
}
