import { StationShell } from "@/components/app/station-shell";

export default function ProductoPage() {
  return (
    <StationShell
      number="01"
      title="Producto"
      description="Subí las fotos de tu producto. Distintos ángulos ayudan a la IA a mantenerlo idéntico en cada variación."
      nextHref="/referencias"
      nextLabel="Continuar a Referencias"
    >
      <div className="glass rounded-3xl p-12 text-center text-sm text-muted-foreground">
        Próximamente: subida de fotos del producto.
      </div>
    </StationShell>
  );
}
