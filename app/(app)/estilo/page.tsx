"use client";

import { StationShell } from "@/components/app/station-shell";
import { StyleCard } from "@/components/app/style-card";
import { useGeneracion } from "@/lib/generacion/store";
import { useRecorrido } from "@/lib/recorrido/store";
import { useVersions } from "@/lib/versions/store";
import { STYLE_LIST, type StyleId } from "@/lib/styles";

export default function EstiloPage() {
  const { state, hydrated, setStyle } = useGeneracion();
  const recorrido = useRecorrido();
  const versions = useVersions();
  const selected = state.selectedStyleId;

  const toggle = (id: StyleId) => {
    const nextSelected: StyleId | null = selected === id ? null : id;
    // Store global efímero (no rompemos el flujo actual).
    setStyle(nextSelected);
    // Persistencia a la versión activa, sólo si hay una hidratada. Sin
    // versionId activo, el estilo vive sólo en el store global.
    const versionId = recorrido.state.versionId;
    if (versionId && recorrido.hydrated && versions.hydrated) {
      versions.updateVersion(versionId, { style_id: nextSelected });
    }
  };

  return (
    <StationShell
      number="03"
      title="Estilos profesionales"
      description="Elegí un estilo de fotografía de producto. Define la luz, la composición y el mood. Funciona solo, con tus referencias, o ambos."
      prevHref="/referencias"
      prevLabel="Volver a Referencias"
      nextHref="/formato"
      nextLabel="Continuar a Formato"
    >
      {!hydrated ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {STYLE_LIST.map((s) => (
            <div
              key={s.id}
              className="h-[180px] animate-pulse rounded-[14px] bg-card sm:h-[200px]"
            />
          ))}
        </div>
      ) : (
        <div
          data-tour="estilo-grid"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
        >
          {STYLE_LIST.map((style) => (
            <StyleCard
              key={style.id}
              label={style.label}
              description={style.description}
              previewImage={style.previewImage}
              selected={selected === style.id}
              onSelect={() => toggle(style.id)}
            />
          ))}
        </div>
      )}
    </StationShell>
  );
}
