export default function FabricaPage() {
  return (
    <div className="px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            🏭 Fábrica
          </h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Acá llegan los prompts del recorrido. Mirá la línea de producción
          generando tus variaciones y revisá lotes anteriores.
        </p>

        <div className="glass mt-8 rounded-3xl p-12 text-center text-sm text-muted-foreground">
          Próximamente: línea de producción en vivo + historial de lotes.
        </div>
      </div>
    </div>
  );
}
