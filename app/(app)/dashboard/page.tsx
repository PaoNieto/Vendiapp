"use client";

import Link from "next/link";
import { ImageIcon, Plus } from "lucide-react";
import {
  ActivityTimeline,
  AvatarCircle,
  GenerationCard,
  MetricTile,
  PillButton,
  WorkflowChip,
  type ActivityEvent,
} from "@/components/dashboard";
import { formatRelativeTime } from "@/lib/generations/format";
import {
  useGenerations,
  type Generation,
} from "@/lib/generations/store";
import { useNegocio } from "@/lib/negocio/store";
import { useProducts, type Product } from "@/lib/products/store";
import { useVersions, type Version } from "@/lib/versions/store";

/* ─────────────────────────────────────────────────────────────────────────
 * Helpers locales
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * Saludo según hora local:
 *  - 5-11 → "Buenos días"
 *  - 12-17 → "Buenas tardes"
 *  - resto → "Buenas noches"
 */
function getSaludo(now: Date = new Date()): string {
  const h = now.getHours();
  if (h >= 5 && h < 12) return "Buenos días";
  if (h >= 12 && h < 18) return "Buenas tardes";
  return "Buenas noches";
}

const DIAS = [
  "DOMINGO",
  "LUNES",
  "MARTES",
  "MIÉRCOLES",
  "JUEVES",
  "VIERNES",
  "SÁBADO",
] as const;

const MESES = [
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
] as const;

/**
 * Número de semana ISO 8601. La semana arranca lunes y la semana 1 es la que
 * contiene el primer jueves del año. Implementación clásica sin libs.
 */
function getISOWeekNumber(d: Date): number {
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return weekNo;
}

/**
 * Eyebrow del header: "LUNES 21 DE MAYO · SEMANA 21".
 */
function formatEyebrowDate(d: Date = new Date()): string {
  const dia = DIAS[d.getDay()];
  const mes = MESES[d.getMonth()];
  const semana = getISOWeekNumber(d);
  return `${dia} ${d.getDate()} DE ${mes} · SEMANA ${semana}`;
}

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

/**
 * Estado de los chips del workflow "Producto → Referencias → Formato → Versión".
 * El 4to step ("Versión") representa "revisar config y generar".
 *
 *  - sin productos                                  → producto active.
 *  - con productos pero sin versión                  → producto done, referencias active.
 *  - versión sin refs                                → producto done, referencias active.
 *  - versión con refs pero sin formato configurado   → producto done, referencias done, formato active.
 *    (entendemos "sin formato" como `variations_default < 1`. `output_ratio`
 *     siempre tiene default así que no lo chequeamos como proxy de "configurado".)
 *  - versión con todo configurado pero sin generaciones → ..., formato done, versión active.
 *  - alguna generación completed                      → todos done.
 */
type WorkflowState = {
  producto: "done" | "active" | "pending";
  referencias: "done" | "active" | "pending";
  formato: "done" | "active" | "pending";
  version: "done" | "active" | "pending";
};

function getWorkflowState(
  productsCount: number,
  versions: Version[],
  generations: Generation[],
): WorkflowState {
  if (productsCount === 0) {
    return {
      producto: "active",
      referencias: "pending",
      formato: "pending",
      version: "pending",
    };
  }
  // `versions` viene tal cual del store; lo ordenamos defensivamente para
  // tomar la más reciente sin asumir el orden upstream.
  const latest = [...versions].sort((a, b) =>
    a.updated_at < b.updated_at ? 1 : -1,
  )[0];
  if (!latest) {
    return {
      producto: "done",
      referencias: "active",
      formato: "pending",
      version: "pending",
    };
  }
  if (latest.reference_images.length === 0) {
    return {
      producto: "done",
      referencias: "active",
      formato: "pending",
      version: "pending",
    };
  }
  if (latest.variations_default < 1) {
    return {
      producto: "done",
      referencias: "done",
      formato: "active",
      version: "pending",
    };
  }

  // Tiene refs + formato OK. Vemos las generations de esa versión.
  const latestGens = generations.filter((g) => g.version_id === latest.id);
  const hasCompleted = latestGens.some((g) => g.status === "completed");
  if (hasCompleted) {
    return {
      producto: "done",
      referencias: "done",
      formato: "done",
      version: "done",
    };
  }
  return {
    producto: "done",
    referencias: "done",
    formato: "done",
    version: "active",
  };
}

/**
 * Cuenta cuántas generaciones completed se cerraron en el mes calendario actual.
 */
function countGenerationsThisMonth(generations: Generation[]): number {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  let count = 0;
  for (const g of generations) {
    if (g.status !== "completed" || !g.completed_at) continue;
    const ts = new Date(g.completed_at);
    if (ts.getFullYear() === y && ts.getMonth() === m) count += 1;
  }
  return count;
}

