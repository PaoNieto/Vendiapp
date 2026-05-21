"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { OutputRatio } from "@/lib/constants";

/**
 * Shape espejo de la tabla `public.generations` de Supabase.
 *
 * Diferencias intencionales:
 * - `user_id` se omite hasta que conectemos Supabase Auth (lo inyecta el server).
 * - `product_images` / `reference_images` se tipan como `string[]` (URLs o paths a
 *   Storage). En Postgres son `jsonb`; un array de strings serializa 1:1.
 * - `enriched_prompt` es `Record<string, unknown> | null` — el director de arte
 *   devuelve un objeto con keys (scene, lighting, etc.) que no vale la pena
 *   tipar fino acá porque su contrato lo define el backend, no el cliente.
 * - Timestamps como ISO 8601 (`string`) para serialización limpia a localStorage.
 */
export type GenerationStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export type Generation = {
  id: string;
  /**
   * FK al producto (en el lenguaje del UI). El nombre de la columna en Postgres
   * sigue siendo `project_id` para preservar la migración 0001 — no renombrar.
   * Conceptualmente apunta a un `Product` del store `lib/products/store`.
   */
  project_id: string | null;
  /**
   * FK a la versión que originó esta generación. Migración 0003 introduce la
   * tabla `versions` y agrega `version_id` a `generations`. Sigue siendo
   * nullable para preservar compat con generaciones viejas que se crearon
   * antes del concepto de versión.
   */
  version_id: string | null;
  status: GenerationStatus;
  product_images: string[];
  reference_images: string[];
  user_prompt: string | null;
  enriched_prompt: Record<string, unknown> | null;
  output_ratio: OutputRatio;
  variations_requested: number;
  cost_credits: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

/**
 * Shape espejo de `public.generated_images`. Lo guardamos en el mismo store que
 * `generations` porque siempre se consultan juntos y no escala como tabla aparte.
 */
export type GeneratedImage = {
  id: string;
  generation_id: string;
  image_url: string;
  thumbnail_url: string | null;
  variation_index: number;
  metadata: Record<string, unknown> | null;
  user_rating: 1 | 2 | 3 | 4 | 5 | null;
  is_favorite: boolean;
  is_downloaded: boolean;
  created_at: string;
};

export type GenerationCreateInput = {
  project_id?: string;
  /**
   * Versión que originó la generación. Opcional para conservar el flujo
   * legacy sin versión, pero recomendado para todo flujo nuevo.
   */
  version_id?: string;
  product_images: string[];
  reference_images: string[];
  user_prompt?: string;
  output_ratio: OutputRatio;
  variations_requested: number;
  cost_credits?: number;
};

export type GenerationStats = {
  thisWeek: number;
  activeProjects: number;
  lastGeneratedAt: string | null;
};

type GenerationsState = {
  generations: Generation[];
  images: GeneratedImage[];
};

const INITIAL: GenerationsState = {
  generations: [],
  images: [],
};

const STORAGE_KEY = "vendi:generations";

type GenerationsContextValue = {
  state: GenerationsState;
  hydrated: boolean;
  createGeneration: (input: GenerationCreateInput) => Generation;
  markProcessing: (id: string) => void;
  markCompleted: (id: string) => void;
  markFailed: (id: string, error_message: string) => void;
  attachImages: (generationId: string, urls: string[]) => void;
  toggleFavorite: (imageId: string) => void;
  rate: (imageId: string, rating: 1 | 2 | 3 | 4 | 5) => void;
  getRecent: (limit?: number) => Generation[];
  /** Devuelve las generaciones de una versión, orden desc por created_at. */
  getByVersionId: (versionId: string) => Generation[];
  getStats: () => GenerationStats;
  seedDevData: () => void;
};

const GenerationsContext = createContext<GenerationsContextValue | null>(null);

const VERSIONS_STORAGE_KEY = "vendi:versions";

/**
 * Lee ids de versiones directamente desde localStorage para que
 * `seedDevData` pueda asignar `version_id` a algunas generaciones de ejemplo
 * sin acoplarse al `VersionsProvider` (evita dep circular y orden de mount).
 * Devuelve [] si no hay versiones cargadas o el shape es inesperado.
 */
function readSampleVersionIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(VERSIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { versions?: Array<{ id?: unknown }> };
    if (!Array.isArray(parsed.versions)) return [];
    const out: string[] = [];
    for (const v of parsed.versions) {
      if (v && typeof v.id === "string") out.push(v.id);
    }
    return out;
  } catch {
    return [];
  }
}

