"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { OutputRatio } from "@/lib/constants";

export type RecorridoState = {
  productImages: string[];
  referenceImages: string[];
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

export function RecorridoProvider({ children }: { children: React.ReactNode }) {
  const [state, setLocalState] = useState<RecorridoState>(INITIAL);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setLocalState({ ...INITIAL, ...JSON.parse(stored) });
      }
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
