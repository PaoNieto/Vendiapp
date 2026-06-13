import { AppProviders } from "@/components/app/app-providers";
import { BottomNav } from "@/components/app/bottom-nav";
import { Sidebar } from "@/components/app/sidebar";
import { AppBackground } from "@/components/dashboard";
import { ensureProfile } from "@/lib/auth/ensure-profile";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Garantiza que el usuario Clerk tenga su fila en `profiles` (+ créditos de
  // regalo) antes de renderizar la sección autenticada. Reemplaza al trigger
  // `handle_new_user`, muerto con Clerk. Idempotente: no-op si ya existe.
  await ensureProfile();

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
          <Sidebar />
          <main className="flex flex-1 flex-col pb-24 lg:pb-0">{children}</main>
        </div>
        <BottomNav />
      </AppBackground>
    </AppProviders>
  );
}
