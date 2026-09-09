"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertCircle, ArrowRight, ImageIcon, Sparkles, X } from "lucide-react";

import {
  AvatarCircle,
  HeroCTAButton,
  PillButton,
} from "@/components/dashboard";
import { Topbar } from "@/components/app/topbar";
import { CreditBadge } from "@/components/app/credit-badge";
import { GeneratingOverlay } from "@/components/app/generating-overlay";
import {
  VersionGallery,
  type VersionSettings,
} from "@/components/app/version-gallery";
import { useGeneracion } from "@/lib/generacion/store";
import { useGenerations } from "@/lib/generations/store";
import { useNegocio } from "@/lib/negocio/store";
import { useUserInitials } from "@/lib/auth/use-user";
import { useProducts } from "@/lib/products/store";
import { useRecorrido } from "@/lib/recorrido/store";
import { useVersions } from "@/lib/versions/store";
import type { Product } from "@/lib/products/store";
import type { Version } from "@/lib/versions/store";
import { getStyleFragment, getStyleLabel } from "@/lib/styles";
import { isVersionReady } from "@/lib/validations/recorrido";
import { OUTPUT_RATIOS } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Hoja de versión — la pantalla a la que caés al clickear una versión.
 *
 * Rediseño (2026-09, pedido de Paolo). Antes eran tres tarjetas read-only del
 * mismo peso apretadas arriba y medio viewport vacío abajo. Los tres problemas
 * y sus arreglos:
 *
 *  1. **Sin jerarquía.** El producto —sujeto de toda la pantalla— entraba como
 *     miniatura de 74px. Ahora es la foto principal, a la izquierda de una sola
 *     hoja que ocupa el alto disponible.
 *
 *  2. **Nada decía qué ibas a recibir.** A la derecha se dibujan N ranuras
 *     vacías EN EL RATIO REAL de salida (`output_ratio`), tantas como
 *     `variations_default`. Son el molde: ves forma y cantidad antes de gastar
 *     un crédito.
 *
 *  3. **El salto a la Fábrica.** Al terminar, la página hacía
 *     `location.assign('/fabrica/<id>')` porque no tenía dónde mostrar el
 *     resultado. Con el molde dibujado ese salto sobra: las imágenes llegan al
 *     mismo hueco que las prometía. `/fabrica/[versionId]` queda para el
 *     acumulado de TODAS las tandas.
 *
 * Además, editar la receta (refs/estilo/formato) de una versión que YA generó
 * **bifurca** en vez de pisar — ver `openRecipeStation`.
 */
/**
 * Key efímera de `sessionStorage` para pasar el aviso de entrega parcial a
 * través de la recarga que hacemos al terminar de generar.
 */
const PARTIAL_DELIVERY_KEY = "vendi:partial-delivery";

