"use client";

import { useMemo } from "react";
import { useUser as useClerkUser, useClerk } from "@clerk/nextjs";

/**
 * Fuente única del usuario actual en el cliente, backed por Clerk.
 *
 * MANTIENE la firma pública que consume toda la app (no la rompas):
 *   useUser() → { user, loading, signOut }
 *   user.id                          → id de Clerk (string `user_xxx`). Es el
 *                                      id canónico que cae en RLS como `sub`.
 *   user.email                       → primaryEmailAddress.emailAddress
 *   user.user_metadata.display_name  → fullName / firstName de Clerk
 *
 * Antes esto envolvía Supabase Auth (onAuthStateChange). Ahora el estado de
 * sesión lo gobierna <ClerkProvider> (root layout) y sus hooks. Dejamos de
 * necesitar Context propio: useUser/useClerk ya son globales bajo el provider.
 * Mantenemos el export `UserProvider` como passthrough para no tocar
 * AppProviders ni el árbol existente.
 */

// Forma estable del usuario que ve la app. Replica el subset de campos de
// Supabase `User` que los consumidores usan (id, email, user_metadata), para
// que los stores/sidebar/ajustes sigan andando sin cambios.
export type AppUser = {
  id: string;
  email: string | undefined;
  user_metadata: {
    display_name: string | null;
  };
};

type UserContextValue = {
  user: AppUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

// Passthrough: el estado real lo provee <ClerkProvider> en el root layout.
// Lo mantenemos para no alterar AppProviders ni el orden del árbol.
export function UserProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function useUser(): UserContextValue {
  const { isLoaded, user: clerkUser } = useClerkUser();
  const clerk = useClerk();

  // El nombre amistoso sale de fullName; si no, firstName; si no, null. La app
  // lee esto en sidebar como `user.user_metadata.display_name`.
  const displayName =
    clerkUser?.fullName?.trim() || clerkUser?.firstName?.trim() || null;

  const email = clerkUser?.primaryEmailAddress?.emailAddress;

  // Memoizamos el objeto `user` por sus campos primitivos. Igual que la versión
  // Supabase (que sólo cambiaba la ref cuando cambiaba el id), esto evita que
  // los stores re-hidraten en cada re-render de Clerk: la ref de `user` sólo
  // cambia si id/email/display_name realmente cambian.
  const user = useMemo<AppUser | null>(() => {
    if (!clerkUser) return null;
    return {
      id: clerkUser.id,
      email,
      user_metadata: { display_name: displayName },
    };
  }, [clerkUser, email, displayName]);

  return useMemo<UserContextValue>(
    () => ({
      user,
      // `loading` = Clerk todavía no resolvió la sesión. Mientras tanto las
      // vistas muestran su skeleton (patrón `hydrated` de los stores).
      loading: !isLoaded,
      signOut: async () => {
        await clerk.signOut();
      },
    }),
    [user, isLoaded, clerk],
  );
}

/**
 * Iniciales del usuario logueado para el `<AvatarCircle />`.
 * Toma del `display_name` si existe; si no, primera letra del email;
 * fallback final "N".
 *
 * - "Paolo Nieto" → "PN"
 * - "Paolo" → "P"
 * - "paolo@example.com" → "P"
 */
export function useUserInitials(): string {
  const { user } = useUser();
  if (!user) return "N";
  const displayName = user.user_metadata.display_name?.trim() || "";
  const source = displayName || user.email?.trim() || "";
  if (!source) return "N";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0]!.slice(0, 1).toUpperCase();
}
