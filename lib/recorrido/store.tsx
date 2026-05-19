"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { UploadedImage } from "@/components/fabrica";
import type { OutputRatio } from "@/lib/constants";

/**
 * El shape usa `UploadedImage[]` (no `string[]`) para producto y referencias porque
 * cuando conectemos Gemini/Supabase Storage vamos a necesitar el `File`. Las imágenes
 * NO se persisten en localStorage: los blob URLs se invalidan al reload y los `File`
 * tampoco son serializables — al rehidratar las listas quedan vacías y el usuario debe
 * volver a subir. El resto del brief sí persiste.
 */
export type RecorridoState = {
  productImages: UploadedImage[];
  referenceImages: UploadedImage[];
  mood: string | null;
  palette: string[];
  occasion: string | null;
  ratio: OutputRatio;
  variations: number;
  userPrompt: string;
};

const INITIAL: RecorridoState = {
  productImages: [],
  referenceImages: [],
  mood: null,
  palette: [],
  occasion: null,
  ratio: "1:1",
  variations: 5,
  userPrompt: "",
};

const STORAGE_KEY = "vendi:recorrido";

type RecorridoContextValue = {
  state: RecorridoState;
  setState: (partial: Partial<RecorridoState>) => void;
  reset: () => void;
  hydrated: boolean;
};

const RecorridoContext = createContext<RecorridoContextValue | null>(null);

/** Subset que sí se serializa a localStorage. Excluye listas de imágenes. */
type PersistedState = Omit<RecorridoState, "productImages" | "referenceImages">;

function pickPersisted(state: RecorridoState): PersistedState {
  const { productImages: _p, referenceImages: _r, ...rest } = state;
  void _p;
  void _r;
  return rest;
}

export function RecorridoProvider({ children }: { children: React.ReactNode }) {
  const [state, setLocalState] = useState<RecorridoState>(INITIAL);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<PersistedState>;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- hidratación desde localStorage post-mount; el SSR no tiene acceso.
        setLocalState((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pickPersisted(state)));
    } catch {
      // ignore (quota, etc.)
    }
  }, [state, hydrated]);

  const setState = useCallback((partial: Partial<RecorridoState>) => {
    setLocalState((prev) => ({ ...prev, ...partial }));
  }, []);

  const reset = useCallback(() => {
    setLocalState(INITIAL);
  }, []);

  return (
    <RecorridoContext.Provider value={{ state, setState, reset, hydrated }}>
      {children}
    </RecorridoContext.Provider>
  );
}

export function useRecorrido() {
  const ctx = useContext(RecorridoContext);
  if (!ctx) throw new Error("useRecorrido must be inside RecorridoProvider");
  return ctx;
}
