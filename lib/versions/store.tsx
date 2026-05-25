"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  DEFAULT_VARIATIONS,
  MAX_VARIATIONS,
  type OutputRatio,
} from "@/lib/constants";

/**
 * Shape espejo de la tabla `public.versions` (migración 0003).
 *
 * Una "versión" es una campaña creativa dentro de un producto: tiene refs
 * propias, ratio, cantidad de variaciones y prompt en lenguaje natural. Las
 * generaciones cuelgan de la versión, no del producto directamente.
 *
 * Diferencias intencionales con el SQL:
 * - `user_id` se omite mientras no haya auth — lo inyecta el server con
 *   `auth.uid()` cuando conectemos Supabase.
 * - Timestamps como ISO 8601 (`string`) para serializar limpio a localStorage.
 * - `reference_images` es `string[]` (URLs/paths/dataURIs) para reflejar el
 *   `jsonb` de Postgres tal cual; cuando subamos a Storage seguirán siendo
 *   strings (ahora paths de bucket).
 */
export type Version = {
  id: string;
  product_id: string;
  name: string;
  description: string | null;
  reference_images: string[];
  output_ratio: OutputRatio;
  variations_default: number;
  user_prompt: string;
  created_at: string;
  updated_at: string;
};

export type VersionCreateInput = {
  product_id: string;
  name: string;
  description?: string;
  reference_images?: string[];
  output_ratio?: OutputRatio;
  variations_default?: number;
  user_prompt?: string;
};

type VersionsState = {
  versions: Version[];
};

const INITIAL: VersionsState = {
  versions: [],
};

const STORAGE_KEY = "vendi:versions";
const PRODUCTS_STORAGE_KEY = "vendi:products";

type VersionsContextValue = {
  state: VersionsState;
  hydrated: boolean;
  createVersion: (input: VersionCreateInput) => Version;
  updateVersion: (id: string, partial: Partial<Version>) => void;
  removeVersion: (id: string) => void;
  /**
   * Clona una versión existente con su misma config (refs, ratio, variations,
   * prompt). Devuelve la versión nueva con nombre "{original} (copia)". Las
   * imágenes y generaciones de la original NO se copian — la copia arranca en
   * blanco para que el usuario decida cuándo generar.
   */
  duplicateVersion: (id: string) => Version | undefined;
  getById: (id: string) => Version | undefined;
  getByProductId: (productId: string) => Version[];
  seedDevData: () => void;
};

const VersionsContext = createContext<VersionsContextValue | null>(null);

/**
 * Lee ids de productos directamente desde localStorage para evitar
 * dependencia circular entre `VersionsProvider` y `ProductsProvider`.
 * Si no hay nada en storage o el shape es inesperado, devuelve [].
 */
function readProductIdsFromStorage(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PRODUCTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { products?: Array<{ id?: unknown }> };
    if (!Array.isArray(parsed.products)) return [];
    const out: string[] = [];
    for (const p of parsed.products) {
      if (p && typeof p.id === "string") out.push(p.id);
    }
    return out;
  } catch {
    return [];
  }
}

