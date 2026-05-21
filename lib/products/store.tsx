"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * Shape espejo de la tabla `public.projects` de Supabase.
 *
 * NOTA DE NOMENCLATURA: en el UI/lenguaje del producto a los `projects` los llamamos
 * "products" desde 2026-05-19. La tabla en Postgres sigue siendo `projects` para no
 * romper la migración 0001; el rename completo a `products` queda pendiente para una
 * migración futura. En el cliente usamos siempre `Product`.
 *
 * Diferencias intencionales con el SQL:
 * - `user_id` se omite mientras no haya auth (Supabase Auth se conectará después).
 *   Cuando llegue, lo inyecta el server con `auth.uid()`, no este store local.
 * - `created_at` y `updated_at` son ISO 8601 (`string`), no `Date`, para serializar
 *   sin transformaciones al hacer `JSON.stringify` contra localStorage.
 * - `product_images` (string[]) todavía NO existe en la tabla; se agrega en la
 *   migración 0002_add_product_images.sql. Por ahora vive solo en el cliente como
 *   array de object URLs / dataURIs / paths a Storage.
 */
export type Product = {
  id: string;
  name: string;
  description: string | null;
  cover_image_url: string | null;
  product_images: string[];
  created_at: string;
  updated_at: string;
};

export type ProductCreateInput = {
  name: string;
  description?: string;
  cover_image_url?: string;
  product_images?: string[];
};

type ProductsState = {
  products: Product[];
};

const INITIAL: ProductsState = {
  products: [],
};

const STORAGE_KEY = "vendi:products";

type ProductsContextValue = {
  state: ProductsState;
  hydrated: boolean;
  addProduct: (input: ProductCreateInput) => Product;
  updateProduct: (id: string, partial: Partial<Product>) => void;
  removeProduct: (id: string) => void;
  addImagesToProduct: (productId: string, urls: string[]) => void;
  removeImageFromProduct: (productId: string, url: string) => void;
  getById: (id: string) => Product | undefined;
  getRecent: (limit?: number) => Product[];
  seedDevData: () => void;
};

const ProductsContext = createContext<ProductsContextValue | null>(null);

/**
 * Placeholders SVG dataURI para fotos de productos de muestra. Compactos para no
 * inflar localStorage; el detalle visual no importa, son solo placeholders dev.
 */
function svgPlaceholder(bg: string, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="${bg}"/><text x="100" y="108" font-family="system-ui,sans-serif" font-size="18" fill="#fff" text-anchor="middle">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function ProductsProvider({ children }: { children: React.ReactNode }) {
  const [state, setLocalState] = useState<ProductsState>(INITIAL);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<ProductsState>;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- hidratación desde localStorage post-mount; el SSR no tiene acceso.
        setLocalState({
          products: Array.isArray(parsed.products)
            ? parsed.products.map((p) => ({
                ...p,
                product_images: Array.isArray(p.product_images)
                  ? p.product_images
                  : [],
              }))
            : [],
        });
      }
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore (quota, etc.)
    }
  }, [state, hydrated]);

  const addProduct = useCallback((input: ProductCreateInput): Product => {
    const now = new Date().toISOString();
    const product: Product = {
      id: crypto.randomUUID(),
      name: input.name,
      description: input.description ?? null,
      cover_image_url: input.cover_image_url ?? null,
      product_images: input.product_images ?? [],
      created_at: now,
      updated_at: now,
    };
    setLocalState((prev) => ({ products: [product, ...prev.products] }));
    return product;
  }, []);

  const updateProduct = useCallback(
    (id: string, partial: Partial<Product>) => {
      setLocalState((prev) => ({
        products: prev.products.map((p) =>
          p.id === id
            ? { ...p, ...partial, id: p.id, updated_at: new Date().toISOString() }
            : p,
        ),
      }));
    },
    [],
  );

  const removeProduct = useCallback((id: string) => {
    setLocalState((prev) => ({
      products: prev.products.filter((p) => p.id !== id),
    }));
  }, []);

  const addImagesToProduct = useCallback(
    (productId: string, urls: string[]) => {
      if (urls.length === 0) return;
      setLocalState((prev) => ({
        products: prev.products.map((p) =>
          p.id === productId
            ? {
                ...p,
                product_images: [...p.product_images, ...urls],
                updated_at: new Date().toISOString(),
              }
            : p,
        ),
      }));
    },
    [],
  );

  const removeImageFromProduct = useCallback(
    (productId: string, url: string) => {
      setLocalState((prev) => ({
        products: prev.products.map((p) =>
          p.id === productId
            ? {
                ...p,
                product_images: p.product_images.filter((u) => u !== url),
                updated_at: new Date().toISOString(),
              }
            : p,
        ),
      }));
    },
    [],
  );

  const getById = useCallback(
    (id: string) => state.products.find((p) => p.id === id),
    [state.products],
  );

  const getRecent = useCallback(
    (limit = 5): Product[] => {
      return [...state.products]
        .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
        .slice(0, limit);
    },
    [state.products],
  );

  const seedDevData = useCallback(() => {
    const now = Date.now();
    const iso = (offsetMs: number) => new Date(now - offsetMs).toISOString();
    const minute = 60_000;
    const hour = 60 * minute;
    const day = 24 * hour;

    const sample: Product[] = [
      {
        id: crypto.randomUUID(),
        name: "Lanzamiento primavera",
        description: "Campaña de fragancias para Septiembre",
        cover_image_url: null,
        product_images: [
          svgPlaceholder("#C56A4A", "Perfume 1"),
          svgPlaceholder("#7B8A4F", "Perfume 2"),
          svgPlaceholder("#D4A33B", "Perfume 3"),
        ],
        created_at: iso(2 * day),
        updated_at: iso(5 * minute),
      },
      {
        id: crypto.randomUUID(),
        name: "Catálogo café de especialidad",
        description: "Fotos para la tienda online",
        cover_image_url: null,
        product_images: [
          svgPlaceholder("#8B5A3C", "Café 1"),
          svgPlaceholder("#2B2A28", "Café 2"),
        ],
        created_at: iso(7 * day),
        updated_at: iso(2 * hour),
      },
      {
        id: crypto.randomUUID(),
        name: "Reels productos cosmética",
        description: null,
        cover_image_url: null,
        product_images: [svgPlaceholder("#F4C2C2", "Sérum")],
        created_at: iso(10 * day),
        updated_at: iso(1 * day),
      },
    ];
    setLocalState({ products: sample });
  }, []);

  const value = useMemo<ProductsContextValue>(
    () => ({
      state,
      hydrated,
      addProduct,
      updateProduct,
      removeProduct,
      addImagesToProduct,
      removeImageFromProduct,
      getById,
      getRecent,
      seedDevData,
    }),
    [
      state,
      hydrated,
      addProduct,
      updateProduct,
      removeProduct,
      addImagesToProduct,
      removeImageFromProduct,
      getById,
      getRecent,
      seedDevData,
    ],
  );

  return (
    <ProductsContext.Provider value={value}>
      {children}
    </ProductsContext.Provider>
  );
}

export function useProducts() {
  const ctx = useContext(ProductsContext);
  if (!ctx) throw new Error("useProducts must be inside ProductsProvider");
  return ctx;
}
