import { AppProviders } from "@/components/app/app-providers";
import { BottomNav } from "@/components/app/bottom-nav";
import { Sidebar } from "@/components/app/sidebar";
import { AppBackground } from "@/components/dashboard";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const plan = "Pro";

  return (
    <AppProviders>
      {/*
        AppBackground aporta el gradient verde + 4 blobs radiales a TODA la
        sección autenticada. Sidebar y BottomNav viven adentro del shell para
        que también queden sobre el fondo (con su propio backdrop-blur). El
        main usa flex-1 para ocupar el resto del ancho.
      */}
      <AppBackground>
        <div className="flex min-h-dvh flex-1">
          <Sidebar plan={plan} />
          <main className="flex flex-1 flex-col pb-24 lg:pb-0">{children}</main>
        </div>
        <BottomNav />
      </AppBackground>
    </AppProviders>
  );
}
