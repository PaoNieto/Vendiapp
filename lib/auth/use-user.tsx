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

/**
 * Iniciales del usuario logueado para el `<AvatarCircle />`.
 * Toma del `display_name` (`user_metadata`) si existe; si no, primera
 * letra del email; fallback final "N".
 *
 * - "Paolo Nieto" → "PN"
 * - "Paolo" → "P"
 * - "paolo@example.com" → "P"
 */
export function useUserInitials(): string {
  const { user } = useUser();
  if (!user) return "N";
  const meta = user.user_metadata as Record<string, unknown> | null;
  const displayName =
    meta && typeof meta.display_name === "string" ? meta.display_name : "";
  const source = displayName.trim() || user.email?.trim() || "";
  if (!source) return "N";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0]!.slice(0, 1).toUpperCase();
}