/**
 * Sparkline de últimos 7 días: cantidad de generaciones completed por día.
 * Devuelve [d-6, d-5, …, hoy]. Si la serie queda toda en 0, devolvemos null
 * para que el caller use el mock visual.
 */
function buildLast7DaysSpark(generations: Generation[]): number[] | null {
  const buckets = new Array(7).fill(0) as number[];
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startMs = startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000;
  for (const g of generations) {
    if (g.status !== "completed" || !g.completed_at) continue;
    const ts = Date.parse(g.completed_at);
    if (Number.isNaN(ts) || ts < startMs) continue;
    const dayIdx = Math.min(
      6,
      Math.max(0, Math.floor((ts - startMs) / (24 * 60 * 60 * 1000))),
    );
    buckets[dayIdx] += 1;
  }
  if (buckets.every((n) => n === 0)) return null;
  return buckets;
}

/**
 * Eventos del timeline: derivados de generations + products si hay data, o
 * mock si está vacío. Mantiene el contrato `ActivityEvent` del componente.
 */
function buildActivityEvents(
  generations: Generation[],
  products: Product[],
  versions: Version[],
): ActivityEvent[] {
  if (generations.length === 0 && products.length === 0) {
    // Mock alineado con el brief del task.
    return [
      {
        id: "mock-1",
        actor: "user",
        message: "descargaste \"Café fuerte medio\" · v.1",
        time: "14:22",
        highlight: "Café fuerte medio",
      },
      {
        id: "mock-2",
        actor: "system",
        message: "terminó 6 generaciones — Vela aromática",
        time: "12:08",
        highlight: "Vela aromática",
      },
      {
        id: "mock-3",
        actor: "user",
        message: "subiste producto Miel para 350g",
        time: "ayer 18:45",
        highlight: "Miel para 350g",
      },
      {
        id: "mock-4",
        actor: "user",
        message: "editaste prompt — Maíz en calabaza · estilo lifestyle",
        time: "ayer 16:30",
        highlight: "Maíz en calabaza",
      },
      {
        id: "mock-5",
        actor: "system",
        message: "terminó 6 generaciones — Aceite de oliva",
        time: "ayer 11:12",
        highlight: "Aceite de oliva",
      },
    ];
  }

  const productById = new Map(products.map((p) => [p.id, p]));
  const versionById = new Map(versions.map((v) => [v.id, v]));
  const events: ActivityEvent[] = [];

  // Generaciones recientes — hasta 4 eventos del sistema/usuario.
  const recentGens = [...generations]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 4);

  for (const gen of recentGens) {
    const version = gen.version_id ? versionById.get(gen.version_id) : undefined;
    const product = gen.project_id ? productById.get(gen.project_id) : undefined;
    const label =
      version?.name ?? product?.name ?? gen.user_prompt ?? "una versión";

    if (gen.status === "completed") {
      events.push({
        id: gen.id,
        actor: "system",
        message: `terminó ${gen.variations_requested} generaciones — ${label}`,
        time: formatRelativeTime(gen.completed_at ?? gen.created_at),
        highlight: label,
      });
    } else if (gen.status === "failed") {
      events.push({
        id: gen.id,
        actor: "system",
        message: `no pudo terminar — ${label}`,
        time: formatRelativeTime(gen.completed_at ?? gen.created_at),
        highlight: label,
      });
    } else {
      events.push({
        id: gen.id,
        actor: "system",
        message: `está procesando ${gen.variations_requested} variaciones — ${label}`,
        time: formatRelativeTime(gen.created_at),
        highlight: label,
      });
    }
  }

  // Producto más reciente como "Vos subiste producto …".
  const lastProduct = [...products].sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1,
  )[0];
  if (lastProduct) {
    events.push({
      id: `prod-${lastProduct.id}`,
      actor: "user",
      message: `subiste producto ${lastProduct.name}`,
      time: formatRelativeTime(lastProduct.created_at),
      highlight: lastProduct.name,
    });
  }

  return events.slice(0, 5);
}

/**
 * Iniciales para el avatar: primeras 2 letras del brandName en uppercase.
 * Si no hay brandName, default `"N"` (consistente con "Nati").
 */
function brandInitials(brandName: string): string {
  const clean = brandName.trim();
  if (!clean) return "N";
  return clean.slice(0, 2).toUpperCase();
}

/* ─────────────────────────────────────────────────────────────────────────
 * Page
 * ───────────────────────────────────────────────────────────────────────── */