export function GenerationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setLocalState] = useState<GenerationsState>(INITIAL);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<GenerationsState>;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- hidratación desde localStorage post-mount; el SSR no tiene acceso.
        setLocalState({
          // Backfill `version_id: null` para generaciones serializadas antes
          // de la migración 0003. El resto del shape ya era compatible.
          generations: Array.isArray(parsed.generations)
            ? parsed.generations.map((g) => ({
                ...g,
                version_id:
                  typeof g.version_id === "string" ? g.version_id : null,
              }))
            : [],
          images: Array.isArray(parsed.images) ? parsed.images : [],
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

  const createGeneration = useCallback(
    (input: GenerationCreateInput): Generation => {
      const now = new Date().toISOString();
      const generation: Generation = {
        id: crypto.randomUUID(),
        project_id: input.project_id ?? null,
        version_id: input.version_id ?? null,
        status: "pending",
        product_images: input.product_images,
        reference_images: input.reference_images,
        user_prompt: input.user_prompt ?? null,
        enriched_prompt: null,
        output_ratio: input.output_ratio,
        variations_requested: input.variations_requested,
        cost_credits: input.cost_credits ?? 1,
        error_message: null,
        created_at: now,
        completed_at: null,
      };
      setLocalState((prev) => ({
        ...prev,
        generations: [generation, ...prev.generations],
      }));
      return generation;
    },
    [],
  );

  const markProcessing = useCallback((id: string) => {
    setLocalState((prev) => ({
      ...prev,
      generations: prev.generations.map((g) =>
        g.id === id ? { ...g, status: "processing" } : g,
      ),
    }));
  }, []);

  const markCompleted = useCallback((id: string) => {
    setLocalState((prev) => ({
      ...prev,
      generations: prev.generations.map((g) =>
        g.id === id
          ? {
              ...g,
              status: "completed",
              completed_at: new Date().toISOString(),
              error_message: null,
            }
          : g,
      ),
    }));
  }, []);

  const markFailed = useCallback((id: string, error_message: string) => {
    setLocalState((prev) => ({
      ...prev,
      generations: prev.generations.map((g) =>
        g.id === id
          ? {
              ...g,
              status: "failed",
              error_message,
              completed_at: new Date().toISOString(),
            }
          : g,
      ),
    }));
  }, []);

  const attachImages = useCallback(
    (generationId: string, urls: string[]) => {
      const now = new Date().toISOString();
      const newImages: GeneratedImage[] = urls.map((url, index) => ({
        id: crypto.randomUUID(),
        generation_id: generationId,
        image_url: url,
        thumbnail_url: null,
        variation_index: index,
        metadata: null,
        user_rating: null,
        is_favorite: false,
        is_downloaded: false,
        created_at: now,
      }));
      setLocalState((prev) => ({
        ...prev,
        images: [...newImages, ...prev.images],
      }));
    },
    [],
  );

  const toggleFavorite = useCallback((imageId: string) => {
    setLocalState((prev) => ({
      ...prev,
      images: prev.images.map((img) =>
        img.id === imageId ? { ...img, is_favorite: !img.is_favorite } : img,
      ),
    }));
  }, []);

  const rate = useCallback((imageId: string, rating: 1 | 2 | 3 | 4 | 5) => {
    setLocalState((prev) => ({
      ...prev,
      images: prev.images.map((img) =>
        img.id === imageId ? { ...img, user_rating: rating } : img,
      ),
    }));
  }, []);

  const getRecent = useCallback(
    (limit = 6): Generation[] => {
      return [...state.generations]
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        .slice(0, limit);
    },
    [state.generations],
  );

  const getByVersionId = useCallback(
    (versionId: string): Generation[] => {
      return state.generations
        .filter((g) => g.version_id === versionId)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    },
    [state.generations],
  );

  const getStats = useCallback((): GenerationStats => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let thisWeek = 0;
    // `activeProjects` (nombre legacy) ahora cuenta **versiones distintas**
    // con al menos una generación pending/processing. Si la generación no
    // tiene version_id (compat con datos viejos), cae al product_id como
    // bucket — así el contador no queda subestimado durante la migración.
    const activeBuckets = new Set<string>();
    let lastCompletedMs = -Infinity;
    let lastGeneratedAt: string | null = null;

    for (const g of state.generations) {
      const createdMs = Date.parse(g.created_at);
      if (!Number.isNaN(createdMs) && createdMs >= weekAgo) {
        thisWeek += 1;
      }
      if (g.status === "processing" || g.status === "pending") {
        const bucket = g.version_id ?? g.project_id;
        if (bucket) activeBuckets.add(bucket);
      }
      if (g.status === "completed" && g.completed_at) {
        const completedMs = Date.parse(g.completed_at);
        if (!Number.isNaN(completedMs) && completedMs > lastCompletedMs) {
          lastCompletedMs = completedMs;
          lastGeneratedAt = g.completed_at;
        }
      }
    }

    return {
      thisWeek,
      activeProjects: activeBuckets.size,
      lastGeneratedAt,
    };
  }, [state.generations]);

  const seedDevData = useCallback(() => {
    const now = Date.now();
    const iso = (offsetMs: number) => new Date(now - offsetMs).toISOString();
    const minute = 60_000;
    const hour = 60 * minute;
    const day = 24 * hour;

    // Tomamos versiones del localStorage para asignarles algunas generaciones.
    // Evita acoplarse al `VersionsProvider`; si no hay versiones cargadas, las
    // generaciones quedan con `version_id: null` (compat con flujo legacy).
    const sampleVersionIds = readSampleVersionIds();
    const pick = (idx: number): string | null =>
      sampleVersionIds.length > 0
        ? sampleVersionIds[idx % sampleVersionIds.length]
        : null;

    const generations: Generation[] = [
      {
        id: crypto.randomUUID(),
        project_id: null,
        version_id: pick(0),
        status: "processing",
        product_images: [],
        reference_images: [],
        user_prompt: "Botella de perfume sobre mármol",
        enriched_prompt: null,
        output_ratio: "1:1",
        variations_requested: 5,
        cost_credits: 1,
        error_message: null,
        created_at: iso(5 * minute),
        completed_at: null,
      },
      {
        id: crypto.randomUUID(),
        project_id: null,
        version_id: pick(1),
        status: "completed",
        product_images: [],
        reference_images: [],
        user_prompt: "Café en taza minimalista",
        enriched_prompt: null,
        output_ratio: "4:5",
        variations_requested: 5,
        cost_credits: 1,
        error_message: null,
        created_at: iso(2 * hour + 10 * minute),
        completed_at: iso(2 * hour),
      },
      {
        id: crypto.randomUUID(),
        project_id: null,
        version_id: pick(2),
        status: "completed",
        product_images: [],
        reference_images: [],
        user_prompt: "Sérum facial fondo pastel",
        enriched_prompt: null,
        output_ratio: "9:16",
        variations_requested: 5,
        cost_credits: 1,
        error_message: null,
        created_at: iso(1 * day + 1 * hour),
        completed_at: iso(1 * day),
      },
      {
        id: crypto.randomUUID(),
        project_id: null,
        version_id: null,
        status: "failed",
        product_images: [],
        reference_images: [],
        user_prompt: "Zapatillas escena urbana",
        enriched_prompt: null,
        output_ratio: "16:9",
        variations_requested: 5,
        cost_credits: 1,
        error_message: "El director de arte no pudo procesar las referencias.",
        created_at: iso(3 * day),
        completed_at: iso(3 * day - 2 * minute),
      },
      {
        id: crypto.randomUUID(),
        project_id: null,
        version_id: null,
        status: "completed",
        product_images: [],
        reference_images: [],
        user_prompt: "Vela aromática banner web",
        enriched_prompt: null,
        output_ratio: "16:9",
        variations_requested: 5,
        cost_credits: 1,
        error_message: null,
        created_at: iso(5 * day),
        completed_at: iso(5 * day - 3 * minute),
      },
    ];

    setLocalState({ generations, images: [] });
  }, []);

  const value = useMemo<GenerationsContextValue>(
    () => ({
      state,
      hydrated,
      createGeneration,
      markProcessing,
      markCompleted,
      markFailed,
      attachImages,
      toggleFavorite,
      rate,
      getRecent,
      getByVersionId,
      getStats,
      seedDevData,
    }),
    [
      state,
      hydrated,
      createGeneration,
      markProcessing,
      markCompleted,
      markFailed,
      attachImages,
      toggleFavorite,
      rate,
      getRecent,
      getByVersionId,
      getStats,
      seedDevData,
    ],
  );

  return (
    <GenerationsContext.Provider value={value}>
      {children}
    </GenerationsContext.Provider>
  );
}

export function useGenerations() {
  const ctx = useContext(GenerationsContext);
  if (!ctx) throw new Error("useGenerations must be inside GenerationsProvider");
  return ctx;
}
