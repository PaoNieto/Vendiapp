import { StationShell } from "@/components/app/station-shell";

export default function FormatoPage() {
  return (
    <StationShell
      number="04"
      title="Formato"
      description="Elegí el aspecto (cuadrado, vertical, historia, horizontal) y cuántas variaciones querés generar."
      prevHref="/estilo"
      prevLabel="Volver a Estilo"
      nextHref="/prompt"
      nextLabel="Continuar a Prompt"
    >
      <div className="glass rounded-3xl p-12 text-center text-sm text-muted-foreground">
        Próximamente: selector de ratio y cantidad de variaciones.
      </div>
    </StationShell>
  );
}
