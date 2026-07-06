import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { AppProviders } from "@/components/app/app-providers";
import { BottomNav } from "@/components/app/bottom-nav";
import { Sidebar } from "@/components/app/sidebar";
import { AppBackground } from "@/components/dashboard";
import { ensureProfile } from "@/lib/auth/ensure-profile";
import { userHasPaidAccess } from "@/lib/auth/paid-access";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Garantiza que el usuario Clerk tenga su fila en `profiles` (+ créditos de
  // regalo) antes de renderizar la sección autenticada. Reemplaza al trigger
  // `handle_new_user`, muerto con Clerk. Idempotente: no-op si ya existe.
  await ensureProfile();

  // GATE DURO del paywall paga-primero: blinda TODA la sección autenticada en un
  // solo lugar. El proxy ya garantiza que acá hay sesión; si el usuario NO tiene
  // acceso (nunca pagó / no es ilimitado), lo mandamos a /comprar, que lo encamina
  // al Checkout de Mercado Pago. redirect() lanza NEXT_REDIRECT (no lo envolvemos
  // en try/catch). La página de resultado del pago vive FUERA de (app) a propósito,
  // para no rebotar acá mientras el webhook termina de acreditar.
  //
  // Señal de acceso = `userHasPaidAccess`: pagó (movimiento 'purchase' en
  // credit_ledger → cubre Mercado Pago Y Shopify) o está en `unlimited_users`.
  // Es la MISMA señal que ya usaban el proxy (viejo gate) y /fundador — fuente
  // única, Shopify-aware y fail-open (no bloquea al pagador ante un hipo de infra).
  const { userId } = await auth();
  if (userId && !(await userHasPaidAccess(userId))) {
    redirect("/comprar");
  }

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