export default function DashboardPage() {
  const negocio = useNegocio();
  const products = useProducts();
  const generations = useGenerations();
  const versions = useVersions();

  const allHydrated =
    negocio.hydrated &&
    products.hydrated &&
    generations.hydrated &&
    versions.hydrated;

  return (
    <div className="px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-6xl">
        {!allHydrated ? (
          <DashboardSkeleton />
        ) : (
          <DashboardContent
            brandName={negocio.state.brandName}
            products={products}
            generations={generations}
            versions={versions}
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
  versions,
}: {
  brandName: string;
  products: ReturnType<typeof useProducts>;
  generations: ReturnType<typeof useGenerations>;
  versions: ReturnType<typeof useVersions>;
}) {
  const stats = generations.getStats();
  const recentGenerations = generations.getRecent(8);
  const productsCount = products.state.products.length;
  const lastProduct = products.getRecent(1)[0];
  const ctaHref = nuevaImagenHref(productsCount);

  const displayName = brandName.trim().length > 0 ? brandName : "Nati";
  const initials = brandInitials(displayName);
  const now = new Date();
  const eyebrowDate = formatEyebrowDate(now);
  const saludo = getSaludo(now);

  // Datos derivados para métricas.
  const generationsThisMonth = countGenerationsThisMonth(
    generations.state.generations,
  );
  const sparkLast7 = buildLast7DaysSpark(generations.state.generations);
  // Producto destacado para subtítulo rico: el más reciente (fallback al mock).
  const featuredProductName = lastProduct?.name ?? "Café fuerte medio";

  // Workflow state — basado en si hay productos, versiones, refs y generations.
  const workflow = getWorkflowState(
    productsCount,
    versions.state.versions,
    generations.state.generations,
  );

  // Activity events — derivados o mock.
  const events = buildActivityEvents(
    generations.state.generations,
    products.state.products,
    versions.state.versions,
  );

  // Sparklines mock para KPIs que no tenemos data real todavía.
  // Curvas tendencia-positiva sin caídas bruscas, 7 puntos.
  const sparkDownloads = [3, 4, 3, 5, 4, 6, 8];
  const sparkProducts = [4, 5, 5, 6, 6, 7, 8];
  const sparkTimeSaved = [6, 7, 9, 10, 11, 12, 14];
  // Para imágenes este mes, si no hubo data real construimos un mock similar.
  const sparkImages = sparkLast7 ?? [2, 4, 3, 6, 5, 7, 6];

  return (
    <>
      {/* 1. Header */}
      <header className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <span className="eyebrow">{eyebrowDate}</span>
          <div className="hidden items-center gap-3 sm:flex">
            <PillButton size="md" asChild>
              <Link href={ctaHref}>
                <Plus className="h-4 w-4" />
                Nueva Imagen
              </Link>
            </PillButton>
            <AvatarCircle
              initials={initials}
              size={44}
              ariaLabel={`Avatar de ${displayName}`}
            />
          </div>
          {/* En mobile dejamos solo el avatar arriba a la derecha. El CTA se
              renderiza full-width abajo del subtítulo (mejor ergonomía). */}
          <div className="sm:hidden">
            <AvatarCircle
              initials={initials}
              size={40}
              ariaLabel={`Avatar de ${displayName}`}
            />
          </div>
        </div>

        <div>
          <h1 className="display-serif text-3xl leading-tight text-ink sm:text-[40px]">
            {saludo},{" "}
            <span className="display-serif-italic text-accent dark:text-warning">
              {displayName}
            </span>
            .
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-mute sm:text-base">
            Esta semana subió tu promedio: {stats.thisWeek > 0 ? stats.thisWeek : 5}{" "}
            generaciones y 12 descargas.{" "}
            <span className="display-serif-italic text-ink">
              {featuredProductName}
            </span>{" "}
            es tu producto más fotografiado.
          </p>
        </div>

        <div className="sm:hidden">
          <PillButton size="lg" asChild>
            <Link href={ctaHref} className="w-full">
              <Plus className="h-4 w-4" />
              Nueva Imagen
            </Link>
          </PillButton>
        </div>
      </header>

      {/* 2. Metric tiles */}
      <section className="mt-6 grid grid-cols-2 gap-3 sm:mt-8 sm:gap-4 lg:grid-cols-4">
        <MetricTile
          label="IMÁGENES ESTE MES"
          value={generationsThisMonth > 0 ? generationsThisMonth : 47}
          delta={{ value: "+23%", positive: true }}
          deltaLabel="vs mes anterior"
          sparkline={sparkImages}
        />
        <MetricTile
          label="DESCARGAS"
          value={23}
          delta={{ value: "+8%", positive: true }}
          deltaLabel="vs semana anterior"
          sparkline={sparkDownloads}
        />
        <MetricTile
          label="PRODUCTOS ACTIVOS"
          value={productsCount > 0 ? productsCount : 8}
          delta={{ value: "+2", positive: true }}
          deltaLabel="vs semana anterior"
          sparkline={sparkProducts}
        />
        <MetricTile
          label="TIEMPO AHORRADO"
          value="14 hs"
          delta={{ value: "+3 hs", positive: true }}
          deltaLabel="vs semana anterior"
          sparkline={sparkTimeSaved}
        />
      </section>

      {/* 3. Nueva generación + Actividad */}
      <section className="mt-6 grid gap-4 sm:mt-8 lg:grid-cols-[1.4fr_1fr]">
        {/* Card izquierda — Nueva generación */}
        <div className="glass-card flex flex-col gap-5 p-6 sm:p-7">
          <span className="eyebrow">NUEVA GENERACIÓN</span>
          <h2 className="display-serif text-2xl leading-tight text-ink sm:text-[28px]">
            Empezá desde cero{" "}
            <span className="display-serif-italic">
              o seguí donde quedaste
            </span>
            .
          </h2>

          <div className="flex flex-wrap items-center gap-2">
            <WorkflowChip label="Producto" state={workflow.producto} />
            <span className="text-mute" aria-hidden>
              →
            </span>
            <WorkflowChip label="Referencias" state={workflow.referencias} />
            <span className="text-mute" aria-hidden>
              →
            </span>
            <WorkflowChip label="Formato" state={workflow.formato} />
            <span className="text-mute" aria-hidden>
              →
            </span>
            <WorkflowChip label="Versión" state={workflow.version} />
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-4">
            <PillButton size="md" asChild>
              <Link href={ctaHref}>
                <Plus className="h-4 w-4" />
                Crear imagen
              </Link>
            </PillButton>
            {lastProduct ? (
              <Link
                href={`/productos/${lastProduct.id}`}
                className="text-sm text-mute underline-offset-4 hover:text-ink hover:underline"
              >
                o continuá{" "}
                <span className="display-serif-italic text-ink">
                  {lastProduct.name}
                </span>
              </Link>
            ) : null}
          </div>
        </div>

        {/* Card derecha — Actividad */}
        <div className="glass-card flex flex-col gap-4 p-6 sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <span className="eyebrow">ACTIVIDAD</span>
            <Link
              href="/fabrica"
              className="text-xs text-mute hover:text-ink"
            >
              Ver todo →
            </Link>
          </div>
          <ActivityTimeline events={events} />
        </div>
      </section>

      {/* 4. Generaciones recientes */}
      <section className="mt-8 sm:mt-10">
        <div className="flex items-end justify-between gap-3">
          <h2 className="display-serif text-2xl leading-tight text-ink sm:text-[28px]">
            Generaciones recientes{" "}
            <span className="text-sm font-sans text-mute">
              {generations.state.generations.length} en total
            </span>
          </h2>
          {recentGenerations.length > 0 ? (
            <Link
              href="/fabrica"
              className="text-sm text-mute hover:text-ink"
            >
              Ver todas →
            </Link>
          ) : null}
        </div>

        {recentGenerations.length === 0 ? (
          <div className="glass-card mt-4 flex flex-col items-center gap-3 p-8 text-center sm:p-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-pill-bg/10">
              <ImageIcon className="h-5 w-5 text-ink" />
            </div>
            <h3 className="text-base font-medium text-ink">
              Todavía no generaste nada
            </h3>
            <p className="max-w-xs text-sm text-mute">
              Subí fotos de tu producto para crear tu primera variación.
            </p>
            <div className="mt-1">
              <PillButton size="md" asChild>
                <Link href={ctaHref}>Empezar</Link>
              </PillButton>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {recentGenerations.slice(0, 8).map((gen) => {
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

      {/* 5. Modo dev — oculto bajo <details> */}
      <details className="mt-10 sm:mt-12">
        <summary className="cursor-pointer text-xs text-mute hover:text-ink">
          Validación visual
        </summary>
        <div className="mt-3 flex flex-wrap gap-2">
          <PillButton
            size="sm"
            onClick={() => {
              products.seedDevData();
              versions.seedDevData();
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
              window.localStorage.removeItem("vendi:versions");
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
      <div className="flex items-start justify-between gap-4">
        <div className="h-3 w-48 animate-pulse rounded-full bg-white/40" />
        <div className="flex items-center gap-3">
          <div className="hidden h-11 w-40 animate-pulse rounded-full bg-white/40 sm:block" />
          <div className="h-11 w-11 animate-pulse rounded-full bg-white/40" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="h-10 w-72 animate-pulse rounded-full bg-white/40" />
        <div className="h-4 w-96 animate-pulse rounded-full bg-white/30" />
      </div>

      {/* Metric tiles skeleton */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass-card h-32 animate-pulse" />
        ))}
      </div>

      {/* Nueva generación + actividad skeleton */}
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="glass-card h-56 animate-pulse" />
        <div className="glass-card h-56 animate-pulse" />
      </div>

      {/* Recent skeleton */}
      <div>
        <div className="h-7 w-72 animate-pulse rounded-full bg-white/40" />
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass-card-compact h-64 animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
