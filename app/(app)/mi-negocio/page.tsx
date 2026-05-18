export default function MiNegocioPage() {
  return (
    <div className="px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          🏢 Mi Negocio
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configurá tu marca y conectá tu API key de Google. Sin esto, la Fábrica
          no puede generar.
        </p>

        <div className="glass mt-8 rounded-3xl p-12 text-center text-sm text-muted-foreground">
          Próximamente: perfil de marca + conexión de API key de Google AI Studio.
        </div>
      </div>
    </div>
  );
}
