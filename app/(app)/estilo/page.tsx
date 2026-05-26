"use client";

import { StationShell } from "@/components/app/station-shell";
import { StyleCard } from "@/components/app/style-card";
import { useGeneracion } from "@/lib/generacion/store";
import { STYLE_LIST, type StyleId } from "@/lib/styles";

export default function EstiloPage() {
  const { state, hydrated, setStyle } = useGeneracion();
  const selected = state.selectedStyleId;

  const toggle = (id: StyleId) => {
    setStyle(selected === id ? null : id);
  };

  return (
    <StationShell
      number="03"
      title="Estilo"
      description="Elegi un estilo fotografico (opcional). Define el mood, la luz y la ambientacion. Podes combinarlo con referencias o usarlo solo."
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {STYLE_LIST.map((style) => (
            <StyleCard
              key={style.id}
              label={style.label}
              description={style.description}
              selected={selected === style.id}
              onSelect={() => toggle(style.id)}
            />
          ))}
        </div>
      )}
    </StationShell>
  );
}
