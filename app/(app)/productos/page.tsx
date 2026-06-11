"use client";

import Link from "next/link";
import Image from "next/image";
import { ImageIcon, Plus } from "lucide-react";
import { motion } from "motion/react";

import {
  AvatarCircle,
  PillButton,
  Thumbnail,
  type ThumbnailTone,
} from "@/components/dashboard";
import { Topbar } from "@/components/app/topbar";
import { formatRelativeTime } from "@/lib/generations/format";
import { useGenerations } from "@/lib/generations/store";
import type { Generation } from "@/lib/generations/store";
import { useNegocio } from "@/lib/negocio/store";
import { useProducts } from "@/lib/products/store";
import type { Product } from "@/lib/products/store";
import { useUserInitials } from "@/lib/auth/use-user";
import { cn } from "@/lib/utils";

/**
 * Mi Catálogo — grilla de productos según mock v2 `screen-catalogo.jsx`.
 *
 * Estructura:
 *   - <Topbar title subtitle right={CTA + Avatar}>
 *   - grid 2 / 3 / 4 columnas
 *   - cada card: hero 4/3.4 con Thumbnail (tone derivado del id) o placeholder
 *     neutro (círculo gris) si no hay fotos; badge "N imágenes" si gens > 0;
 *     body con nombre en font-display italic + métricas chiquitas.
 *
 * Datos reales del store: si el catálogo está vacío, mostramos un empty state
 * centrado con CTA "+ Nuevo Producto". NO inventamos productos.
 */
