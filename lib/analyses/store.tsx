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
import type { CuratedStyleId } from "@/lib/curated-styles";
import { useUser } from "@/lib/auth/use-user";
import { createClient } from "@/lib/supabase/client";
import { isPersistedUrl, uploadImageToBucket } from "@/lib/supabase/storage";

// LEGACY: hasta 2026-05-24 este store leía/escribía a localStorage en la key
// `vendi:analyses`. Ya no se escribe ni lee — los datos viven en Supabase
// (tabla `public.analyses`, migración 0005, filtrada por `auth.uid()` vía RLS).
// Si encontrás un `vendi:analyses` viejo en tu browser, ignoralo: ya no es la
// fuente de verdad.

// TODO(migration): script one-off para migrar dataURLs existentes de la DB a
// Storage. Por ahora se manejan en cliente con backwards compat — la columna
// `image_url` puede contener URLs http(s) nuevas o dataURLs viejos.

/**
 * Store de análisis IA persistidos.
 *
 * Cada `Analysis` es la fotografía de un análisis hecho por el usuario sobre
 * una imagen: composición, iluminación, por qué vende y estilos curados
 * identificados. Vive en Supabase (tabla `public.analyses`) y se filtra por
 * `auth.uid()` vía RLS — cada user ve sólo los suyos.
 *
 * Diseño deliberado:
 * - `image_url` se guarda como dataURL base64 (no `blob:`) — los blob URLs
 *   no sobreviven al refresh. El consumer convierte antes de `createAnalysis`.
 *   TODO(perf): cuando conectemos Storage, `image_url` pasa a ser un path al
 *   bucket y dejamos de guardar base64 en Postgres (que tiene un límite de
 *   ~1GB por TOAST chunk pero estresa innecesariamente la fila).
 * - `composition`, `lighting`, `why_it_sells` son strings con párrafos
 *   separados por doble salto de línea (formato que devuelve Gemini Vision).
 * - `output_ratio` referencia el tipo canónico de `lib/constants`.
 */

export type IdentifiedStyle = {
  id: CuratedStyleId;
  reason: string;
};

export type Analysis = {
  id: string;
  image_url: string;
  output_ratio: OutputRatio;
  composition: string;
  lighting: string;
  why_it_sells: string;
  identified_styles: IdentifiedStyle[];
  created_at: string;
};

export type AnalysisCreateInput = Omit<Analysis, "id" | "created_at">;

type AnalysesState = {
  analyses: Analysis[];
};

const INITIAL: AnalysesState = {
  analyses: [],
};

type AnalysesContextValue = {
  state: AnalysesState;
  hydrated: boolean;
  error: string | null;
  createAnalysis: (input: AnalysisCreateInput) => Analysis;
  removeAnalysis: (id: string) => void;
  getById: (id: string) => Analysis | undefined;
  getRecent: (limit?: number) => Analysis[];
};

const AnalysesContext = createContext<AnalysesContextValue | null>(null);

const ALLOWED_RATIOS: ReadonlyArray<OutputRatio> = [
  "1:1",
  "4:5",
  "9:16",
  "16:9",
];

function isOutputRatio(v: unknown): v is OutputRatio {
  return typeof v === "string" && (ALLOWED_RATIOS as readonly string[]).includes(v);
}

/**
 * Parser defensivo. `identified_styles` viene como jsonb — un array de
 * `{id, reason}`. Tipamos defensivo aceptando cualquier string en `id` (el
 * runtime de TS no puede validar `CuratedStyleId`); si el caller dibuja un id
 * desconocido, el componente ya lo ignora silenciosamente.
 */
function parseAnalysisRow(row: unknown): Analysis | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== "string") return null;
  if (typeof r.image_url !== "string") return null;
  if (!isOutputRatio(r.output_ratio)) return null;
  if (typeof r.composition !== "string") return null;
  if (typeof r.lighting !== "string") return null;
  if (typeof r.why_it_sells !== "string") return null;

  const styles: IdentifiedStyle[] = [];
  if (Array.isArray(r.identified_styles)) {
    for (const raw of r.identified_styles) {
      if (!raw || typeof raw !== "object") continue;
      const s = raw as Record<string, unknown>;
      if (typeof s.id !== "string" || typeof s.reason !== "string") continue;
      // Cast a CuratedStyleId — al cliente le toca filtrar ids no curados.
      styles.push({ id: s.id as CuratedStyleId, reason: s.reason });
    }
  }

  return {
    id: r.id,
    image_url: r.image_url,
    output_ratio: r.output_ratio,
    composition: r.composition,
    lighting: r.lighting,
    why_it_sells: r.why_it_sells,
    identified_styles: styles,
    created_at:
      typeof r.created_at === "string"
        ? r.created_at
        : new Date().toISOString(),
  };
}

