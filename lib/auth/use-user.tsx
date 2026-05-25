"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

// Fuente única del usuario actual en el cliente. Envuelve toda la app
// autenticada vía AppProviders. Suscribe a onAuthStateChange para que
// signIn/signOut hechos en otra parte (otra pestaña, otro tab) se
// reflejen acá sin recargar.

type UserContextValue = {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: React.ReactNode }) {
  // El cliente de Supabase es estable entre renders (mismo singleton
  // del browser). Lo memoizamos para no recrearlo en cada update.
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setUser(data.user ?? null);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!mounted) return;
        setUser(session?.user ?? null);
      },
    );

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [supabase]);

  const value = useMemo<UserContextValue>(
    () => ({
      user,
      loading,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [user, loading, supabase],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be inside UserProvider");
  return ctx;
}
