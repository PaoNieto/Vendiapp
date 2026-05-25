/**
 * AppBackground
 *
 * Shell con gradient Cuaderno (sage + butter hotspot top-right) aplicado a
 * TODA la app. Vive en `(app)/layout.tsx` y `(auth)/layout.tsx` para que
 * toda pantalla herede la identidad Cuaderno: fondo sage con hotspot butter
 * arriba a la derecha, sin blobs SVG/divs absolute.
 *
 * Antes este componente montaba 4 blobs absolute (champagne + oliva + green-
 * dark). Esos blobs se eliminaron — el gradient ahora vive 100% en CSS
 * (`.dashboard-shell` en `globals.css`) como 2 radial-gradients superpuestos.
 * Es más barato en GPU y se ajusta automáticamente al tema dark.
 *
 * Antes se llamaba `DashboardBackground`. Se reexporta como alias para
 * mantener compatibilidad con imports existentes.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type AppBackgroundProps = {
  /** Content rendered above the background. Lives in a relative z-1 wrapper. */
  children: ReactNode;
  /** Optional className passthrough on the shell. */
  className?: string;
};

/**
 * El shell usa `min-h-dvh` y `flex-1` friendly: cuando se monta en el
 * `(app)/layout.tsx` que ya tiene `flex min-h-dvh`, el shell ocupa todo el
 * área del main y el gradient vive detrás del contenido (z-0 implícito;
 * el contenido va sobre `.dashboard-content` con z-1).
 *
 * El gradient lo aplica `.dashboard-shell` desde `globals.css`. Eso permite
 * que el theme switch (light <-> dark) re-pinte el fondo automáticamente
 * sin tener que tocar este componente.
 */
export function AppBackground({ children, className }: AppBackgroundProps) {
  return (
    <section className={cn("dashboard-shell flex min-h-dvh flex-1 flex-col", className)}>
      <div className="dashboard-content flex flex-1 flex-col">{children}</div>
    </section>
  );
}