export function AnalysesProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const { user } = useUser();
  const [state, setLocalState] = useState<AnalysesState>(INITIAL);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mismo patrón que ProductsProvider: sync con external auth state.
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
      .from("analyses")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error: queryError }) => {
        if (cancelled) return;
        if (queryError) {
          console.error("Failed to fetch analyses:", queryError);
          setError(queryError.message);
          setHydrated(true);
          return;
        }
        const rows = Array.isArray(data) ? data : [];
        const parsed: Analysis[] = [];
        for (const row of rows) {
          const a = parseAnalysisRow(row);
          if (a) parsed.push(a);
        }
        setLocalState({ analyses: parsed });
        setError(null);
        setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user, supabase]);

  const createAnalysis = useCallback(
    (input: AnalysisCreateInput): Analysis => {
      const currentUser = user;
      const now = new Date().toISOString();
      const optimistic: Analysis = {
        id: crypto.randomUUID(),
        image_url: input.image_url,
        output_ratio: input.output_ratio,
        composition: input.composition,
        lighting: input.lighting,
        why_it_sells: input.why_it_sells,
        identified_styles: [...input.identified_styles],
        created_at: now,
      };
      setLocalState((prev) => ({ analyses: [optimistic, ...prev.analyses] }));

      if (!currentUser) {
        console.error("createAnalysis called without a logged-in user");
        setError("No hay sesión activa.");
        setLocalState((prev) => ({
          analyses: prev.analyses.filter((a) => a.id !== optimistic.id),
        }));
        return optimistic;
      }

      void (async () => {
        // Subimos la foto a Storage antes de persistir la fila (Postgres recibe
        // la URL persistida, no el dataURL). Si el upload falla, igual
        // insertamos con el dataURL como fallback graceful — peor caso, la foto
        // queda gigante en la tabla pero el análisis no se pierde.
        let imageUrl = optimistic.image_url;
        if (!isPersistedUrl(imageUrl)) {
          const result = await uploadImageToBucket({
            bucket: "analysis-uploads",
            userId: currentUser.id,
            resourceId: optimistic.id,
            dataUrl: imageUrl,
          });
          if (result.ok) {
            imageUrl = result.url;
            setLocalState((prev) => ({
              analyses: prev.analyses.map((a) =>
                a.id === optimistic.id ? { ...a, image_url: result.url } : a,
              ),
            }));
          } else {
            console.error("Failed to upload analysis image:", result.error);
            setError(`No pude subir la foto del análisis: ${result.error}`);
          }
        }

        const { data, error: insertError } = await supabase
          .from("analyses")
          .insert({
            id: optimistic.id,
            user_id: currentUser.id,
            image_url: imageUrl,
            output_ratio: optimistic.output_ratio,
            composition: optimistic.composition,
            lighting: optimistic.lighting,
            why_it_sells: optimistic.why_it_sells,
            identified_styles: optimistic.identified_styles,
          })
          .select()
          .single();
        if (insertError) {
          console.error("Failed to insert analysis:", insertError);
          setError(insertError.message);
          setLocalState((prev) => ({
            analyses: prev.analyses.filter((a) => a.id !== optimistic.id),
          }));
          return;
        }
        const parsed = parseAnalysisRow(data);
        if (!parsed) return;
        setLocalState((prev) => ({
          analyses: prev.analyses.map((a) =>
            a.id === parsed.id ? parsed : a,
          ),
        }));
        if (isPersistedUrl(imageUrl)) setError(null);
      })();

      return optimistic;
    },
    [supabase, user],
  );

  const removeAnalysis = useCallback(
    (id: string) => {
      const currentUser = user;
      let snapshot: Analysis | undefined;
      setLocalState((prev) => {
        snapshot = prev.analyses.find((a) => a.id === id);
        return { analyses: prev.analyses.filter((a) => a.id !== id) };
      });
      if (!currentUser || !snapshot) return;
      const captured = snapshot;
      void supabase
        .from("analyses")
        .delete()
        .eq("id", id)
        .then(({ error: deleteError }) => {
          if (deleteError) {
            console.error("Failed to delete analysis:", deleteError);
            setError(deleteError.message);
            setLocalState((prev) => ({
              analyses: [captured, ...prev.analyses],
            }));
            return;
          }
          setError(null);
        });
    },
    [supabase, user],
  );

  const getById = useCallback(
    (id: string) => state.analyses.find((a) => a.id === id),
    [state.analyses],
  );

  const getRecent = useCallback(
    (limit?: number): Analysis[] => {
      const sorted = [...state.analyses].sort((a, b) =>
        a.created_at < b.created_at ? 1 : -1,
      );
      return typeof limit === "number" ? sorted.slice(0, limit) : sorted;
    },
    [state.analyses],
  );

  const value = useMemo<AnalysesContextValue>(
    () => ({
      state,
      hydrated,
      error,
      createAnalysis,
      removeAnalysis,
      getById,
      getRecent,
    }),
    [state, hydrated, error, createAnalysis, removeAnalysis, getById, getRecent],
  );

  return (
    <AnalysesContext.Provider value={value}>
      {children}
    </AnalysesContext.Provider>
  );
}

export function useAnalyses() {
  const ctx = useContext(AnalysesContext);
  if (!ctx) throw new Error("useAnalyses must be inside AnalysesProvider");
  return ctx;
}
