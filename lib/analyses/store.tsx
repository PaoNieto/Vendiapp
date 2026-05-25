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
import type { CuratedStyleId } from "@/app/(app)/referencias/page";

/**
 * Store de análisis IA persistidos.
 *
 * Cada `Analysis` es la fotografía de un análisis hecho por el usuario sobre
 * una imagen: composición, iluminación, por qué vende y estilos curados
 * identificados. Vive en localStorage (`vendi:analyses`) para sobrevivir al
 * refresh sin pasar todavía por backend.
 *
 * Diseño deliberado:
 * - `image_url` se guarda como dataURL base64 (no `blob:`) — los blob URLs
 *   no sobreviven al refresh del navegador. El consumer convierte antes de
 *   `createAnalysis`.
 * - `composition`, `lighting`, `why_it_sells` son strings con párrafos
 *   separados por doble salto de línea, como vienen del mock hoy y como
 *   esperamos que vengan de Gemini Vision mañana.
 * - `output_ratio` referencia el tipo canónico de `lib/constants` —
 *   `RatioValue` de fabrica es el mismo type alias.
 *
 * TODO(perf): si una imagen pesa >2MB, su dataURL puede saturar el quota
 * de localStorage (~5MB total). Cuando conectemos Storage, `image_url`
 * pasa a ser un path al bucket y el problema desaparece. Por ahora,
 * confiamos en el `maxSizeMb` de 8MB del uploader como contención.
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

const STORAGE_KEY = "vendi:analyses";

type AnalysesContextValue = {
  state: AnalysesState;
  hydrated: boolean;
  createAnalysis: (input: AnalysisCreateInput) => Analysis;
  removeAnalysis: (id: string) => void;
  getById: (id: string) => Analysis | undefined;
  getRecent: (limit?: number) => Analysis[];
};

const AnalysesContext = createContext<AnalysesContextValue | null>(null);

export function AnalysesProvider({ children }: { children: React.ReactNode }) {
  const [state, setLocalState] = useState<AnalysesState>(INITIAL);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<AnalysesState>;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- hidratación desde localStorage post-mount; el SSR no tiene acceso.
        setLocalState({
          analyses: Array.isArray(parsed.analyses)
            ? parsed.analyses.map((a) => ({
                ...a,
                identified_styles: Array.isArray(a.identified_styles)
                  ? a.identified_styles
                  : [],
              }))
            : [],
        });
      }
    } catch {
      // ignore — JSON inválido o storage inaccesible.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore (quota exceeded, modo privado, etc.)
    }
  }, [state, hydrated]);

  const createAnalysis = useCallback(
    (input: AnalysisCreateInput): Analysis => {
      const now = new Date().toISOString();
      const analysis: Analysis = {
        id: crypto.randomUUID(),
        image_url: input.image_url,
        output_ratio: input.output_ratio,
        composition: input.composition,
        lighting: input.lighting,
        why_it_sells: input.why_it_sells,
        identified_styles: [...input.identified_styles],
        created_at: now,
      };
      setLocalState((prev) => ({ analyses: [analysis, ...prev.analyses] }));
      return analysis;
    },
    [],
  );

  const removeAnalysis = useCallback((id: string) => {
    setLocalState((prev) => ({
      analyses: prev.analyses.filter((a) => a.id !== id),
    }));
  }, []);

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
      createAnalysis,
      removeAnalysis,
      getById,
      getRecent,
    }),
    [state, hydrated, createAnalysis, removeAnalysis, getById, getRecent],
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