export default function VersionDetailPage() {
  const params = useParams<{ id: string; versionId: string }>();
  const router = useRouter();
  const products = useProducts();
  const versions = useVersions();
  const generations = useGenerations();
  const recorrido = useRecorrido();
  const negocio = useNegocio();
  const generacion = useGeneracion();
  const brandInitials = useUserInitials();

  const productId = params.id;
  const versionId = params.versionId;
  const allHydrated =
    products.hydrated &&
    versions.hydrated &&
    generations.hydrated &&
    negocio.hydrated;

  const product = productId ? products.getById(productId) : undefined;
  const version = versionId ? versions.getById(versionId) : undefined;

  useEffect(() => {
    if (!allHydrated) return;
    if (!product || !version || version.product_id !== product.id) {
      router.replace("/productos");
    }
  }, [allHydrated, product, version, router]);

  // Derivaciones — React Compiler las memoiza automáticamente.
  const versionGenerations = version
    ? generations.getByVersionId(version.id)
    : [];

  // `getByVersionId` devuelve las generaciones más nuevas primero, así que la
  // ÚLTIMA tanda completada es la primera completada de la lista. Esa es la que
  // va en el molde; el acumulado de todas vive en la Fábrica.
  const latestBatch = versionGenerations.find((g) => g.status === "completed");
  const latestBatchImages = latestBatch
    ? generations.state.images.filter(
        (img) => img.generation_id === latestBatch.id,
      )
    : [];

  // Total acumulado de la versión — alimenta el link a la Fábrica en la ficha.
  const totalImagesCount = (() => {
    if (!version) return 0;
    const completedIds = new Set(
      versionGenerations
        .filter((g) => g.status === "completed")
        .map((g) => g.id),
    );
    if (completedIds.size === 0) return 0;
    return generations.state.images.filter((img) =>
      completedIds.has(img.generation_id),
    ).length;
  })();

  // Banner de error inline cuando la generación falla. Mismo patrón que en
  // `/fabrica`: el sentinel `"missing_key"` activa copy + CTA específicos.
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  // Lock para evitar dobles clicks mientras una tanda está en curso.
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Aviso de entrega parcial, sobreviviendo a la recarga que hacemos al
  // terminar de generar. Se lee UNA vez y se borra: no queremos que reaparezca
  // en cada visita a la pantalla.
  const [partialDelivery, setPartialDelivery] = useState<{
    delivered: number;
    requested: number;
    refunded: number;
  } | null>(null);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PARTIAL_DELIVERY_KEY);
      if (!raw) return;
      sessionStorage.removeItem(PARTIAL_DELIVERY_KEY);
      const parsed = JSON.parse(raw) as unknown;
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        typeof (parsed as { delivered?: unknown }).delivered === "number" &&
        typeof (parsed as { requested?: unknown }).requested === "number"
      ) {
        const note = parsed as {
          delivered: number;
          requested: number;
          refunded?: number;
        };
        // eslint-disable-next-line react-hooks/set-state-in-effect -- lectura de sessionStorage post-mount; el SSR no tiene acceso. Mismo patrón que la hidratación de los stores.
        setPartialDelivery({
          delivered: note.delivered,
          requested: note.requested,
          refunded: typeof note.refunded === "number" ? note.refunded : 0,
        });
      }
    } catch {
      // Storage bloqueado o JSON corrupto: sin aviso, sin romper la pantalla.
    }
  }, []);

  async function handleGenerate() {
    if (!product || !version) return;
    if (!isVersionReady(version)) return;
    if (isSubmitting) return;

    setErrorBanner(null);
    setIsSubmitting(true);

    try {
      // Modelo de créditos: generación SERVER-SIDE con la key propia de Vendí.
      const res = await fetch("/api/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          versionId: version.id,
          styleFragment: getStyleFragment(generacion.state.selectedStyleId),
          // Identidad de marca → el Director la usa para que las imágenes salgan
          // coherentes con la marca del usuario.
          brand: {
            name: negocio.state.brandName,
            industry: negocio.state.industry,
            description: negocio.state.description,
          },
        }),
      });

      if (res.status === 402) {
        setErrorBanner("insufficient_credits");
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { message?: string; error?: string }
          | null;
        setErrorBanner(
          data?.message ?? data?.error ?? "No se pudo generar. Intentá de nuevo.",
        );
        return;
      }

      // Entrega PARCIAL: el server puede entregar menos de lo pedido (una
      // variación que Gemini rechazó, un post-proceso que falló) y ya te
      // reembolsó la diferencia — pero hasta ahora no te lo decía nadie, y
      // contabas 3 fotos donde pediste 5 pensando que habías contado mal.
      // Lo dejamos anotado para mostrarlo del otro lado de la recarga.
      const data = (await res.json().catch(() => null)) as
        | { delivered?: number; requested?: number; refunded?: number }
        | null;
      if (
        typeof data?.delivered === "number" &&
        typeof data?.requested === "number" &&
        data.delivered < data.requested
      ) {
        try {
          sessionStorage.setItem(
            PARTIAL_DELIVERY_KEY,
            JSON.stringify({
              delivered: data.delivered,
              requested: data.requested,
              // Puede ser 0: los ilimitados no reciben reembolso porque nunca
              // se les descontó. No les prometemos créditos de vuelta.
              refunded: typeof data.refunded === "number" ? data.refunded : 0,
            }),
          );
        } catch {
          // Modo privado / storage bloqueado: perder el aviso no es crítico.
        }
      }

      // Nos QUEDAMOS acá: las imágenes llenan el molde que el usuario ya está
      // mirando. Recargamos (en vez de router.refresh) para que los stores
      // re-hidraten desde la DB con lo que acaba de escribir el server. Antes
      // esto navegaba a `/fabrica/<id>`.
      window.location.reload();
    } catch {
      setErrorBanner(
        "No se pudo conectar. Revisá tu internet e intentá de nuevo.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  /**
   * Abre una estación de receta (`/estilo` o `/formato`) para esta versión.
   *
   * Si la versión YA produjo imágenes, editar su receta en el lugar dejaría un
   * registro que miente: la ficha diría "3 referencias" mientras las fotos se
   * hicieron con 2, y no habría forma de notarlo mirando. Así que bifurcamos —
   * duplicamos la versión (misma receta, SIN generaciones, ver
   * `duplicateVersion`) y mandamos a editar la copia. La original conserva sus
   * fotos junto a la receta que de verdad las produjo.
   *
   * Si todavía no generó nada no hay nada que invalidar: se edita en el lugar.
   */
  function openRecipeStation(station: "/estilo" | "/formato") {
    if (!product || !version) return;

    if (totalImagesCount > 0) {
      const fork = versions.duplicateVersion(version.id);
      if (fork) {
        recorrido.setState({
          productId: product.id,
          versionId: fork.id,
          forkedFrom: version.id,
        });
        router.push(station);
        return;
      }
      // Si la duplicación falla seguimos derecho a editar la original: es
      // preferible a dejar al usuario sin poder tocar nada.
    }

    recorrido.setState({
      productId: product.id,
      versionId: version.id,
      forkedFrom: null,
    });
    router.push(station);
  }

  if (!allHydrated || !product || !version) {
    return <VersionSkeleton />;
  }

  const ratioInfo = OUTPUT_RATIOS.find((r) => r.value === version.output_ratio);
  const styleLabel = getStyleLabel(version.style_id);
  const hasGenerated = latestBatchImages.length > 0;
  const versionSettings: VersionSettings = {
    outputRatio: version.output_ratio,
    ratioLabel: ratioInfo?.label ?? null,
    referencesCount: version.reference_images.length,
    styleLabel,
  };

  return (
    <>
      <Topbar
        eyebrow={`${product.name.toUpperCase()} · VERSIÓN`}
        title={version.name}
        subtitle={
          hasGenerated
            ? "Tocá una imagen para verla en grande o regenerarla."
            : "Revisá la receta y mandala a la Fábrica."
        }
        right={
          <>
            <CreditBadge showBuy={false} />
            <AvatarCircle initials={brandInitials} size={40} />
          </>
        }
      />

      <div className="flex flex-1 flex-col gap-4 px-5 pb-8 pt-2 sm:px-8 lg:px-10">
        <Breadcrumb product={product} versionName={version.name} />

        {errorBanner ? (
          <ErrorBanner
            message={errorBanner}
            onDismiss={() => setErrorBanner(null)}
          />
        ) : null}

        {partialDelivery ? (
          <PartialDeliveryBanner
            delivered={partialDelivery.delivered}
            requested={partialDelivery.requested}
            refunded={partialDelivery.refunded}
            onDismiss={() => setPartialDelivery(null)}
          />
        ) : null}

        {/*
          UNA hoja que ocupa el alto disponible, partida por un filete: a la
          izquierda el producto (el sujeto), a la derecha la tanda (el
          resultado). Antes eran cuatro tarjetas sueltas del mismo peso, que es
          lo que hacía ver la pantalla plana.
        */}
        <div className="glass-card flex flex-1 flex-col overflow-hidden lg:grid lg:grid-cols-[248px_1px_minmax(0,1fr)]">
          <ProductPanel
            product={product}
            version={version}
            forks={totalImagesCount > 0}
            onEditReferences={() => openRecipeStation("/estilo")}
          />

          <div aria-hidden className="hidden bg-border lg:block" />

          <BatchPanel
            version={version}
            versionSettings={versionSettings}
            images={latestBatchImages}
            totalImagesCount={totalImagesCount}
            styleLabel={styleLabel}
            ratioLabel={ratioInfo?.label ?? null}
            isSubmitting={isSubmitting}
            forks={totalImagesCount > 0}
            onGenerate={handleGenerate}
            onEditFormato={() => openRecipeStation("/formato")}
            onEditStyle={() => openRecipeStation("/estilo")}
          />
        </div>
      </div>

      {isSubmitting ? <GeneratingOverlay /> : null}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Breadcrumb                                                                 */
/* -------------------------------------------------------------------------- */

function Breadcrumb({
  product,
  versionName,
}: {
  product: Product;
  versionName: string;
}) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1.5 text-xs font-semibold text-mute-on-bg"
    >
      <Link
        href={`/productos/${product.id}`}
        className="hover:text-foreground hover:underline"
      >
        {product.name}
      </Link>
      <span aria-hidden className="opacity-50">/</span>
      <span>Versiones</span>
      <span aria-hidden className="opacity-50">/</span>
      <span className="font-bold text-foreground">{versionName}</span>
    </nav>
  );
}

/* -------------------------------------------------------------------------- */
/*  Panel izquierdo — el producto, su identidad y sus referencias              */
/* -------------------------------------------------------------------------- */

function ProductPanel({
  product,
  version,
  forks,
  onEditReferences,
}: {
  product: Product;
  version: Version;
  /** `true` si tocar "cambiar" va a crear una versión nueva en vez de pisar. */
  forks: boolean;
  onEditReferences: () => void;
}) {
  const cover = product.cover_image_url ?? product.product_images[0];
  const photosCount = product.product_images.length;
  const refs = version.reference_images;

  return (
    <div className="flex flex-col gap-5 p-5 sm:p-6">
      <div>
        {/*
          La foto lleva sombra propia para despegarse de la hoja: es el único
          elemento "físico" de la pantalla y tiene que leerse como tal. En dark
          la sombra va más profunda porque sobre near-black se pierde antes.
        */}
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl border border-border bg-card-cream/60 shadow-[0_18px_36px_-18px_rgba(15,31,22,0.45)] dark:shadow-[0_22px_44px_-20px_rgba(0,0,0,0.9)]">
          {cover ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={cover}
              alt={product.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-mute">
              <ImageIcon className="h-7 w-7" strokeWidth={1.5} />
            </div>
          )}
        </div>

        <div className="mt-3 flex items-baseline justify-between gap-3">
          <div
            className="min-w-0 truncate font-display text-[24px] italic leading-tight text-foreground"
            title={product.name}
          >
            {product.name}
          </div>
          <Link
            href={`/productos/${product.id}`}
            className="shrink-0 text-[11.5px] font-bold text-sage-strong hover:underline"
          >
            Ver
          </Link>
        </div>
        <div className="text-xs font-medium text-mute">
          {photosCount} {photosCount === 1 ? "foto" : "fotos"}
        </div>
      </div>

      <VersionIdentity version={version} />

      <div className="mt-auto">
        <div className="flex items-center justify-between gap-3">
          <span className="eyebrow">REFERENCIAS</span>
          <button
            type="button"
            onClick={onEditReferences}
            className="text-[11.5px] font-bold text-sage-strong hover:underline"
          >
            {forks ? "Cambiar" : "Editar"}
          </button>
        </div>

        {refs.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {refs.slice(0, 4).map((url) => (
              <div
                key={url}
                className="relative h-[46px] w-[46px] shrink-0 overflow-hidden rounded-lg border border-border bg-card-cream/60"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt="Referencia"
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
            {refs.length > 4 ? (
              <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-lg border border-border bg-card-cream/60 font-mono text-[12px] font-bold text-mute">
                +{refs.length - 4}
              </div>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            onClick={onEditReferences}
            aria-label="Agregar referencias"
            className="mt-2.5 flex h-[46px] w-[46px] items-center justify-center rounded-lg border border-dashed border-foreground/20 bg-card-cream/40 text-mute transition-colors hover:border-sage-strong/50 hover:text-foreground"
          >
            <ImageIcon className="h-4 w-4" strokeWidth={1.6} />
          </button>
        )}

        {forks ? (
          <p className="mt-2.5 text-[11px] font-medium leading-snug text-mute">
            Cambiar la receta crea una versión nueva. Estas fotos quedan como
            están.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Nombre + descripción de la versión (editables)                             */
/* -------------------------------------------------------------------------- */

/**
 * Antes el nombre sólo se elegía al crear la versión y no había forma de
 * cambiarlo — molesto ahora que las bifurcaciones se autonombran `· v2`.
 *
 * Guardamos en `blur` (y con Enter en el nombre) en vez de debouncear: ninguno
 * de los dos campos entra en la generación, así que no hay carrera posible con
 * el botón de Generar, y evitamos escribir en cada tecla.
 */
function VersionIdentity({ version }: { version: Version }) {
  const versions = useVersions();

  const [name, setName] = useState(version.name);
  const [description, setDescription] = useState(version.description ?? "");

  // Re-sincronizamos si cambia la versión mostrada (navegar entre versiones sin
  // desmontar el componente). Comparamos por id para no pisar lo que el usuario
  // está escribiendo mientras un guardado anterior vuelve del server.
  const [syncedId, setSyncedId] = useState(version.id);
  if (syncedId !== version.id) {
    setSyncedId(version.id);
    setName(version.name);
    setDescription(version.description ?? "");
  }

  function commitName() {
    const next = name.trim().slice(0, 60);
    if (next.length === 0) {
      setName(version.name); // Vacío no es un nombre: revertimos.
      return;
    }
    if (next !== version.name) {
      versions.updateVersion(version.id, { name: next });
    }
    setName(next);
  }

  function commitDescription() {
    const next = description.trim();
    if (next !== (version.description ?? "")) {
      versions.updateVersion(version.id, { description: next || null });
    }
    setDescription(next);
  }

  const fieldClass =
    "w-full rounded-lg border border-border bg-card-cream/40 px-2.5 py-1.5 text-foreground outline-none transition-colors placeholder:text-mute/70 focus-visible:border-sage-strong/60 focus-visible:ring-2 focus-visible:ring-sage-strong/25";

  return (
    <div className="flex flex-col gap-2">
      <label className="eyebrow" htmlFor="version-name">
        ESTA VERSIÓN
      </label>
      <input
        id="version-name"
        value={name}
        maxLength={60}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        placeholder="Nombre de la versión"
        className={cn(fieldClass, "text-[13px] font-semibold")}
      />
      <textarea
        value={description}
        rows={2}
        maxLength={160}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={commitDescription}
        placeholder="Para qué es (opcional)"
        aria-label="Descripción de la versión"
        className={cn(
          fieldClass,
          "resize-none text-[12px] font-medium leading-relaxed",
        )}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Panel derecho — la tanda: molde vacío o imágenes, + ficha técnica          */
/* -------------------------------------------------------------------------- */

/** Las imágenes que consume `VersionGallery` — tomamos su tipo de la prop. */
type BatchImages = React.ComponentProps<typeof VersionGallery>["images"];

function BatchPanel({
  version,
  versionSettings,
  images,
  totalImagesCount,
  styleLabel,
  ratioLabel,
  isSubmitting,
  forks,
  onGenerate,
  onEditFormato,
  onEditStyle,
}: {
  version: Version;
  versionSettings: VersionSettings;
  images: BatchImages;
  totalImagesCount: number;
  styleLabel: string | null;
  ratioLabel: string | null;
  isSubmitting: boolean;
  forks: boolean;
  onGenerate: () => void;
  onEditFormato: () => void;
  onEditStyle: () => void;
}) {
  const hasImages = images.length > 0;
  const count = version.variations_default;
  const ready = isVersionReady(version);
  const canGenerate = ready && !isSubmitting;

  const ctaLabel = isSubmitting
    ? "Generando…"
    : hasImages
      ? "Más variaciones"
      : "Generar primera tanda";

  // "Vertical historia" → "verticales": el label del ratio ya nombra la forma,
  // así el título se lee como una frase ("5 verticales 9:16") en vez de repetir
  // "imágenes" al lado del número.
  const shapeWord = ratioLabel
    ? `${ratioLabel.split(" ")[0].toLowerCase()}es`.replace(/oes$/, "os")
    : "imágenes";

  return (
    <div className="flex min-w-0 flex-col p-5 sm:p-6">
      <div>
        <span className="eyebrow">
          {hasImages ? "ESTA TANDA" : "VAS A GENERAR"}
        </span>
        <h2 className="mt-1 font-display text-[28px] italic leading-tight text-foreground">
          <span className="tabular-nums">
            {hasImages ? images.length : count}
          </span>{" "}
          {shapeWord}
          <span className="ml-2 rounded-md border border-border bg-card-cream/60 px-1.5 py-0.5 align-middle font-mono text-[15px] font-bold not-italic">
            {version.output_ratio}
          </span>
        </h2>
        <p className="mt-1.5 max-w-md text-xs font-medium leading-relaxed text-mute-on-bg">
          {hasImages
            ? "Tocá cualquiera para verla en grande, descargarla o regenerarla."
            : "Se llenan acá mismo, una por una. Tarda alrededor de un minuto."}
        </p>
      </div>

      <div className="mt-5 flex flex-1 items-start">
        {hasImages ? (
          <div className="w-full">
            <VersionGallery
              images={images}
              versionSettings={versionSettings}
              variant="batch"
              onGenerateMore={onGenerate}
            />
          </div>
        ) : (
          <GhostSlots count={count} ratio={version.output_ratio} />
        )}
      </div>

      <SpecBar
        version={version}
        ratioLabel={ratioLabel}
        styleLabel={styleLabel}
        totalImagesCount={totalImagesCount}
        forks={forks}
        onEditFormato={onEditFormato}
        onEditStyle={onEditStyle}
      >
        <div className="flex flex-col gap-1.5 sm:items-end">
          {/* `HeroCTAButton` no expone `disabled` (es compartido) — lo apagamos
              desde el wrapper, igual que en el resto de la app. */}
          <div
            className={
              !canGenerate ? "pointer-events-none opacity-50" : undefined
            }
            aria-disabled={!canGenerate}
          >
            {hasImages ? (
              <PillButton size="md" onClick={onGenerate}>
                <Sparkles className="h-4 w-4" />
                {ctaLabel}
              </PillButton>
            ) : (
              <HeroCTAButton icon={Sparkles} onClick={onGenerate}>
                {ctaLabel}
              </HeroCTAButton>
            )}
          </div>
          {isSubmitting ? (
            <span className="text-[11px] text-mute">
              Tarda 5-30s según cantidad de variaciones.
            </span>
          ) : !ready ? (
            /* El texto viejo decía "subí al menos 1 referencia", pero
               `isVersionReady` NO pide referencias (son opcionales desde que el
               estilo profesional puede ir solo). Valida nombre, ratio y
               cantidad de variaciones. */
            <span className="text-[11px] text-mute">
              Completá nombre y formato para habilitar.
            </span>
          ) : null}
        </div>
      </SpecBar>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  El molde: N ranuras vacías en el ratio real de salida                      */
/* -------------------------------------------------------------------------- */

/**
 * No es decoración ni un placeholder de carga: es la promesa de la tanda. Se
 * dibujan tantas ranuras como `variations_default`, cada una en el
 * `output_ratio` elegido, así el usuario ve FORMA y CANTIDAD de lo que va a
 * recibir antes de gastar un crédito. Al generar, estas mismas posiciones se
 * llenan con las imágenes (`VersionGallery variant="batch"`).
 *
 * Van HUNDIDAS (sombra interior) a propósito: son el contrapunto que hace que
 * la hoja se lea como levantada. Sin nada hundido todo queda al mismo nivel y
 * la pantalla se ve plana — que era justamente el problema a resolver.
 */
function GhostSlots({ count, ratio }: { count: number; ratio: string }) {
  const aspect = ratio.replace(":", " / ");

  return (
    // Grid con `auto-fit` en vez de una fila flex: con `variations_default` en
    // su máximo (10) una fila sin envolver se desbordaba del panel. Así las
    // ranuras mantienen ancho parejo y bajan de línea cuando no entran.
    <div
      className="grid w-full gap-3"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(84px, 1fr))" }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          aria-hidden
          style={{ aspectRatio: aspect }}
          className={cn(
            "flex items-center justify-center rounded-xl border border-border",
            "bg-foreground/[0.04] shadow-[inset_0_2px_8px_rgba(15,31,22,0.10)]",
            "dark:bg-black/30 dark:shadow-[inset_0_2px_10px_rgba(0,0,0,0.55),inset_0_-1px_0_rgba(238,229,201,0.05)]",
          )}
        >
          {i === 0 ? (
            <Sparkles className="h-4 w-4 text-sage-strong" strokeWidth={1.8} />
          ) : (
            <span className="font-mono text-[11px] font-bold text-mute/60">
              {i + 1}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Ficha técnica — una línea fina en vez de tres tarjetas del mismo peso      */
/* -------------------------------------------------------------------------- */

function SpecBar({
  version,
  ratioLabel,
  styleLabel,
  totalImagesCount,
  forks,
  onEditFormato,
  onEditStyle,
  children,
}: {
  version: Version;
  ratioLabel: string | null;
  styleLabel: string | null;
  totalImagesCount: number;
  forks: boolean;
  onEditFormato: () => void;
  onEditStyle: () => void;
  /** Slot del CTA, a la derecha de la ficha. */
  children: React.ReactNode;
}) {
  const editLabel = forks ? "Cambiar" : "Editar";

  return (
    <div className="mt-5 flex flex-wrap items-end gap-x-6 gap-y-4 border-t border-border pt-4">
      <SpecItem label="RATIO" value={version.output_ratio} mono>
        <span className="text-[11px] font-medium text-mute">{ratioLabel}</span>
        <button
          type="button"
          onClick={onEditFormato}
          className="text-[11px] font-bold text-sage-strong hover:underline"
        >
          {editLabel}
        </button>
      </SpecItem>

      <SpecItem
        label="POR TANDA"
        value={String(version.variations_default)}
        mono
      >
        <span className="text-[11px] font-medium text-mute">
          {version.variations_default === 1 ? "imagen" : "imágenes"}
        </span>
      </SpecItem>

      <SpecItem label="ESTILO" value={styleLabel ?? "Sin estilo"}>
        <button
          type="button"
          onClick={onEditStyle}
          className="text-[11px] font-bold text-sage-strong hover:underline"
        >
          {styleLabel ? editLabel : "Elegir"}
        </button>
      </SpecItem>

      {totalImagesCount > 0 ? (
        <SpecItem label="GENERADAS" value={String(totalImagesCount)} mono>
          <Link
            href={`/fabrica/${version.id}`}
            className="group inline-flex items-center gap-1 text-[11px] font-bold text-sage-strong hover:underline"
          >
            Ver todas
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </SpecItem>
      ) : null}

      <div className="ml-auto">{children}</div>
    </div>
  );
}

function SpecItem({
  label,
  value,
  mono,
  children,
}: {
  label: string;
  value: string;
  mono?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="eyebrow">{label}</span>
      <span
        className={cn(
          "mt-0.5 truncate text-[17px] font-bold text-foreground",
          mono && "font-mono tabular-nums",
        )}
      >
        {value}
      </span>
      <div className="mt-0.5 flex items-center gap-2">{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Skeleton + helpers                                                         */
/* -------------------------------------------------------------------------- */

function VersionSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-5 px-5 py-6 sm:px-8 sm:py-8 lg:px-10">
      <div className="flex flex-col gap-2">
        <div className="h-3 w-32 animate-pulse rounded-full bg-foreground/10" />
        <div className="h-9 w-64 animate-pulse rounded-full bg-foreground/10" />
      </div>
      <div className="flex flex-1 gap-4">
        <div className="hidden w-[248px] animate-pulse rounded-xl bg-foreground/5 lg:block" />
        <div className="flex-1 animate-pulse rounded-xl bg-foreground/5" />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Aviso de entrega parcial                                                    */
/* -------------------------------------------------------------------------- */

/**
 * "Pediste 5, salieron 3." El server ya reembolsó la diferencia, pero antes no
 * lo decía nadie: el usuario contaba las fotos y quedaba pensando que había
 * elegido mal. No es un error —las que salieron están bien— así que va en tono
 * informativo, no de alerta.
 */
function PartialDeliveryBanner({
  delivered,
  requested,
  refunded,
  onDismiss,
}: {
  delivered: number;
  requested: number;
  /** Créditos devueltos. Es 0 para ilimitados: a ellos nunca se les descontó. */
  refunded: number;
  onDismiss: () => void;
}) {
  const faltaron = requested - delivered;

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-xl border border-border bg-card-cream/70 px-4 py-3 text-sm text-foreground"
    >
      <Sparkles
        className="mt-0.5 h-4 w-4 shrink-0 text-sage-strong"
        strokeWidth={1.8}
        aria-hidden
      />
      <div className="flex-1">
        <p className="font-medium leading-snug">
          Salieron <span className="font-mono font-bold">{delivered}</span> de{" "}
          <span className="font-mono font-bold">{requested}</span> imágenes.
        </p>
        <p className="mt-0.5 text-xs text-mute">
          {faltaron === 1 ? "La que faltó" : "Las que faltaron"} no{" "}
          {faltaron === 1 ? "pasó" : "pasaron"} el control de calidad del modelo.
          {refunded > 0
            ? ` Te devolvimos ${refunded} ${refunded === 1 ? "crédito" : "créditos"}: podés tirar otra tanda sin costo extra.`
            : " Podés tirar otra tanda cuando quieras."}
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Descartar aviso"
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  ErrorBanner                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Mismo banner inline que usa `/fabrica`. Centralizamos un helper local en
 * vez de extraer a `components/` para no inflar la API pública por un caso
 * que sólo se usa en 2 pantallas.
 */
function ErrorBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  const isMissingKey = message === "missing_key";
  const isNoCredits = message === "insufficient_credits";
  const displayMessage = isMissingKey
    ? "Para generar imágenes reales, configurá tu API key de Gemini en Mi Negocio."
    : isNoCredits
      ? "Te quedaste sin créditos. Comprá más para seguir generando."
      : message;

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/[0.06] px-4 py-3 text-sm text-foreground"
    >
      <AlertCircle
        className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
        aria-hidden
      />
      <div className="flex-1">
        <p className="font-medium leading-snug">{displayMessage}</p>
        {isMissingKey ? (
          <Link
            href="/mi-negocio"
            className="mt-1 inline-block text-xs font-semibold text-sage-strong hover:underline"
          >
            Ir a Mi Negocio →
          </Link>
        ) : null}
        {isNoCredits ? (
          <Link
            href="/upgrade"
            className="mt-1 inline-block text-xs font-semibold text-sage-strong hover:underline"
          >
            Comprar créditos →
          </Link>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Descartar mensaje"
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
