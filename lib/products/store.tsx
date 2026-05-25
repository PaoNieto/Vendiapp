"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useUser } from "@/lib/auth/use-user";
import { createClient } from "@/lib/supabase/client";
import {
  isPersistedUrl,
  uploadImagesToBucket,
  type UploadResult,
} from "@/lib/supabase/storage";

// LEGACY: hasta 2026-05-24 este store leía/escribía a localStorage en la key
// `vendi:products`. Ya no se escribe ni lee — los datos viven en Supabase
// (tabla `public.projects`, filtrada por `auth.uid()` vía RLS). Si encontrás
// un `vendi:products` viejo en tu browser, ignoralo: ya no es la fuente
// de verdad. No lo borramos para no destruir datos del usuario sin aviso.

// TODO(migration): script one-off para migrar dataURLs existentes de la DB a
// Storage. Por ahora se manejan en cliente con backwards compat — las URLs
// http/https subidas conviven en el array `product_images` con dataURLs viejos.

/**
 * Shape espejo de la tabla `public.projects` de Supabase.
 *
 * NOTA DE NOMENCLATURA: en el UI/lenguaje del producto a los `projects` los llamamos
 * "products" desde 2026-05-19. La tabla en Postgres sigue siendo `projects` para no
 * romper la migración 0001; el rename completo a `products` queda pendiente para una
 * migración futura. En el cliente usamos siempre `Product`.
 *
 * Diferencias intencionales con el SQL:
 * - `user_id` se omite del tipo del cliente: el server lo inyecta en cada
 *   INSERT y RLS garantiza que sólo veamos los nuestros en SELECT/UPDATE/DELETE.
 * - `created_at` y `updated_at` son ISO 8601 (`string`), no `Date`, alineados
 *   con cómo los devuelve Postgres en su forma JSON.
 * - `product_images` (string[]) viene de la columna `jsonb` agregada en 0002.
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

type ProductsContextValue = {
  state: ProductsState;
  hydrated: boolean;
  /** Última operación que falló. Null si la última corrió OK. */
  error: string | null;
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
 * Placeholders SVG dataURI para fotos de productos de muestra. Compactos para
 * no inflar la columna `product_images` del seed; el detalle visual no importa.
 */
function svgPlaceholder(bg: string, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="${bg}"/><text x="100" y="108" font-family="system-ui,sans-serif" font-size="18" fill="#fff" text-anchor="middle">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Sube las imágenes que sean dataURL/blob a Storage y mantiene en su lugar
 * las que ya sean URLs http(s). Si una falla, conserva el input original
 * (degradación graceful: peor caso, queda como dataURL hasta el próximo
 * refresh — preferible a perder la imagen entera).
 */
async function uploadProductImages(
  userId: string,
  productId: string,
  inputs: string[],
): Promise<{ urls: string[]; failures: string[] }> {
  if (inputs.length === 0) return { urls: [], failures: [] };

  // Partimos los inputs en "ya subidos" (pasan sin tocar) y "para subir".
  type Slot = { kind: "kept"; value: string } | { kind: "pending"; value: string };
  const slots: Slot[] = inputs.map((input) =>
    isPersistedUrl(input)
      ? { kind: "kept", value: input }
      : { kind: "pending", value: input },
  );
  const pending = slots
    .filter((s): s is { kind: "pending"; value: string } => s.kind === "pending")
    .map((s) => s.value);

  let uploaded: UploadResult[] = [];
  if (pending.length > 0) {
    uploaded = await uploadImagesToBucket({
      bucket: "product-uploads",
      userId,
      resourceId: productId,
      dataUrls: pending,
    });
  }

  // Re-emparejamos resultados con sus slots originales.
  const failures: string[] = [];
  let uploadCursor = 0;
  const urls = slots.map((slot) => {
    if (slot.kind === "kept") return slot.value;
    const res = uploaded[uploadCursor];
    uploadCursor += 1;
    if (!res || !res.ok) {
      if (res && !res.ok) failures.push(res.error);
      return slot.value;
    }
    return res.url;
  });
  return { urls, failures };
}

/**
 * Parser defensivo de una row Supabase a `Product`. Si llega algo inesperado
 * por la red (jsonb null, columnas faltantes en una migración intermedia),
 * caemos a defaults razonables en lugar de crashear el render.
 */
function parseProductRow(row: unknown): Product | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== "string") return null;
  if (typeof r.name !== "string") return null;
  return {
    id: r.id,
    name: r.name,
    description: typeof r.description === "string" ? r.description : null,
    cover_image_url:
      typeof r.cover_image_url === "string" ? r.cover_image_url : null,
    product_images: Array.isArray(r.product_images)
      ? r.product_images.filter((u): u is string => typeof u === "string")
      : [],
    created_at:
      typeof r.created_at === "string"
        ? r.created_at
        : new Date().toISOString(),
    updated_at:
      typeof r.updated_at === "string"
        ? r.updated_at
        : new Date().toISOString(),
  };
}

