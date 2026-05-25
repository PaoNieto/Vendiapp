"use client";

/**
 * FilterBar
 *
 * Barra de filtros para el grid de versiones de la Fábrica. Combina chips
 * de estado (segmented control con `SelectableChip`) + selector de producto
 * (`<select>` nativo estilizado) + contador "{n} versiones".
 *
 * Decisiones:
 * - Usa el `SelectableChip` que ya existe en `components/fabrica/` con
 *   `variant="single"` para que se comporte como radio: el contenedor le
 *   marca uno como `selected` a la vez.
 * - Selector nativo en vez de un dropdown custom — accesible por default,
 *   nativo en mobile (pop-up del SO), cero JS extra y el styling con tw
 *   alcanza para la sensación premium.
 * - Mobile-first: en 375px los chips de estado se apilan en grid de 3
 *   columnas (3 chips fijos: Todas / Listas / Sin generar) y el resto se
 *   stackea vertical. A partir de `sm` todo va en una fila.
 */

import { CheckCircle2, Layers, Sparkles } from "lucide-react";

import { SelectableChip } from "@/components/fabrica/selectable-chip";
import { cn } from "@/lib/utils";

/**
 * El chip "processing" (Generando) se quitó del FilterBar: el flujo va directo
 * "Sin generar" → "Listas". Mientras una versión procesa, sigue contando como
 * `draft` en el inbox (con la lógica de bucket de `fabrica/page.tsx`).
 */
export type FilterStatus = "all" | "completed" | "draft";

/**
 * `productId` puede ser un id concreto o "all" — usamos string literal en vez
 * de `null` para que el `<select>` lo serialice como string sin ambigüedad.
 */
export type FilterProduct = string | "all";

export type FilterBarProps = {
  /** Filtro de estado activo. Controlado por el parent. */
  status: FilterStatus;
  /** Callback al cambiar el filtro de estado. */
  onStatusChange: (status: FilterStatus) => void;
  /** Producto seleccionado (id) o "all". */
  productId: FilterProduct;
  /** Callback al cambiar producto. */
  onProductChange: (productId: FilterProduct) => void;
  /** Productos disponibles para filtrar. Si está vacío, el select se oculta. */
  products: Array<{ id: string; name: string }>;
  /** Cantidad de versiones después de filtrar — se muestra a la derecha. */
  total: number;
  /** className passthrough sobre el wrapper. */
  className?: string;
};

const STATUS_OPTIONS: Array<{
  value: Exclude<FilterStatus, "all">;
  label: string;
  icon: typeof Layers;
}> = [
  { value: "completed", label: "Listas", icon: CheckCircle2 },
  { value: "draft", label: "Sin generar", icon: Sparkles },
];

export function FilterBar({
  status,
  onStatusChange,
  productId,
  onProductChange,
  products,
  total,
  className,
}: FilterBarProps) {
  return (
    <div
      className={cn(
        // Wrapper: glass-card-compact para que se sienta parte del shell sin
        // pesar visualmente. flex-col en mobile, row en sm+. gap distinto en
        // mobile para que respire.
        "glass-card-compact flex flex-col gap-4 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-5",
        className,
      )}
    >
      {/* CHIPS DE ESTADO. 2 chips (Listas / Sin generar). Toggleables: clickear
          el activo lo deselecciona (vuelve a "all" = mostrar todas, implícito). */}
      <div
        role="radiogroup"
        aria-label="Filtrar por estado"
        className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-2"
      >
        {STATUS_OPTIONS.map((opt) => (
          <SelectableChip
            key={opt.value}
            label={opt.label}
            icon={opt.icon}
            selected={status === opt.value}
            onSelect={() =>
              onStatusChange(status === opt.value ? "all" : opt.value)
            }
            variant="single"
          />
        ))}
      </div>

      {/* SELECTOR PRODUCTO + CONTADOR. Stack vertical en mobile, fila en sm+. */}
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        {products.length > 0 ? (
          <label className="flex items-center gap-2">
            <span className="sr-only">Filtrar por producto</span>
            <select
              value={productId}
              onChange={(e) =>
                onProductChange(e.target.value as FilterProduct)
              }
              className={cn(
                "min-h-[40px] cursor-pointer appearance-none rounded-full border border-white/70 bg-white/70 px-4 py-2 pr-9 text-[13px] font-medium text-green-dark shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] transition-colors",
                "hover:bg-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-dark/40",
                // Chevron custom como background-image (no podemos meter un
                // <ChevronDown /> dentro de un <select> nativo).
                "bg-[length:14px_14px] bg-[right_12px_center] bg-no-repeat",
              )}
              style={{
                backgroundImage:
                  // Chevron SVG inline en color green-dark (#0f2818).
                  "url(\"data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%230f2818'%3E%3Cpath fill-rule='evenodd' d='M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.06l3.71-3.83a.75.75 0 0 1 1.08 1.04l-4.25 4.38a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06z' clip-rule='evenodd'/%3E%3C/svg%3E\")",
              }}
            >
              <option value="all">Todos los productos</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <span className="numeric-tabular text-xs text-green-text">
          {total} {total === 1 ? "versión" : "versiones"}
        </span>
      </div>
    </div>
  );
}
