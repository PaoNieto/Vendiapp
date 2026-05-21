"use client";

/** Inline product selector — grid of products + "create new" tile. */

import Image from "next/image";
import { motion } from "motion/react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export type ProductSelectorOption = {
  id: string;
  /** Nombre del producto. */
  name: string;
  /** Cover opcional. Si falta, gradient placeholder. */
  coverImageUrl?: string;
  /** Cantidad de fotos asociadas — útil para subtítulo del tile. */
  imagesCount: number;
};

export type ProductSelectorProps = {
  /** Productos disponibles para elegir. */
  products: ProductSelectorOption[];
  /** Callback al elegir un producto existente. */
  onSelect: (productId: string) => void;
  /** Callback al hacer click en "Crear nuevo producto". */
  onCreateNew: () => void;
  /** className passthrough sobre el contenedor. */
  className?: string;
};

/**
 * ProductSelector
 *
 * Selector inline (NO modal). Renderiza un header sutil, un grid responsivo de
 * cards de selección + un tile final dashed "Crear nuevo producto". `frontend`
 * decide si lo monta en una página propia o adentro de un modal.
 *
 * Cada card de selección es más liviana que `<ProductCard>`: thumb 4/5 +
 * nombre + label "Elegir" sutil. Sin contadores ni descripciones.
 */
export function ProductSelector({
  products,
  onSelect,
  onCreateNew,
  className,
}: ProductSelectorProps) {
  return (
    <div className={cn("flex flex-col", className)}>
      <header>
        <h2 className="text-lg font-medium text-green-dark">
          ¿Sobre qué producto generamos?
        </h2>
        <p className="mt-1 text-sm text-green-text">
          Elegí uno de tu catálogo o creá uno nuevo.
        </p>
      </header>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {products.map((product) => (
          <ProductSelectorTile
            key={product.id}
            product={product}
            onSelect={onSelect}
          />
        ))}

        <CreateNewTile onCreateNew={onCreateNew} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Internos                                                            */
/* ------------------------------------------------------------------ */

type TileProps = {
  product: ProductSelectorOption;
  onSelect: (productId: string) => void;
};

function ProductSelectorTile({ product, onSelect }: TileProps) {
  return (
    <motion.button
      type="button"
      onClick={() => onSelect(product.id)}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="group glass-card-compact overflow-hidden text-left hover:shadow-[0_18px_40px_rgba(15,40,24,0.18),inset_0_1px_0_rgba(255,255,255,0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-dark/40"
    >
      <div className="flex flex-col">
        {/* Thumbnail 4/5 */}
        <div className="relative w-full aspect-[4/5] overflow-hidden">
          {product.coverImageUrl ? (
            <Image
              src={product.coverImageUrl}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 320px"
              className="object-cover transition-transform duration-200 ease-out group-hover:scale-[1.02]"
            />
          ) : (
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(135deg, var(--color-green-bg-start) 0%, var(--color-green-bg-mid) 50%, var(--color-green-bg-end) 100%)",
              }}
            />
          )}
        </div>

        {/* Body */}
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <span
            className="truncate text-sm font-medium text-green-dark"
            title={product.name}
          >
            {product.name}
          </span>
          <span className="shrink-0 rounded-full bg-green-dark/10 px-2.5 py-1 text-[11px] font-medium text-green-dark">
            Elegir
          </span>
        </div>
      </div>
    </motion.button>
  );
}

type CreateNewTileProps = {
  onCreateNew: () => void;
};

function CreateNewTile({ onCreateNew }: CreateNewTileProps) {
  return (
    <motion.button
      type="button"
      onClick={onCreateNew}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="group flex flex-col items-center justify-center gap-3 rounded-[16px] border border-dashed border-green-dark/25 bg-white/30 px-4 py-10 text-green-dark transition-colors duration-150 ease-out hover:border-green-dark/45 hover:bg-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-dark/40 min-h-[200px]"
    >
      <span
        aria-hidden
        className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-green-dark/10 text-green-dark transition-colors duration-150 ease-out group-hover:bg-green-dark/15"
      >
        <Plus className="h-5 w-5" />
      </span>
      <span className="text-sm font-medium">Crear nuevo producto</span>
    </motion.button>
  );
}
