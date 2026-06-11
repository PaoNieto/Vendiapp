"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useUser } from "@/lib/auth/use-user";
import { createClient } from "@/lib/supabase/client";

/**
 * Fuente única de los créditos del usuario en el cliente (modelo de créditos).
 *
 * Los créditos NO viven en localStorage: la fuente de verdad es Supabase
 * (`profiles.credits_remaining` como saldo + `credit_ledger` como historial).
 * Este hook lee de ahí y expone un `refetch` para revalidar después de generar
 * o de comprar.
 */

export type LedgerEntry = {
  id: string;
  delta: number;
  reason: string;
  balance_after: number;
  created_at: string;
};

export type CreditStats = {
  /** Saldo actual de créditos de GENERACIÓN. */
  balance: number;
  /** Saldo actual de créditos de ANÁLISIS con IA (bolsa separada). */
  analysisBalance: number;
  /** Créditos consumidos en el mes calendario actual (suma de generations). */
  consumedThisMonth: number;
  /** Total histórico consumido (todas las generations). */
  consumedAllTime: number;
  /** Total histórico acreditado (recargas, compras, bonus). */
  grantedAllTime: number;
  /** Si el usuario está en la allowlist de créditos ilimitados. */
  unlimited: boolean;
};

type CreditosContextValue = {
  stats: CreditStats;
  ledger: LedgerEntry[];
  loading: boolean;
  refetch: () => Promise<void>;
};

const EMPTY_STATS: CreditStats = {
  balance: 0,
  analysisBalance: 0,
  consumedThisMonth: 0,
  consumedAllTime: 0,
  grantedAllTime: 0,
  unlimited: false,
};

const CreditosContext = createContext<CreditosContextValue | null>(null);

export function CreditosProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const { user } = useUser();
  const [balance, setBalance] = useState(0);
  const [analysisBalance, setAnalysisBalance] = useState(0);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [unlimited, setUnlimited] = useState(false);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) {
      setBalance(0);
      setAnalysisBalance(0);
      setLedger([]);
      setUnlimited(false);
      setLoading(false);
      return;
    }
    setLoading(true);

    // Saldo desde profiles + historial desde credit_ledger + allowlist de
    // créditos ilimitados (unlimited_users) en paralelo. La policy RLS deja al
    // usuario leer sólo su propia fila, así que con maybeSingle() basta.
    const [profileRes, ledgerRes, unlimitedRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("credits_remaining, analysis_credits_remaining")
        .eq("id", user.id)
        .single(),
      supabase
        .from("credit_ledger")
        .select("id, delta, reason, balance_after, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("unlimited_users")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    setBalance(profileRes.data?.credits_remaining ?? 0);
    setAnalysisBalance(profileRes.data?.analysis_credits_remaining ?? 0);
    setLedger((ledgerRes.data as LedgerEntry[] | null) ?? []);
    setUnlimited(!!unlimitedRes.data);
    setLoading(false);
  }, [supabase, user]);

  // Fetch inicial + re-fetch cuando cambia el usuario (login/logout). Es una
  // sincronización legítima con un sistema externo (Supabase), que es
  // justamente el caso de uso para el que existe useEffect. El setState que
  // dispara refetch ocurre dentro de un callback async (tras el await), no en
  // un loop de render — por eso desactivamos la regla acá puntualmente.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refetch();
  }, [refetch]);

  const stats = useMemo<CreditStats>(() => {
    if (ledger.length === 0) {
      return { ...EMPTY_STATS, balance, analysisBalance, unlimited };
    }
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    let consumedThisMonth = 0;
    let consumedAllTime = 0;
    let grantedAllTime = 0;
    for (const e of ledger) {
      if (e.delta < 0) {
        consumedAllTime += -e.delta;
        const ts = new Date(e.created_at);
        if (ts.getFullYear() === y && ts.getMonth() === m) {
          consumedThisMonth += -e.delta;
        }
      } else if (e.delta > 0) {
        grantedAllTime += e.delta;
      }
    }
    return {
      balance,
      analysisBalance,
      consumedThisMonth,
      consumedAllTime,
      grantedAllTime,
      unlimited,
    };
  }, [ledger, balance, analysisBalance, unlimited]);

  const value = useMemo<CreditosContextValue>(
    () => ({ stats, ledger, loading, refetch }),
    [stats, ledger, loading, refetch],
  );

  return (
    <CreditosContext.Provider value={value}>
      {children}
    </CreditosContext.Provider>
  );
}

export function useCreditos() {
  const ctx = useContext(CreditosContext);
  if (!ctx) throw new Error("useCreditos must be inside CreditosProvider");
  return ctx;
}