export function VersionsProvider({ children }: { children: React.ReactNode }) {
  const [state, setLocalState] = useState<VersionsState>(INITIAL);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<VersionsState>;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- hidratación desde localStorage post-mount; el SSR no tiene acceso.
        setLocalState({
          versions: Array.isArray(parsed.versions)
            ? parsed.versions.map((v) => ({
                ...v,
                reference_images: Array.isArray(v.reference_images)
                  ? v.reference_images
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

  const createVersion = useCallback((input: VersionCreateInput): Version => {
    const now = new Date().toISOString();
    const variations =
      typeof input.variations_default === "number"
        ? Math.min(Math.max(input.variations_default, 1), MAX_VARIATIONS)
        : DEFAULT_VARIATIONS;
    const version: Version = {
      id: crypto.randomUUID(),
      product_id: input.product_id,
      name: input.name,
      description: input.description ?? null,
      reference_images: input.reference_images ?? [],
      output_ratio: input.output_ratio ?? "1:1",
      variations_default: variations,
      user_prompt: input.user_prompt ?? "",
      created_at: now,
      updated_at: now,
    };
    setLocalState((prev) => ({ versions: [version, ...prev.versions] }));
    return version;
  }, []);

  const updateVersion = useCallback(
    (id: string, partial: Partial<Version>) => {
      setLocalState((prev) => ({
        versions: prev.versions.map((v) =>
          v.id === id
            ? { ...v, ...partial, id: v.id, updated_at: new Date().toISOString() }
            : v,
        ),
      }));
    },
    [],
  );

  const removeVersion = useCallback((id: string) => {
    setLocalState((prev) => ({
      versions: prev.versions.filter((v) => v.id !== id),
    }));
  }, []);

  const duplicateVersion = useCallback(
    (id: string): Version | undefined => {
      const source = state.versions.find((v) => v.id === id);
      if (!source) return undefined;
      const now = new Date().toISOString();
      const copy: Version = {
        ...source,
        id: crypto.randomUUID(),
        name: `${source.name} (copia)`,
        // Refs se copian — son parte de la receta. Imágenes generadas NO,
        // viven en `generations` ligadas al version_id viejo.
        reference_images: [...source.reference_images],
        created_at: now,
        updated_at: now,
      };
      setLocalState((prev) => ({ versions: [copy, ...prev.versions] }));
      return copy;
    },
    [state.versions],
  );

  const getById = useCallback(
    (id: string) => state.versions.find((v) => v.id === id),
    [state.versions],
  );

  const getByProductId = useCallback(
    (productId: string): Version[] => {
      return state.versions
        .filter((v) => v.product_id === productId)
        .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
    },
    [state.versions],
  );

  /**
   * Siembra 2-3 versiones distribuidas en los productos existentes. Lee los
   * productos del localStorage para evitar acoplarse al `ProductsProvider`.
   * Si no hay productos cargados, no hace nada (no tiene sentido versionar
   * en el vacío).
   */
  const seedDevData = useCallback(() => {
    const productIds = readProductIdsFromStorage();
    if (productIds.length === 0) return;

    const now = Date.now();
    const iso = (offsetMs: number) => new Date(now - offsetMs).toISOString();
    const minute = 60_000;
    const hour = 60 * minute;
    const day = 24 * hour;

    const blueprints: Array<Omit<Version, "id" | "product_id">> = [
      {
        name: "Día de la Madre",
        description: "Campaña sentimental para mayo",
        reference_images: [],
        output_ratio: "4:5",
        variations_default: 5,
        user_prompt:
          "Generá fotos del producto con un mood cálido, paleta rosa pastel, ocasión especial.",
        created_at: iso(3 * day),
        updated_at: iso(10 * minute),
      },
      {
        name: "Black Friday",
        description: "Versión vibrante para promos",
        reference_images: [],
        output_ratio: "1:1",
        variations_default: 6,
        user_prompt:
          "Estilo vibrante, alto contraste, paleta negro y mostaza, formato cuadrado.",
        created_at: iso(2 * day),
        updated_at: iso(2 * hour),
      },
      {
        name: "Stories de lanzamiento",
        description: null,
        reference_images: [],
        output_ratio: "9:16",
        variations_default: 4,
        user_prompt:
          "Formato historia, mood editorial, paleta neutra, foco en producto.",
        created_at: iso(1 * day),
        updated_at: iso(1 * day),
      },
    ];

    const sample: Version[] = blueprints.map((b, idx) => ({
      ...b,
      id: crypto.randomUUID(),
      product_id: productIds[idx % productIds.length],
    }));

    setLocalState({ versions: sample });
  }, []);

  const value = useMemo<VersionsContextValue>(
    () => ({
      state,
      hydrated,
      createVersion,
      updateVersion,
      removeVersion,
      duplicateVersion,
      getById,
      getByProductId,
      seedDevData,
    }),
    [
      state,
      hydrated,
      createVersion,
      updateVersion,
      removeVersion,
      duplicateVersion,
      getById,
      getByProductId,
      seedDevData,
    ],
  );

  return (
    <VersionsContext.Provider value={value}>
      {children}
    </VersionsContext.Provider>
  );
}

export function useVersions() {
  const ctx = useContext(VersionsContext);
  if (!ctx) throw new Error("useVersions must be inside VersionsProvider");
  return ctx;
}
