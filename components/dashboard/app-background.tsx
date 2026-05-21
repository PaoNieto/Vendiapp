/**
 * AppBackground
 *
 * Premium green gradient + 4 radial blobs aplicado a TODA la app
 * (no solo el dashboard). Vive en `(app)/layout.tsx` y `(auth)/layout.tsx`
 * para que toda pantalla herede la identidad verde + champagne.
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
 * Mobile (< sm = 640px): se ocultan el blob 3 (lateral izquierdo) y el blob 4
 * (verde-oscuro abajo derecha) para que el viewport de 375px no se sienta
 * apretado. Los dos blobs principales (champagne top-right + oliva bottom-left)
 * quedan visibles y bastan para la sensación premium.
 *
 * El shell usa `min-h-dvh` y `flex-1` friendly: cuando se monta en el
 * `(app)/layout.tsx` que ya tiene `flex min-h-dvh`, el shell ocupa todo el
 * área del main y los blobs viven detrás del contenido.
 */
export function AppBackground({ children, className }: AppBackgroundProps) {
  return (
    <section className={cn("dashboard-shell flex min-h-dvh flex-1 flex-col", className)}>
      {/* Blob 1 — champagne, esquina superior derecha. Siempre visible. */}
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          top: -100,
          right: -80,
          width: 360,
          height: 360,
          background:
            "radial-gradient(circle, rgba(245, 220, 160, 0.55) 0%, rgba(245, 220, 160, 0) 70%)",
          filter: "blur(8px)",
        }}
      />

      {/* Blob 2 — verde oliva, abajo centro-izquierda. Siempre visible. */}
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          bottom: -120,
          left: "15%",
          width: 400,
          height: 400,
          background:
            "radial-gradient(circle, rgba(99, 138, 78, 0.45) 0%, rgba(99, 138, 78, 0) 70%)",
          filter: "blur(8px)",
        }}
      />

      {/* Blob 3 — champagne medio, lateral izquierda. Solo >= sm. */}
      <div
        aria-hidden
        className="pointer-events-none absolute hidden sm:block"
        style={{
          top: "25%",
          left: -120,
          width: 280,
          height: 280,
          background:
            "radial-gradient(circle, rgba(232, 200, 130, 0.40) 0%, rgba(232, 200, 130, 0) 70%)",
          filter: "blur(8px)",
        }}
      />

      {/* Blob 4 — verde oscuro, abajo derecha. Solo >= sm. */}
      <div
        aria-hidden
        className="pointer-events-none absolute hidden sm:block"
        style={{
          bottom: "20%",
          right: "10%",
          width: 200,
          height: 200,
          background:
            "radial-gradient(circle, rgba(15, 40, 24, 0.18) 0%, rgba(15, 40, 24, 0) 70%)",
          filter: "blur(8px)",
        }}
      />

      <div className="dashboard-content flex flex-1 flex-col">{children}</div>
    </section>
  );
}
