"use client";

/**
 * Store efimero del "viaje" de generacion en curso.
 *
 * Captura las decisiones que el usuario hace en las estaciones de la Fabrica
 * (por ahora: el estilo) que todavia no estan persistidas en una Version de
 * Supabase. Vive solo en localStorage para no ensuciar el server con state
 * intermedio.
 *
 * Cuando el usuario manda a la Fabrica y se crea (o actualiza) una Version,
 * el caller deberia leer este store y pasar los valores como input a
 * `createVersion` / `updateVersion`.
 *
 * Patron: mismo que `lib/negocio/store.tsx` — Context + Provider + hidratacion
 * desde localStorage post-mount.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { isStyleId, type StyleId } from "@/lib/styles";

export type GeneracionState = {
  selectedStyleId: StyleId | null;
};

const INITIAL: GeneracionState = {
  selectedStyleId: null,
};

const STORAGE_KEY = "vendi:generacion";

type GeneracionContextValue = {
  state: GeneracionState;
  hydrated: boolean;
  setStyle: (id: StyleId | null) => void;
  reset: () => void;
};

const GeneracionContext = createContext<GeneracionContextValue | null>(null);

function parseStored(raw: string): GeneracionState {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const sid = (parsed as Record<string, unknown>).selectedStyleId;
      return {
        selectedStyleId: isStyleId(sid) ? sid : null,
      };
    }
  } catch {
    // ignore — corrupt storage, fall back to initial.
  }
  return INITIAL;
}

export function GeneracionProvider({ children }: { children: React.ReactNode }) {
  const [state, setLocalState] = useState<GeneracionState>(INITIAL);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- hidratacion post-mount.
        setLocalState(parseStored(stored));
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
      // ignore quota errors
    }
  }, [state, hydrated]);

  const setStyle = useCallback((id: StyleId | null) => {
    setLocalState((prev) => ({ ...prev, selectedStyleId: id }));
  }, []);

  const reset = useCallback(() => {
    setLocalState(INITIAL);
  }, []);

  return (
    <GeneracionContext.Provider value={{ state, hydrated, setStyle, reset }}>
      {children}
    </GeneracionContext.Provider>
  );
}

export function useGeneracion() {
  const ctx = useContext(GeneracionContext);
  if (!ctx) throw new Error("useGeneracion must be inside GeneracionProvider");
  return ctx;
}
