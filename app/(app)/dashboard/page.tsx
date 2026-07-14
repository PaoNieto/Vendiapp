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
  type GeneratedImage,
} from "@/lib/generations/store";
import { useNegocio } from "@/lib/negocio/store";
import { useUser, useUserInitials } from "@/lib/auth/use-user";
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
 * Estado de los chips del workflow "Producto → Estilo → Formato → Versión".
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
  estilo: "done" | "active" | "pending";
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
      estilo: "pending",
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
      estilo: "active",
      formato: "pending",
      version: "pending",
    };
  }
  // El "look" (estilo + refs fusionados) está listo con CUALQUIERA de los dos:
  // un estilo elegido o al menos una referencia subida.
  if (latest.reference_images.length === 0 && latest.style_id == null) {
    return {
      producto: "done",
      estilo: "active",
      formato: "pending",
      version: "pending",
    };
  }
  if (latest.variations_default < 1) {
    return {
      producto: "done",
      estilo: "done",
      formato: "active",
      version: "pending",
    };
  }

  // Tiene look + formato OK. Vemos las generations de esa versión.
  const latestGens = generations.filter((g) => g.version_id === latest.id);
  const hasCompleted = latestGens.some((g) => g.status === "completed");
  if (hasCompleted) {
    return {
      producto: "done",
      estilo: "done",
      formato: "done",
      version: "done",
    };
  }
  return {
    producto: "done",
    estilo: "done",
    formato: "done",
    version: "active",
  };
}

/**
 * Cuenta imágenes generadas cuyo `created_at` cae en un mes calendario dado.
 * `monthsAgo = 0` es el mes actual, `1` el anterior. Es la métrica real de
 * "imágenes este mes": cada variación generada es una fila en `generated_images`.
 */
function countImagesInMonth(
  images: GeneratedImage[],
  monthsAgo: number,
): number {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  const y = target.getFullYear();
  const m = target.getMonth();
  let count = 0;
  for (const img of images) {
    const ts = new Date(img.created_at);
    if (ts.getFullYear() === y && ts.getMonth() === m) count += 1;
  }
  return count;
}

/**
 * Serie de los últimos 7 días (un bucket por día, [d-6 … hoy]) contando
 * elementos por su `created_at`. Genérica para imágenes o productos. Si la
 * serie queda toda en 0, devuelve null para que el caller oculte el sparkline
 * (no inventamos una curva: tile sin actividad = sin sparkline).
 */
