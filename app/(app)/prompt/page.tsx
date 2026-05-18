import { StationShell } from "@/components/app/station-shell";

export default function PromptPage() {
  return (
    <StationShell
      number="05"
      title="Prompt"
      description="Acá ves en lenguaje natural lo que la IA va a generar. Editá libremente si querés ajustar algún detalle antes de mandar a la Fábrica."
      prevHref="/formato"
      prevLabel="Volver a Formato"
      nextHref="/fabrica"
      nextLabel="Mandar a la Fábrica"
    >
      <div className="glass rounded-3xl p-12 text-center text-sm text-muted-foreground">
        Próximamente: prompt natural editable, traducido del brief acumulado.
      </div>
    </StationShell>
  );
}