export function ProductsProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const { user } = useUser();
  const [state, setLocalState] = useState<ProductsState>(INITIAL);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hidratación: cada vez que cambia el `user` (login, logout, switch entre
  // pestañas vía onAuthStateChange) reseteamos y refetcheamos. Sin user,
  // state vacío y hydrated=false; las páginas siguen viendo el skeleton.
  //
  // Los setState dentro del effect son intencionales y permitidos: estamos
  // sincronizando con un external store (Supabase Auth via Context), que es
  // el caso de uso explícito de la regla `react-hooks/set-state-in-effect`.
  useEffect(() => {
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync con external auth state (Supabase Context).
      setLocalState(INITIAL);
      setHydrated(false);
      return;
    }
    let cancelled = false;
    setHydrated(false);
    supabase
      .from("projects")
      .select("*")
      .order("updated_at", { ascending: false })
      .then(({ data, error: queryError }) => {
        if (cancelled) return;
        if (queryError) {
          console.error("Failed to fetch products:", queryError);
          setError(queryError.message);
          setHydrated(true);
          return;
        }
        const rows = Array.isArray(data) ? data : [];
        const parsed: Product[] = [];
        for (const row of rows) {
          const p = parseProductRow(row);
          if (p) parsed.push(p);
        }
        setLocalState({ products: parsed });
        setError(null);
        setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user, supabase]);

  const addProduct = useCallback(
    (input: ProductCreateInput): Product => {
      const currentUser = user;
      const now = new Date().toISOString();
      // Generamos el id en cliente para devolver `Product` sync (la API
      // pública del store no es async). Postgres acepta nuestro uuid sin
      // problema; si el insert falla, hacemos rollback abajo.
      const optimistic: Product = {
        id: crypto.randomUUID(),
        name: input.name,
        description: input.description ?? null,
        cover_image_url: input.cover_image_url ?? null,
        product_images: input.product_images ?? [],
        created_at: now,
        updated_at: now,
      };
      setLocalState((prev) => ({ products: [optimistic, ...prev.products] }));

      if (!currentUser) {
        // Sin user no podemos persistir; rollback inmediato y log.
        console.error("addProduct called without a logged-in user");
        setError("No hay sesión activa.");
        setLocalState((prev) => ({
          products: prev.products.filter((p) => p.id !== optimistic.id),
        }));
        return optimistic;
      }

      // Pipeline async: 1) subir imágenes a Storage (no bloqueante para la UI
      // optimista, que ya muestra el dataURL), 2) INSERT a Postgres con las
      // URLs reales, 3) reemplazar el optimistic por la row del server.
      // Si Storage falla parcial o totalmente, igual insertamos lo que tenemos
      // (URLs + dataURLs degradados) para no perder el producto entero.
      void (async () => {
        const inputs = optimistic.product_images;
        const { urls, failures } = await uploadProductImages(
          currentUser.id,
          optimistic.id,
          inputs,
        );
        if (failures.length > 0) {
          console.error("Some product image uploads failed:", failures);
          setError(`No pude subir ${failures.length} imagen(es) de producto.`);
        }
        // Sync state local con las URLs reales (UX: la <Image> rehidrata).
        setLocalState((prev) => ({
          products: prev.products.map((p) =>
            p.id === optimistic.id ? { ...p, product_images: urls } : p,
          ),
        }));

        const { data, error: insertError } = await supabase
          .from("projects")
          .insert({
            id: optimistic.id,
            user_id: currentUser.id,
            name: optimistic.name,
            description: optimistic.description,
            cover_image_url: optimistic.cover_image_url,
            product_images: urls,
          })
          .select()
          .single();
        if (insertError) {
          console.error("Failed to insert product:", insertError);
          setError(insertError.message);
          setLocalState((prev) => ({
            products: prev.products.filter((p) => p.id !== optimistic.id),
          }));
          return;
        }
        const parsed = parseProductRow(data);
        if (!parsed) return;
        // Reemplazamos el optimistic por la row real (timestamps del server).
        setLocalState((prev) => ({
          products: prev.products.map((p) =>
            p.id === parsed.id ? parsed : p,
          ),
        }));
        if (failures.length === 0) setError(null);
      })();

      return optimistic;
    },
    [supabase, user],
  );

  const updateProduct = useCallback(
    (id: string, partial: Partial<Product>) => {
      const currentUser = user;
      // Snapshot del item viejo para rollback si Supabase devuelve error.
      let previous: Product | undefined;
      const now = new Date().toISOString();
      setLocalState((prev) => {
        previous = prev.products.find((p) => p.id === id);
        return {
          products: prev.products.map((p) =>
            p.id === id ? { ...p, ...partial, id: p.id, updated_at: now } : p,
          ),
        };
      });

      if (!currentUser || !previous) return;

      // Sólo mandamos a Supabase los campos que pueden mutar. `id`, `user_id`,
      // `created_at` no se tocan; `updated_at` lo regenera el trigger en la DB.
      const patch: Record<string, unknown> = {};
      if ("name" in partial) patch.name = partial.name;
      if ("description" in partial) patch.description = partial.description;
      if ("cover_image_url" in partial)
        patch.cover_image_url = partial.cover_image_url;
      if ("product_images" in partial)
        patch.product_images = partial.product_images;

      if (Object.keys(patch).length === 0) return;

      const snapshot = previous;
      void supabase
        .from("projects")
        .update(patch)
        .eq("id", id)
        .select()
        .single()
        .then(({ data, error: updateError }) => {
          if (updateError) {
            console.error("Failed to update product:", updateError);
            setError(updateError.message);
            // Rollback al snapshot pre-mutación.
            setLocalState((prev) => ({
              products: prev.products.map((p) =>
                p.id === id ? snapshot : p,
              ),
            }));
            return;
          }
          const parsed = parseProductRow(data);
          if (!parsed) return;
          setLocalState((prev) => ({
            products: prev.products.map((p) =>
              p.id === parsed.id ? parsed : p,
            ),
          }));
          setError(null);
        });
    },
    [supabase, user],
  );

  const removeProduct = useCallback(
    (id: string) => {
      const currentUser = user;
      let snapshot: Product | undefined;
      setLocalState((prev) => {
        snapshot = prev.products.find((p) => p.id === id);
        return { products: prev.products.filter((p) => p.id !== id) };
      });

      if (!currentUser || !snapshot) return;
      const captured = snapshot;
      void supabase
        .from("projects")
        .delete()
        .eq("id", id)
        .then(({ error: deleteError }) => {
          if (deleteError) {
            console.error("Failed to delete product:", deleteError);
            setError(deleteError.message);
            // Restauramos el item al state — el insert sigue existiendo
            // en Supabase. Lo metemos al principio para no asumir un orden.
            setLocalState((prev) => ({
              products: [captured, ...prev.products],
            }));
            return;
          }
          setError(null);
        });
    },
    [supabase, user],
  );

  const addImagesToProduct = useCallback(
    (productId: string, urls: string[]) => {
      if (urls.length === 0) return;
      const current = state.products.find((p) => p.id === productId);
      if (!current) return;

      // Optimistic: el state local muestra los dataURLs ya (UX inmediata).
      // El reemplazo por URLs persistentes ocurre cuando termina el upload.
      const optimisticNext = [...current.product_images, ...urls];
      setLocalState((prev) => ({
        products: prev.products.map((p) =>
          p.id === productId ? { ...p, product_images: optimisticNext } : p,
        ),
      }));

      const currentUser = user;
      if (!currentUser) {
        console.error("addImagesToProduct called without a logged-in user");
        setError("No hay sesión activa.");
        return;
      }

      void (async () => {
        const { urls: persisted, failures } = await uploadProductImages(
          currentUser.id,
          productId,
          urls,
        );
        if (failures.length > 0) {
          console.error("Some product image uploads failed:", failures);
          setError(`No pude subir ${failures.length} imagen(es) de producto.`);
        }
        const finalNext = [...current.product_images, ...persisted];
        // Pasamos por `updateProduct` para reusar su UPDATE + rollback path.
        updateProduct(productId, { product_images: finalNext });
      })();
    },
    [state.products, updateProduct, user],
  );

  const removeImageFromProduct = useCallback(
    (productId: string, url: string) => {
      const current = state.products.find((p) => p.id === productId);
      if (!current) return;
      const nextImages = current.product_images.filter((u) => u !== url);
      updateProduct(productId, { product_images: nextImages });
    },
    [state.products, updateProduct],
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
    // Si el user ya tiene productos cargados, NO duplicamos. El botón "Cargar
    // data de ejemplo" del dashboard es idempotente por diseño — apretar dos
    // veces no debería traer 6 productos.
    if (state.products.length > 0) return;
    if (!user) return;

    const now = Date.now();
    const iso = (offsetMs: number) => new Date(now - offsetMs).toISOString();
    const minute = 60_000;
    const hour = 60 * minute;
    const day = 24 * hour;

    const samples: ProductCreateInput[] = [
      {
        name: "Lanzamiento primavera",
        description: "Campaña de fragancias para Septiembre",
        product_images: [
          svgPlaceholder("#C56A4A", "Perfume 1"),
          svgPlaceholder("#7B8A4F", "Perfume 2"),
          svgPlaceholder("#D4A33B", "Perfume 3"),
        ],
      },
      {
        name: "Catálogo café de especialidad",
        description: "Fotos para la tienda online",
        product_images: [
          svgPlaceholder("#8B5A3C", "Café 1"),
          svgPlaceholder("#2B2A28", "Café 2"),
        ],
      },
      {
        name: "Reels productos cosmética",
        product_images: [svgPlaceholder("#F4C2C2", "Sérum")],
      },
    ];

    // Timestamps decorativos: distribuyen las cards en la grilla por
    // recency. Postgres pondrá su propio `updated_at` vía trigger; estos
    // son sólo para el state local optimista (luego son reemplazados con
    // los del server, así que no afecta orden persistido).
    void iso;
    void minute;
    void hour;
    void day;

    for (const sample of samples) {
      addProduct(sample);
    }
  }, [addProduct, state.products.length, user]);

  const value = useMemo<ProductsContextValue>(
    () => ({
      state,
      hydrated,
      error,
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
      error,
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
