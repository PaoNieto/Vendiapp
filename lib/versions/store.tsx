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
import { useUser } from "@/lib/auth/use-user";
import { createClient } from "@/lib/supabase/client";

// LEGACY: hasta 2026-05-24 este store leía/escribía a localStorage en la key
// `vendi:versions`. Ya no se escribe ni lee — los datos viven en Supabase
// (tabla `public.versions`, filtrada por `auth.uid()` vía RLS). Si encontrás
// un `vendi:versions` viejo en tu browser, ignoralo: ya no es la fuente
// de verdad.

/**
 * Shape espejo de la tabla `public.versions` (migración 0003).
 *
 * Una "versión" es una campaña creativa dentro de un producto: tiene refs
 * propias, ratio, cantidad de variaciones y prompt en lenguaje natural. Las
 * generaciones cuelgan de la versión, no del producto directamente.
 *
 * Diferencias intencionales con el SQL:
 * - `user_id` se omite del tipo del cliente (el server lo inyecta + RLS
 *   filtra). Sólo lo usamos al hacer INSERT.
 * - Timestamps como ISO 8601 (`string`) — Postgres devuelve `timestamptz`
 *   serializado como ISO 8601 via PostgREST.
 * - `reference_images` es `string[]` (URLs/paths/dataURIs) — corresponde 1:1
 *   con el `jsonb` de Postgres.
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

type VersionsContextValue = {
  state: VersionsState;
  hydrated: boolean;
  error: string | null;
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

const ALLOWED_RATIOS: ReadonlyArray<OutputRatio> = ["1:1", "4:5", "9:16", "16:9"];

function isOutputRatio(v: unknown): v is OutputRatio {
  return typeof v === "string" && (ALLOWED_RATIOS as readonly string[]).includes(v);
}

function parseVersionRow(row: unknown): Version | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== "string") return null;
  if (typeof r.product_id !== "string") return null;
  if (typeof r.name !== "string") return null;
  const ratio = isOutputRatio(r.output_ratio) ? r.output_ratio : "1:1";
  return {
    id: r.id,
    product_id: r.product_id,
    name: r.name,
    description: typeof r.description === "string" ? r.description : null,
    reference_images: Array.isArray(r.reference_images)
      ? r.reference_images.filter((u): u is string => typeof u === "string")
      : [],
    output_ratio: ratio,
    variations_default:
      typeof r.variations_default === "number"
        ? r.variations_default
        : DEFAULT_VARIATIONS,
    user_prompt: typeof r.user_prompt === "string" ? r.user_prompt : "",
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

export function VersionsProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const { user } = useUser();
  const [state, setLocalState] = useState<VersionsState>(INITIAL);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mismo patrón que ProductsProvider: sync con external auth state.
  // Ver comentario detallado allá.
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
      .from("versions")
      .select("*")
      .order("updated_at", { ascending: false })
      .then(({ data, error: queryError }) => {
        if (cancelled) return;
        if (queryError) {
          console.error("Failed to fetch versions:", queryError);
          setError(queryError.message);
          setHydrated(true);
          return;
        }
        const rows = Array.isArray(data) ? data : [];
        const parsed: Version[] = [];
        for (const row of rows) {
          const v = parseVersionRow(row);
          if (v) parsed.push(v);
        }
        setLocalState({ versions: parsed });
        setError(null);
        setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user, supabase]);

  const createVersion = useCallback(
    (input: VersionCreateInput): Version => {
      const currentUser = user;
      const now = new Date().toISOString();
      const variations =
        typeof input.variations_default === "number"
          ? Math.min(Math.max(input.variations_default, 1), MAX_VARIATIONS)
          : DEFAULT_VARIATIONS;
      const optimistic: Version = {
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
      setLocalState((prev) => ({ versions: [optimistic, ...prev.versions] }));

      if (!currentUser) {
        console.error("createVersion called without a logged-in user");
        setError("No hay sesión activa.");
        setLocalState((prev) => ({
          versions: prev.versions.filter((v) => v.id !== optimistic.id),
        }));
        return optimistic;
      }

      void supabase
        .from("versions")
        .insert({
          id: optimistic.id,
          user_id: currentUser.id,
          product_id: optimistic.product_id,
          name: optimistic.name,
          description: optimistic.description,
          reference_images: optimistic.reference_images,
          output_ratio: optimistic.output_ratio,
          variations_default: optimistic.variations_default,
          user_prompt: optimistic.user_prompt,
        })
        .select()
        .single()
        .then(({ data, error: insertError }) => {
          if (insertError) {
            console.error("Failed to insert version:", insertError);
            setError(insertError.message);
            setLocalState((prev) => ({
              versions: prev.versions.filter((v) => v.id !== optimistic.id),
            }));
            return;
          }
          const parsed = parseVersionRow(data);
          if (!parsed) return;
          setLocalState((prev) => ({
            versions: prev.versions.map((v) =>
              v.id === parsed.id ? parsed : v,
            ),
          }));
          setError(null);
        });

      return optimistic;
    },
    [supabase, user],
  );

  const updateVersion = useCallback(
    (id: string, partial: Partial<Version>) => {
      const currentUser = user;
      let snapshot: Version | undefined;
      const now = new Date().toISOString();
      setLocalState((prev) => {
        snapshot = prev.versions.find((v) => v.id === id);
        return {
          versions: prev.versions.map((v) =>
            v.id === id ? { ...v, ...partial, id: v.id, updated_at: now } : v,
          ),
        };
      });

      if (!currentUser || !snapshot) return;

      const patch: Record<string, unknown> = {};
      if ("name" in partial) patch.name = partial.name;
      if ("description" in partial) patch.description = partial.description;
      if ("reference_images" in partial)
        patch.reference_images = partial.reference_images;
      if ("output_ratio" in partial) patch.output_ratio = partial.output_ratio;
      if ("variations_default" in partial)
        patch.variations_default = partial.variations_default;
      if ("user_prompt" in partial) patch.user_prompt = partial.user_prompt;
      // product_id NO se patcha — una versión no migra entre productos.

      if (Object.keys(patch).length === 0) return;

      const captured = snapshot;
      void supabase
        .from("versions")
        .update(patch)
        .eq("id", id)
        .select()
        .single()
        .then(({ data, error: updateError }) => {
          if (updateError) {
            console.error("Failed to update version:", updateError);
            setError(updateError.message);
            setLocalState((prev) => ({
              versions: prev.versions.map((v) =>
                v.id === id ? captured : v,
              ),
            }));
            return;
          }
          const parsed = parseVersionRow(data);
          if (!parsed) return;
          setLocalState((prev) => ({
            versions: prev.versions.map((v) =>
              v.id === parsed.id ? parsed : v,
            ),
          }));
          setError(null);
        });
    },
    [supabase, user],
  );

  const removeVersion = useCallback(
    (id: string) => {
      const currentUser = user;
      let snapshot: Version | undefined;
      setLocalState((prev) => {
        snapshot = prev.versions.find((v) => v.id === id);
        return { versions: prev.versions.filter((v) => v.id !== id) };
      });

      if (!currentUser || !snapshot) return;
      const captured = snapshot;
      void supabase
        .from("versions")
        .delete()
        .eq("id", id)
        .then(({ error: deleteError }) => {
          if (deleteError) {
            console.error("Failed to delete version:", deleteError);
            setError(deleteError.message);
            setLocalState((prev) => ({
              versions: [captured, ...prev.versions],
            }));
            return;
          }
          setError(null);
        });
    },
    [supabase, user],
  );

  const duplicateVersion = useCallback(
    (id: string): Version | undefined => {
      const source = state.versions.find((v) => v.id === id);
      if (!source) return undefined;
      // Reusamos `createVersion` (que ya hace optimistic + persist) en lugar
      // de duplicar la lógica de insert. La copia arranca sin gens ni images.
      return createVersion({
        product_id: source.product_id,
        name: `${source.name} (copia)`,
        description: source.description ?? undefined,
        reference_images: [...source.reference_images],
        output_ratio: source.output_ratio,
        variations_default: source.variations_default,
        user_prompt: source.user_prompt,
      });
    },
    [state.versions, createVersion],
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
   * Siembra 3 versiones distribuidas en los productos existentes. Antes leíamos
   * los productos del localStorage; ahora consultamos Supabase directamente para
   * tomar los del usuario actual. Si el user no tiene productos, no hace nada
   * (no tiene sentido versionar en el vacío — el flujo de "Cargar data" del
   * dashboard primero llama `products.seedDevData()`).
   */
  const seedDevData = useCallback(() => {
    if (!user) return;
    if (state.versions.length > 0) return;

    void supabase
      .from("projects")
      .select("id")
      .then(({ data, error: queryError }) => {
        if (queryError) {
          console.error("Failed to read products for version seed:", queryError);
          setError(queryError.message);
          return;
        }
        const productIds = Array.isArray(data)
          ? data
              .map((row) => {
                if (!row || typeof row !== "object") return null;
                const r = row as Record<string, unknown>;
                return typeof r.id === "string" ? r.id : null;
              })
              .filter((id): id is string => id !== null)
          : [];
        if (productIds.length === 0) return;

        const blueprints: Array<Omit<VersionCreateInput, "product_id">> = [
          {
            name: "Día de la Madre",
            description: "Campaña sentimental para mayo",
            reference_images: [],
            output_ratio: "4:5",
            variations_default: 5,
            user_prompt:
              "Generá fotos del producto con un mood cálido, paleta rosa pastel, ocasión especial.",
          },
          {
            name: "Black Friday",
            description: "Versión vibrante para promos",
            reference_images: [],
            output_ratio: "1:1",
            variations_default: 6,
            user_prompt:
              "Estilo vibrante, alto contraste, paleta negro y mostaza, formato cuadrado.",
          },
          {
            name: "Stories de lanzamiento",
            reference_images: [],
            output_ratio: "9:16",
            variations_default: 4,
            user_prompt:
              "Formato historia, mood editorial, paleta neutra, foco en producto.",
          },
        ];

        blueprints.forEach((bp, idx) => {
          createVersion({
            ...bp,
            product_id: productIds[idx % productIds.length],
          });
        });
      });
  }, [supabase, user, state.versions.length, createVersion]);

  const value = useMemo<VersionsContextValue>(
    () => ({
      state,
      hydrated,
      error,
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
      error,
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
