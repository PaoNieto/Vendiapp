"use client";

import { useRouter } from "next/navigation";
import { GitBranch, X } from "lucide-react";

import { useRecorrido } from "@/lib/recorrido/store";
import { useVersions } from "@/lib/versions/store";

/**
 * Aviso de bifurcación — se muestra arriba de las estaciones de receta
 * (`/estilo`, `/formato`) cuando llegaste ahí editando una versión que YA tenía
 * imágenes generadas.
 *
 * Por qué existe: cambiar refs, estilo o formato de una versión que ya produjo
 * fotos dejaría un registro que miente (la ficha diría una receta y las fotos
 * serían de otra). Por eso la hoja de versión duplica y te trae a editar la
 * copia — ver `openRecipeStation` en
 * `app/(app)/productos/[id]/versiones/[versionId]/page.tsx`.
 *
 * Eso pasa SIN preguntar, para no meter un diálogo en el medio del flujo
 * (decisión de Paolo, 2026-09). El precio de no preguntar es este cartel: te
 * dice qué pasó y te deja deshacerlo en un click. "Deshacer" borra la copia
 * recién creada y te devuelve a la versión original intacta.
 */
export function ForkedVersionNotice() {
  const { state } = useRecorrido();
  const { productId, versionId, forkedFrom } = state;

  // Sin bifurcación en curso no hay nada que avisar. El guard vive acá y el
  // cartel en un componente aparte para que los ids lleguen abajo ya como
  // `string`: TypeScript no conserva el estrechamiento dentro de los closures,
  // y el límite de componente lo resuelve sin castear nada a mano.
  if (!forkedFrom || !versionId || !productId) return null;

  return (
    <Notice
      productId={productId}
      versionId={versionId}
      forkedFrom={forkedFrom}
    />
  );
}

function Notice({
  productId,
  versionId,
  forkedFrom,
}: {
  productId: string;
  versionId: string;
  forkedFrom: string;
}) {
  const router = useRouter();
  const recorrido = useRecorrido();
  const versions = useVersions();

  const version = versions.getById(versionId);
  if (!version) return null;

  function dismiss() {
    recorrido.setState({ forkedFrom: null });
  }

  function undo() {
    versions.removeVersion(versionId);
    recorrido.setState({ versionId: forkedFrom, forkedFrom: null });
    router.replace(`/productos/${productId}/versiones/${forkedFrom}`);
  }

  return (
    <div
      role="status"
      className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card-cream/70 px-4 py-3"
    >
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card-cream text-sage-strong"
      >
        <GitBranch className="h-4 w-4" strokeWidth={1.8} />
      </span>

      <p className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-foreground">
        Estás editando <span className="font-bold">{version.name}</span>, una
        versión nueva.{" "}
        <span className="text-mute">
          Las fotos que ya generaste quedaron intactas en la anterior.
        </span>
      </p>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={undo}
          className="rounded-full border border-border px-3 py-1.5 text-xs font-bold text-sage-strong transition-colors hover:bg-foreground/5"
        >
          Deshacer
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Descartar aviso"
          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
