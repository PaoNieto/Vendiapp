import { StationShell } from "@/components/app/station-shell";

export default function EstiloPage() {
  return (
    <StationShell
      number="03"
      title="Estilo"
      description="Definí el mood, la paleta y la ocasión. La IA usa esto para decidir cómo iluminar, componer y ambientar tu producto."
      prevHref="/referencias"
      prevLabel="Volver a Referencias"
      nextHref="/formato"
      nextLabel="Continuar a Formato"
    >
      <div className="glass rounded-3xl p-12 text-center text-sm text-muted-foreground">
        Próximamente: selector de mood, paleta y ocasión.
      </div>
    </StationShell>
  );
}
