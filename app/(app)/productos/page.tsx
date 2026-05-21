"use client";

import Link from "next/link";
import { Package, Plus } from "lucide-react";
import { PillButton, ProductCard } from "@/components/dashboard";
import { formatRelativeTime } from "@/lib/generations/format";
import { useGenerations } from "@/lib/generations/store";
import type { Generation } from "@/lib/generations/store";
import { useProducts } from "@/lib/products/store";
import type { Product } from "@/lib/products/store";

/**
 * Catálogo de productos — grid de `ProductCard` + CTAs para crear el primero o
 * sumar otro. Consume `useProducts` + `useGenerations` para enriquecer cada
 * card con su contador real de generaciones y la última actividad.
 */
export default function ProductosPage() {
  const products = useProducts();
  const generations = useGenerations();

  const allHydrated = products.hydrated && generations.hydrated;
  const items = products.state.products;

  return (
    <div className="px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
          <div>
            <h1 className="text-2xl font-medium tracking-tight text-green-dark sm:text-3xl">
              Mi Catálogo
            </h1>
            <p className="mt-1 text-sm text-green-text">
              Tus productos y las fotos que reutilizás en cada generación.
            </p>
          </div>
          {allHydrated && items.length > 0 ? (
            <div className="hidden sm:block">
              <PillButton size="md" asChild>
                <Link href="/productos/nuevo">
                  <Plus className="h-4 w-4" />
                  Nuevo Producto
                </Link>
              </PillButton>
            </div>
          ) : null}
        </header>

        {!allHydrated ? (
          <CatalogSkeleton />
        ) : items.length === 0 ? (
          <EmptyCatalog />
        ) : (
          <>
            <CatalogGrid
              products={items}
              generations={generations.state.generations}
            />

            {/* CTA mobile abajo de todo */}
            <div className="mt-8 sm:hidden">
              <PillButton size="lg" asChild className="w-full">
                <Link href="/productos/nuevo">
                  <Plus className="h-4 w-4" />
                  Nuevo Producto
                </Link>
              </PillButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CatalogGrid({
  products,
  generations,
}: {
  products: Product[];
  generations: Generation[];
}) {
  // Indexamos generaciones por product_id para no recorrer la lista N veces.
  const byProduct = new Map<string, Generation[]>();
  for (const gen of generations) {
    if (!gen.project_id) continue;
    const list = byProduct.get(gen.project_id) ?? [];
    list.push(gen);
    byProduct.set(gen.project_id, list);
  }

  return (
    <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((product) => {
        const productGens = byProduct.get(product.id) ?? [];
        const generationsCount = productGens.length;
        const latest = productGens.reduce<Generation | null>(
          (acc, g) => (acc && acc.created_at > g.created_at ? acc : g),
          null,
        );
        const lastActivity = latest
          ? formatRelativeTime(latest.created_at)
          : null;
        const coverImageUrl =
          product.cover_image_url ?? product.product_images[0] ?? undefined;

        return (
          <ProductCard
            key={product.id}
            id={product.id}
            name={product.name}
            description={product.description}
            coverImageUrl={coverImageUrl}
            imagesCount={product.product_images.length}
            generationsCount={generationsCount}
            lastActivity={lastActivity}
            href={`/productos/${product.id}`}
          />
        );
      })}
    </div>
  );
}

function EmptyCatalog() {
  return (
    <div className="glass-card mt-6 flex flex-col items-center gap-3 p-8 text-center sm:p-12">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-dark/10">
        <Package className="h-5 w-5 text-green-dark" />
      </div>
      <h2 className="text-base font-medium text-green-dark">
        Todavía no tenés productos en tu catálogo
      </h2>
      <p className="max-w-sm text-sm text-green-text">
        Creá tu primer producto para empezar a generar imágenes.
      </p>
      <div className="mt-2">
        <PillButton size="md" asChild>
          <Link href="/productos/nuevo">
            <Plus className="h-4 w-4" />
            Crear primer producto
          </Link>
        </PillButton>
      </div>
    </div>
  );
}

function CatalogSkeleton() {
  return (
    <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="glass-card-compact h-72 animate-pulse" />
      ))}
    </div>
  );
}
