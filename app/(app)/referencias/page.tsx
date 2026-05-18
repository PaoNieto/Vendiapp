import { StationShell } from "@/components/app/station-shell";

export default function ReferenciasPage() {
  return (
    <StationShell
      number="02"
      title="Referencias"
      description="Subí imágenes de la estética que querés lograr o elegí de nuestra galería curada."
      prevHref="/producto"
      prevLabel="Volver a Producto"
      nextHref="/estilo"
      nextLabel="Continuar a Estilo"
    >
      <div className="glass rounded-3xl p-12 text-center text-sm text-muted-foreground">
        Próximamente: subida de referencias + galería curada.
      </div>
    </StationShell>
  );
}