function buildLast7DaysSpark(items: { created_at: string }[]): number[] | null {
  const buckets = new Array(7).fill(0) as number[];
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startMs = startOfToday.getTime() - 6 * 24 * 60 * 60 * 1000;
  for (const it of items) {
    const ts = Date.parse(it.created_at);
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

/** Cuenta imágenes marcadas como descargadas (`is_downloaded`). */
function countDownloads(images: GeneratedImage[]): number {
  let n = 0;
  for (const img of images) if (img.is_downloaded) n += 1;
  return n;
}

/** Cuenta elementos creados dentro de los últimos `days` días. */
function countCreatedWithinDays(
  items: { created_at: string }[],
  days: number,
): number {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  let n = 0;
  for (const it of items) {
    const ts = Date.parse(it.created_at);
    if (!Number.isNaN(ts) && ts >= since) n += 1;
  }
  return n;
}

/**
 * Delta porcentual honesto entre dos períodos. Devuelve null cuando no hay
 * base de comparación (período anterior en 0): preferimos NO mostrar delta a
 * inventar un "+100%". El signo va incluido en `value`.
 */
function pctDelta(
  current: number,
  previous: number,
): { value: string; positive: boolean } | null {
  if (previous <= 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return null;
  return { value: `${pct > 0 ? "+" : ""}${pct}%`, positive: pct >= 0 };
}

/**
 * Estimación de minutos ahorrados a partir de imágenes reales generadas. NO es
 * un cronómetro: es una estimación conservadora — cada foto de producto usable
 * (montaje + disparo + edición) ronda los 15 min de trabajo manual que la
 * generación evita. Se mueve con el output real del usuario, no es un número fijo.
 */
const MINUTES_SAVED_PER_IMAGE = 15;

function formatTimeSaved(imageCount: number): string {
  const minutes = imageCount * MINUTES_SAVED_PER_IMAGE;
  if (minutes < 60) return `${minutes} min`;
  return `${Math.round(minutes / 60)} h`;
}

/**
 * Producto con más generaciones asociadas (por `project_id`) — el "más
 * fotografiado" real. Devuelve null si ninguna generación tiene producto.
 */
function getFeaturedProduct(
  generations: Generation[],
  products: Product[],
): Product | null {
  const counts = new Map<string, number>();
  for (const g of generations) {
    if (!g.project_id) continue;
    counts.set(g.project_id, (counts.get(g.project_id) ?? 0) + 1);
  }
  let bestId: string | null = null;
  let best = 0;
  for (const [id, n] of counts) {
    if (n > best) {
      best = n;
      bestId = id;
    }
  }
  if (!bestId) return null;
  return products.find((p) => p.id === bestId) ?? null;
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
    // Usuario sin datos: no hay actividad real que mostrar. Devolvemos []
    // y <ActivityTimeline> pinta su empty state ("Sin actividad reciente.").
    return [];
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


/* ─────────────────────────────────────────────────────────────────────────
 * Page
 * ───────────────────────────────────────────────────────────────────────── */

export default function DashboardPage() {
  const negocio = useNegocio();
  const products = useProducts();
  const generations = useGenerations();
  const versions = useVersions();
  const { user } = useUser();
  const initials = useUserInitials();

  const allHydrated =
    negocio.hydrated &&
    products.hydrated &&
    generations.hydrated &&
    versions.hydrated;

  // Nombre para el saludo: display_name del user auth, o fallback al email,
  // o "Nati" si por alguna razón no hay user (no debería pasar — el middleware
  // ya redirige a /login).
  const userMeta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const userDisplayName =
    typeof userMeta.display_name === "string" && userMeta.display_name.trim()
      ? userMeta.display_name.trim()
      : user?.email?.split("@")[0] ?? "Nati";
  // Solo el primer nombre para el saludo (más natural que el nombre completo).
  const displayName = userDisplayName.split(/\s+/)[0] ?? userDisplayName;

  return (
    <div className="px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-6xl">
        {!allHydrated ? (
          <DashboardSkeleton />
        ) : (
          <DashboardContent
            displayName={displayName}
            initials={initials}
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
  displayName,
  initials,
  products,
  generations,
  versions,
}: {
  displayName: string;
  initials: string;
  products: ReturnType<typeof useProducts>;
  generations: ReturnType<typeof useGenerations>;
  versions: ReturnType<typeof useVersions>;
}) {
  const recentGenerations = generations.getRecent(8);
  const productsCount = products.state.products.length;
  const lastProduct = products.getRecent(1)[0];
  const ctaHref = nuevaImagenHref(productsCount);
  const now = new Date();
  const eyebrowDate = formatEyebrowDate(now);
  const saludo = getSaludo(now);

  const allGenerations = generations.state.generations;
  const allImages = generations.state.images;
  const allProducts = products.state.products;

  // Métricas 100% reales — sin fallbacks inventados.
  const imagesThisMonth = countImagesInMonth(allImages, 0);
  const imagesPrevMonth = countImagesInMonth(allImages, 1);
  const imagesDelta = pctDelta(imagesThisMonth, imagesPrevMonth);
  const imagesThisWeek = countCreatedWithinDays(allImages, 7);
  const downloads = countDownloads(allImages);
  const newProductsThisWeek = countCreatedWithinDays(allProducts, 7);
  const timeSaved = formatTimeSaved(imagesThisMonth);

  // Captions honestos para cuando NO hay delta mes-a-mes (ej. primer mes con
  // actividad): contexto real derivado de la data, sin inventar porcentajes.
  // El MetricTile los muestra solo si no hay delta.
  const imagesCaption =
    imagesThisWeek > 0
      ? `${imagesThisWeek} esta semana`
      : imagesThisMonth > 0
        ? "este mes"
        : undefined;
  const downloadsCaption =
    allImages.length > 0 ? `de ${allImages.length} generadas` : undefined;
  const timeSavedCaption =
    imagesThisMonth > 0
      ? `sobre ${imagesThisMonth} ${imagesThisMonth === 1 ? "imagen" : "imágenes"}`
      : undefined;

  // El usuario es "nuevo" si no tiene NI productos NI generaciones: en vez de
  // KPIs en cero con deltas vacíos, el header le da un mensaje de bienvenida.
  const isNewUser = productsCount === 0 && allGenerations.length === 0;

  // Producto más fotografiado real (por cantidad de generaciones).
  const featured = getFeaturedProduct(allGenerations, allProducts);

  // Workflow state — basado en si hay productos, versiones, refs y generations.
  const workflow = getWorkflowState(
    productsCount,
    versions.state.versions,
    allGenerations,
  );

  // Activity events — derivados de data real (o [] si no hay nada).
  const events = buildActivityEvents(
    allGenerations,
    allProducts,
    versions.state.versions,
  );

  // Sparklines reales (últimos 7 días). `undefined` → el MetricTile oculta el
  // sparkline en vez de pintar una curva inventada.
  const sparkImages = buildLast7DaysSpark(allImages) ?? undefined;
  const sparkProducts = buildLast7DaysSpark(allProducts) ?? undefined;

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
            {isNewUser ? (
              "Subí tu primer producto y convertilo en imágenes profesionales en segundos."
            ) : (
              <>
                Esta semana generaste{" "}
                <span className="text-ink">{imagesThisWeek}</span>{" "}
                {imagesThisWeek === 1 ? "imagen" : "imágenes"}.
                {featured ? (
                  <>
                    {" "}
                    <span className="display-serif-italic text-ink">
                      {featured.name}
                    </span>{" "}
                    es tu producto más fotografiado.
                  </>
                ) : null}
              </>
            )}
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
          value={imagesThisMonth}
          delta={imagesDelta ?? undefined}
          deltaLabel={imagesDelta ? "vs mes anterior" : undefined}
          caption={imagesCaption}
          sparkline={sparkImages}
        />
        <MetricTile
          label="DESCARGAS"
          value={downloads}
          caption={downloadsCaption}
        />
        <MetricTile
          label="PRODUCTOS ACTIVOS"
          value={productsCount}
          delta={
            newProductsThisWeek > 0
              ? { value: `+${newProductsThisWeek}`, positive: true }
              : undefined
          }
          deltaLabel={newProductsThisWeek > 0 ? "esta semana" : undefined}
          sparkline={sparkProducts}
        />
        <MetricTile
          label="TIEMPO AHORRADO"
          value={timeSaved}
          delta={imagesDelta ?? undefined}
          deltaLabel={imagesDelta ? "vs mes anterior" : undefined}
          caption={timeSavedCaption}
          sparkline={sparkImages}
        />
      </section>

      {/* 3. Nueva generación + Actividad */}
      <section className="mt-6 grid gap-4 sm:mt-8 lg:grid-cols-[1.4fr_1fr]">
        {/* Card izquierda — Nueva generación */}
        <div className="glass-card relative flex flex-col gap-5 overflow-hidden p-6 sm:p-7">
          {/* Acento decorativo cálido (mismo lenguaje que el shell) */}
          <span
            aria-hidden
            className="pointer-events-none absolute -right-12 -top-12 z-0 h-48 w-48 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(201,166,64,0.28), transparent 68%)",
            }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -bottom-16 -left-10 z-0 h-44 w-44 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(126,154,117,0.22), transparent 70%)",
            }}
          />

          <span className="eyebrow relative z-[1]">NUEVA GENERACIÓN</span>
          <h2 className="relative z-[1] display-serif text-2xl leading-tight text-ink sm:text-[30px]">
            Empezá desde cero{" "}
            <span className="display-serif-italic text-sage-strong">
              o seguí donde quedaste
            </span>
            .
          </h2>

          <div className="relative z-[1] flex flex-wrap items-center gap-2">
            <WorkflowChip label="Producto" state={workflow.producto} />
            <span className="text-mute" aria-hidden>
              →
            </span>
            <WorkflowChip label="Estilo" state={workflow.estilo} />
            <span className="text-mute" aria-hidden>
              →
            </span>
            <WorkflowChip label="Formato" state={workflow.formato} />
            <span className="text-mute" aria-hidden>
              →
            </span>
            <WorkflowChip label="Versión" state={workflow.version} />
          </div>

          <div className="relative z-[1] mt-1 flex flex-wrap items-center gap-4">
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
              // La generación se ve dentro del detalle de su versión
              // (`/fabrica/[versionId]`). Si no tiene version_id mandamos a la
              // Fábrica (inbox) en vez de a una ruta inexistente — antes
              // apuntaba a `/proyectos/{id}`, que no existe y tiraba 404.
              const genHref = gen.version_id
                ? `/fabrica/${gen.version_id}`
                : "/fabrica";
              // Cover real de la generación: primera imagen asociada a este
              // `gen.id`. Sin esto la card siempre pintaba el placeholder verde
              // (la prop `thumbnailUrl` nunca se pasaba) → "imágenes sin verse".
              const thumbnailUrl = generations.state.images.find(
                (i) => i.generation_id === gen.id,
              )?.image_url;
              return (
                <GenerationCard
                  key={gen.id}
                  id={gen.id}
                  projectName={projectName}
                  ratio={gen.output_ratio}
                  status={gen.status}
                  variations={gen.variations_requested}
                  relativeTime={formatRelativeTime(gen.created_at)}
                  thumbnailUrl={thumbnailUrl}
                  href={genHref}
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
