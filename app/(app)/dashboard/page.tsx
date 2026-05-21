"use client";

import Link from "next/link";
import { ImageIcon, Plus } from "lucide-react";
import {
  GenerationCard,
  PillButton,
  StatRow,
} from "@/components/dashboard";
import { formatRelativeTime } from "@/lib/generations/format";
import { useGenerations } from "@/lib/generations/store";
import { useNegocio } from "@/lib/negocio/store";
import { useProducts } from "@/lib/products/store";

/**
 * Resuelve a dónde manda el CTA "+ Nueva Imagen":
 * - sin productos → al formulario para crear el primero.
 * - con productos → al catálogo, donde el usuario elige producto y desde el
 *   detalle dispara "+ Nueva Versión" (el flujo natural reemplaza al viejo
 *   selector intermedio `/seleccionar-producto`, que ya no existe).
 */
function nuevaImagenHref(productsCount: number): string {
  return productsCount === 0 ? "/productos/nuevo" : "/productos";
}

export default function DashboardPage() {
  const negocio = useNegocio();
  const products = useProducts();
  const generations = useGenerations();

  const allHydrated =
    negocio.hydrated && products.hydrated && generations.hydrated;

  return (
    <div className="px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-5xl">
        {!allHydrated ? (
          <DashboardSkeleton />
        ) : (
          <DashboardContent
            brandName={negocio.state.brandName}
            products={products}
            generations={generations}
          />
        )}
      </div>
    </div>
  );
}

function DashboardContent({
  brandName,
  products,
  generations,
}: {
  brandName: string;
  products: ReturnType<typeof useProducts>;
  generations: ReturnType<typeof useGenerations>;
}) {
  const stats = generations.getStats();
  const recentGenerations = generations.getRecent(6);
  const productsCount = products.state.products.length;
  const lastProduct = products.getRecent(1)[0];
  const isNewUser = stats.thisWeek === 0 && productsCount === 0;
  const ctaHref = nuevaImagenHref(productsCount);

  const greeting = brandName.trim().length > 0 ? `¡Hola, ${brandName}!` : "¡Hola!";
  const activitySubtitle =
    stats.thisWeek > 0
      ? `Esta semana: ${stats.thisWeek} generaciones · ${stats.activeProjects} productos activos`
      : isNewUser
        ? "Empezá tu primera generación cuando quieras"
        : "Continuá donde lo dejaste";

  return (
    <>
      {/* 1. Header */}
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div>
          <h1 className="text-2xl font-medium tracking-tight text-green-dark sm:text-3xl">
            {greeting}
          </h1>
          <p className="mt-1 text-sm text-green-text">{activitySubtitle}</p>
        </div>
        <div className="hidden sm:block">
          <PillButton size="md" asChild>
            <Link href={ctaHref}>
              <Plus className="h-4 w-4" />
              Nueva Imagen
            </Link>
          </PillButton>
        </div>
      </header>

      {/* 2. Zona principal */}
      <section className="mt-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
        {/* Hero "Nueva generación" */}
        <div className="glass-card flex flex-col gap-3 p-6 sm:p-7">
          <span className="eyebrow">NUEVA GENERACIÓN</span>
          <h2 className="text-xl font-medium text-green-dark">
            Empezá desde cero
          </h2>
          <p className="text-sm text-green-text">
            Producto → referencias → estilo → formato → prompt
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <PillButton size="md" asChild>
              <Link href={ctaHref}>
                <Plus className="h-4 w-4" />
                Nueva Imagen
              </Link>
            </PillButton>
            {lastProduct ? (
              <Link
                href={`/productos/${lastProduct.id}`}
                className="text-sm text-green-text underline-offset-4 hover:text-green-dark hover:underline"
              >
                o continuá {lastProduct.name}
              </Link>
            ) : null}
          </div>
        </div>

        {/* Card "Resumen" */}
        <div className="glass-card flex flex-col gap-4 p-6 sm:p-7">
          <span className="eyebrow">RESUMEN</span>
          <div className="flex flex-col gap-4">
            <StatRow
              label="Esta semana"
              value={stats.thisWeek > 0 ? stats.thisWeek : "—"}
              divider
            />
            <StatRow
              label="Productos"
              value={productsCount > 0 ? productsCount : "—"}
              divider
            />
            <StatRow
              label="Última"
              value={
                stats.lastGeneratedAt
                  ? formatRelativeTime(stats.lastGeneratedAt)
                  : "—"
              }
            />
          </div>
        </div>
      </section>

      {/* 3. Generaciones recientes */}
      <section className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium text-green-dark">
            Generaciones recientes
          </h2>
          {recentGenerations.length > 0 ? (
            <Link
              href="/productos"
              className="text-sm text-green-text hover:text-green-dark"
            >
              Ver todas →
            </Link>
          ) : null}
        </div>

        {recentGenerations.length === 0 ? (
          <div className="glass-card mt-4 flex flex-col items-center gap-3 p-8 text-center sm:p-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-dark/10">
              <ImageIcon className="h-5 w-5 text-green-dark" />
            </div>
            <h3 className="text-base font-medium text-green-dark">
              Todavía no generaste nada
            </h3>
            <p className="max-w-xs text-sm text-green-text">
              Subí fotos de tu producto para crear tu primera variación.
            </p>
            <div className="mt-1">
              <PillButton size="md" asChild>
                <Link href={ctaHref}>Empezar</Link>
              </PillButton>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recentGenerations.map((gen) => {
              const product = gen.project_id
                ? products.getById(gen.project_id)
                : undefined;
              const projectName = product?.name ?? "Sin producto";
              return (
                <GenerationCard
                  key={gen.id}
                  id={gen.id}
                  projectName={projectName}
                  ratio={gen.output_ratio}
                  status={gen.status}
                  variations={gen.variations_requested}
                  relativeTime={formatRelativeTime(gen.created_at)}
                  href={`/proyectos/${gen.id}`}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* CTA mobile (después de todo, full width) */}
      <div className="mt-8 sm:hidden">
        <PillButton size="lg" asChild>
          <Link href={ctaHref} className="w-full">
            <Plus className="h-4 w-4" />
            Nueva Imagen
          </Link>
        </PillButton>
      </div>

      {/* 4. Modo dev — TODO: remover cuando conectemos Supabase */}
      <details className="mt-10 sm:mt-12">
        <summary className="cursor-pointer text-xs text-green-text/60 hover:text-green-text">
          Validación visual
        </summary>
        <div className="mt-3 flex flex-wrap gap-2">
          <PillButton
            size="sm"
            onClick={() => {
              products.seedDevData();
              generations.seedDevData();
            }}
          >
            Cargar data de ejemplo
          </PillButton>
          <PillButton
            size="sm"
            onClick={() => {
              if (typeof window === "undefined") return;
              window.localStorage.removeItem("vendi:products");
              window.localStorage.removeItem("vendi:generations");
              window.location.reload();
            }}
          >
            Resetear
          </PillButton>
        </div>
      </details>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      {/* Header skeleton */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-8 w-48 animate-pulse rounded-full bg-white/40" />
          <div className="h-4 w-64 animate-pulse rounded-full bg-white/30" />
        </div>
        <div className="hidden h-11 w-40 animate-pulse rounded-full bg-white/40 sm:block" />
      </div>

      {/* Hero + Resumen skeleton */}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="glass-card h-44 animate-pulse" />
        <div className="glass-card h-44 animate-pulse" />
      </div>

      {/* Recent skeleton */}
      <div>
        <div className="h-6 w-48 animate-pulse rounded-full bg-white/40" />
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="glass-card-compact h-64 animate-pulse"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
