"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type NegocioState = {
  brandName: string;
  industry: string;
  description: string;
};

const INITIAL: NegocioState = {
  brandName: "",
  industry: "",
  description: "",
};

const STORAGE_KEY = "vendi:negocio";

type NegocioContextValue = {
  state: NegocioState;
  setState: (partial: Partial<NegocioState>) => void;
  hydrated: boolean;
  isConfigured: boolean;
};

const NegocioContext = createContext<NegocioContextValue | null>(null);

export function NegocioProvider({ children }: { children: React.ReactNode }) {
  const [state, setLocalState] = useState<NegocioState>(INITIAL);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- hidratación desde localStorage post-mount; el SSR no tiene acceso.
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

  const setState = useCallback((partial: Partial<NegocioState>) => {
    setLocalState((prev) => ({ ...prev, ...partial }));
  }, []);

  const isConfigured = state.brandName.length > 0;

  return (
    <NegocioContext.Provider value={{ state, setState, hydrated, isConfigured }}>
      {children}
    </NegocioContext.Provider>
  );
}

export function useNegocio() {
  const ctx = useContext(NegocioContext);
  if (!ctx) throw new Error("useNegocio must be inside NegocioProvider");
  return ctx;
}