export default function ProductosPage() {
  const products = useProducts();
  const generations = useGenerations();
  const negocio = useNegocio();

  const allHydrated =
    products.hydrated && generations.hydrated && negocio.hydrated;
  const items = products.state.products;
  const brandInitials = useUserInitials();

  return (
    <>
      <Topbar
        title="Mi Catálogo"
        subtitle="Tus productos y las fotos que reutilizás en cada generación."
        right={
          <>
            <PillButton size="md" asChild>
              <Link href="/productos/nuevo">
                <Plus className="h-4 w-4" />
                Nuevo Producto
              </Link>
            </PillButton>
            <AvatarCircle initials={brandInitials} size={40} />
          </>
        }
      />

      <div className="flex-1 px-5 pb-12 pt-2 sm:px-8 lg:px-10">
        <div className="mx-auto w-full max-w-6xl">
          {!allHydrated ? (
            <CatalogSkeleton />
          ) : items.length === 0 ? (
            <EmptyCatalog />
          ) : (
            <CatalogGrid
              products={items}
              generations={generations.state.generations}
              images={generations.state.images}
            />
          )}
        </div>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Grid                                                                       */
/* -------------------------------------------------------------------------- */

const TONES: ThumbnailTone[] = [
  "sage",
  "butter",
  "paper",
  "clay",
  "mineral",
  "editorial",
  "champagne",
];

/**
 * Tono derivado deterministamente del `id` del producto — así un producto
 * siempre tiene el mismo tono entre sesiones sin guardarlo aparte.
 */
function toneFor(productId: string): ThumbnailTone {
  let hash = 0;
  for (let i = 0; i < productId.length; i += 1) {
    hash = (hash * 31 + productId.charCodeAt(i)) | 0;
  }
  return TONES[Math.abs(hash) % TONES.length];
}

function CatalogGrid({
  products,
  generations,
  images,
}: {
  products: Product[];
  generations: Generation[];
  images: { generation_id: string; image_url: string }[];
}) {
  // Indexamos generaciones por product_id para una sola pasada.
  const byProduct = new Map<string, Generation[]>();
  for (const gen of generations) {
    if (!gen.project_id) continue;
    const list = byProduct.get(gen.project_id) ?? [];
    list.push(gen);
    byProduct.set(gen.project_id, list);
  }
  // Indexamos imágenes por generation_id para contar las reales generadas.
  const imagesByGen = new Map<string, number>();
  for (const img of images) {
    imagesByGen.set(
      img.generation_id,
      (imagesByGen.get(img.generation_id) ?? 0) + 1,
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 xl:gap-6">
      {products.map((product) => {
        const productGens = byProduct.get(product.id) ?? [];
        const latest = productGens.reduce<Generation | null>(
          (acc, g) => (acc && acc.created_at > g.created_at ? acc : g),
          null,
        );
        const lastActivity = latest
          ? formatRelativeTime(latest.created_at)
          : null;
        // "Una imagen creada es una generación" (Paolo): contamos la cantidad
        // REAL de imágenes generadas de generations `completed` del producto.
        // Este único número alimenta TANTO el badge amarillo como el texto
        // inferior — antes divergían (gens-totales vs gens-con-imagen).
        const completedImagesCount = productGens.reduce((acc, g) => {
          if (g.status !== "completed") return acc;
          return acc + (imagesByGen.get(g.id) ?? 0);
        }, 0);
        const hasUploadedPhotos = product.product_images.length > 0;
        const coverUrl =
          product.cover_image_url ?? product.product_images[0] ?? null;

        return (
          <ProductCard
            key={product.id}
            product={product}
            tone={toneFor(product.id)}
            hasUploadedPhotos={hasUploadedPhotos}
            coverUrl={coverUrl}
            completedImagesCount={completedImagesCount}
            lastActivity={lastActivity}
          />
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Card                                                                       */
/* -------------------------------------------------------------------------- */

function ProductCard({
  product,
  tone,
  hasUploadedPhotos,
  coverUrl,
  completedImagesCount,
  lastActivity,
}: {
  product: Product;
  tone: ThumbnailTone;
  hasUploadedPhotos: boolean;
  coverUrl: string | null;
  completedImagesCount: number;
  lastActivity: string | null;
}) {
  // El badge sólo aparece si hay foto de portada y al menos una imagen generada.
  // El MISMO número se muestra abajo, así "coinciden" como pidió Paolo.
  const showCount = hasUploadedPhotos && completedImagesCount > 0;
  // Si tiene fotos reales subidas: mostramos la foto real. Si no: thumbnail
  // tinteado por tono. Si NO tiene nada: placeholder neutro gris.
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-[18px]",
        // Card sólida cream Cuaderno + border definido + multi-layer shadow.
        "bg-card border border-border",
        "shadow-[0_1px_0_rgba(15,31,22,0.06),0_12px_32px_-16px_rgba(15,31,22,0.32),0_40px_80px_-40px_rgba(15,31,22,0.18)]",
        "hover:shadow-[0_2px_0_rgba(15,31,22,0.08),0_24px_56px_-20px_rgba(15,31,22,0.45),0_48px_96px_-32px_rgba(15,31,22,0.22)]",
        "transition-shadow duration-300",
      )}
    >
      <Link
        href={`/productos/${product.id}`}
        className="flex flex-col rounded-[18px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {/* Hero cuadrado — más impactante visualmente que 4/3.4 estrecho. */}
        <div className="relative w-full aspect-square overflow-hidden">
          {hasUploadedPhotos && coverUrl ? (
            <Image
              src={coverUrl}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 360px"
              className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05]"
            />
          ) : hasUploadedPhotos ? (
            <Thumbnail tone={tone} radius={0} />
          ) : (
            <PhotoPlaceholder />
          )}

          {/* Sheen sutil arriba para dar profundidad al thumb */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/8 to-transparent"
          />

          {showCount && (
            <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-[rgba(15,31,22,0.85)] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.5px] text-[#F0F4E7] backdrop-blur-sm shadow-lg">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-butter" />
              {completedImagesCount}{" "}
              {completedImagesCount === 1 ? "imagen" : "imágenes"}
            </span>
          )}

          {/* CTA hover sutil — flecha que indica "entrar" */}
          <div className="pointer-events-none absolute bottom-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-card text-foreground opacity-0 shadow-lg transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0 translate-x-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path
                fillRule="evenodd"
                d="M7.21 5.23a.75.75 0 0 1 1.06-.02l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 1 1-1.04-1.08L11.06 10 7.23 6.29a.75.75 0 0 1-.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        </div>

        {/* Divider sutil entre hero y body para dar dimensión */}
        <div aria-hidden className="h-px w-full bg-border" />

        {/* Body — padding generoso, tipografía editorial */}
        <div className="flex flex-col gap-1.5 px-5 py-5">
          <h3
            className="truncate font-display text-[20px] italic leading-[1.15] tracking-[-0.01em] text-foreground"
            title={product.name}
          >
            {product.name}
          </h3>
          {completedImagesCount > 0 ? (
            <div className="flex items-center gap-2 text-[12.5px] font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-sage-strong" />
                {completedImagesCount}{" "}
                {completedImagesCount === 1 ? "imagen" : "imágenes"}
              </span>
              {lastActivity ? (
                <>
                  <span className="text-muted-foreground/50">·</span>
                  <span>{lastActivity}</span>
                </>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[12.5px] italic text-muted-foreground">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
              Sin generaciones
            </div>
          )}
        </div>
      </Link>
    </motion.div>
  );
}

function PhotoPlaceholder() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-card-cream/40 text-mute">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-foreground/5">
        <ImageIcon className="h-5 w-5" strokeWidth={1.6} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Empty & skeleton                                                           */
/* -------------------------------------------------------------------------- */

function EmptyCatalog() {
  return (
    <div className="glass-card mx-auto mt-4 flex max-w-md flex-col items-center gap-3 p-8 text-center sm:p-10">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-foreground/5 text-foreground">
        <ImageIcon className="h-5 w-5" strokeWidth={1.6} />
      </div>
      <h2 className="font-display text-2xl italic text-foreground">
        Tu catálogo está vacío
      </h2>
      <p className="max-w-sm text-sm text-mute">
        Creá tu primer producto para empezar a generar imágenes desde la
        Fábrica.
      </p>
      <div className="mt-2">
        <PillButton size="md" asChild>
          <Link href="/productos/nuevo">
            <Plus className="h-4 w-4" />
            Nuevo Producto
          </Link>
        </PillButton>
      </div>
    </div>
  );
}

function CatalogSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 xl:gap-6">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-[18px] border border-border bg-card"
        >
          <div className="aspect-square w-full animate-pulse bg-foreground/5" />
          <div className="h-px w-full bg-border" />
          <div className="flex flex-col gap-2 px-5 py-5">
            <div className="h-5 w-2/3 animate-pulse rounded bg-foreground/10" />
            <div className="h-3.5 w-1/2 animate-pulse rounded bg-foreground/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

