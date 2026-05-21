/**
 * DashboardBackground — DEPRECATED alias.
 *
 * El shell con blobs ahora se llama `AppBackground` y se monta global en
 * `(app)/layout.tsx`. Este alias se mantiene para que cualquier import
 * existente siga funcionando hasta que `frontend` migre las referencias.
 *
 * Cuando se monta en una página que YA está dentro del `(app)/layout.tsx`,
 * se renderiza como pass-through (no doble fondo). Si se monta fuera del
 * layout, sigue renderizando el shell completo.
 *
 * No agregar features nuevas acá — usar `AppBackground` directamente.
 */

import type { ReactNode } from "react";

export type DashboardBackgroundProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Pass-through. El fondo global lo aporta `(app)/layout.tsx` vía
 * `<AppBackground>`. Mantener este componente evita que se rompan los
 * imports de `app/(app)/dashboard/page.tsx` mientras `frontend` migra.
 */
export function DashboardBackground({ children }: DashboardBackgroundProps) {
  return <>{children}</>;
}

export { AppBackground } from "./app-background";
export type { AppBackgroundProps } from "./app-background";
