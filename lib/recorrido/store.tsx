"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

/**
 * El "recorrido" ya no acumula brief — eso vive en `versions` (store y tabla
 * 0003). Acá solo trackeamos qué producto + versión está activa para que las
 * pantallas sepan a quién escribirle.
 *
 * Cualquier campo viejo del brief (`referenceImages`, `mood`, `palette`,
 * `occasion`, `ratio`, `variations`, `userPrompt`) que aún viva en el
 * localStorage de un usuario que ya tenía la app abierta se descarta en
 * silencio durante la hidratación.
 */
export type RecorridoState = {
  productId: string | null;
  versionId: string | null;
  /**
   * Id de la versión ORIGINAL cuando `versionId` es una bifurcación recién
   * creada. Lo setea la hoja de versión al tocar "editar receta" sobre una
   * versión que ya generó imágenes: en vez de pisar la receta que produjo esas
   * fotos, duplica y manda a editar la copia.
   *
   * Las estaciones (`/estilo`, `/formato`) lo leen para mostrar el aviso con
   * "Deshacer". Vuelve a `null` apenas se descarta o se deshace — no queremos
   * que un blob viejo de localStorage reviva el cartel en otra sesión.
   */
  forkedFrom: string | null;
};

const INITIAL: RecorridoState = {
  productId: null,
  versionId: null,
  forkedFrom: null,
};

const STORAGE_KEY = "vendi:recorrido";

type RecorridoContextValue = {
  state: RecorridoState;
  setState: (partial: Partial<RecorridoState>) => void;
  reset: () => void;
  hydrated: boolean;
};

const RecorridoContext = createContext<RecorridoContextValue | null>(null);

/**
 * Whitelist de keys del shape actual. Filtra campos legacy del brief antes
 * de aplicar sobre `INITIAL`, así un blob viejo no contamina el state.
 */
const KNOWN_KEYS: ReadonlyArray<keyof RecorridoState> = [
  "productId",
  "versionId",
  "forkedFrom",
];

function filterKnown(parsed: Record<string, unknown>): Partial<RecorridoState> {
  const out: Partial<RecorridoState> = {};
  for (const key of KNOWN_KEYS) {
    if (key in parsed) {
      const value = parsed[key];
      // Sólo aceptamos string | null. Cualquier otra cosa cae a INITIAL.
      if (value === null || typeof value === "string") {
        out[key] = value;
      }
    }
  }
  return out;
}

export function RecorridoProvider({ children }: { children: React.ReactNode }) {
  const [state, setLocalState] = useState<RecorridoState>(INITIAL);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, unknown>;
        const known = filterKnown(parsed);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- hidratación desde localStorage post-mount; el SSR no tiene acceso.
        setLocalState((prev) => ({ ...prev, ...known }));
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
