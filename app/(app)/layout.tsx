import { redirect } from "next/navigation";
import { after } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { AppProviders } from "@/components/app/app-providers";
import { BottomNav } from "@/components/app/bottom-nav";
import { MobileTopbar } from "@/components/app/mobile-topbar";
import { Sidebar } from "@/components/app/sidebar";
import { AiDownBanner } from "@/components/app/avisos/ai-down-banner";
import { ServiceErrorScreen } from "@/components/app/avisos/service-error-screen";
import { AppBackground } from "@/components/dashboard";
import { ensureProfile } from "@/lib/auth/ensure-profile";
import { userHasPaidAccess } from "@/lib/auth/paid-access";
import { isAdmin } from "@/lib/avisos/admin";
import { alertAdmin } from "@/lib/avisos/alert";
import { messageText } from "@/lib/avisos/textos";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Segunda opinión del muro de pago, SOLO cuando `userHasPaidAccess` dijo que no.
 *
 * `userHasPaidAccess` colapsa "no pagó" y "no pude verificar" en `false`
 * (fail-closed). Acá separamos los dos casos para no mandar a comprar de nuevo
 * a alguien que ya pagó cuando la base no responde:
 *  - "paid":    se CONFIRMÓ una compra o cortesía (el primer chequeo tuvo un hipo).
 *  - "unpaid":  la base respondió y no hay compra → al embudo, como siempre.
 *  - "unknown": no se pudo verificar → pantalla de error. Nunca se entra sin
 *               confirmación positiva: el muro no se afloja.
 */
async function confirmAccess(userId: string): Promise<"paid" | "unpaid" | "unknown"> {
  try {
    const admin = createAdminClient();
    const [paid, unlimited] = await Promise.all([
      admin
        .from("credit_ledger")
        .select("id")
        .eq("user_id", userId)
        .eq("reason", "purchase")
        .limit(1)
        .abortSignal(AbortSignal.timeout(4000)),
      admin
        .from("unlimited_users")
        .select("user_id")
        .eq("user_id", userId)
        .limit(1)
        .abortSignal(AbortSignal.timeout(4000)),
    ]);
    if (paid.error || unlimited.error) return "unknown";
    return (paid.data?.length ?? 0) > 0 || (unlimited.data?.length ?? 0) > 0 ? "paid" : "unpaid";
  } catch {
    return "unknown";
  }
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();

  // Garantiza que el usuario Clerk tenga su fila en `profiles` (+ créditos de
  // regalo) antes de renderizar la sección autenticada. Idempotente. Si tira
  // (config/base), NO cortamos acá: el chequeo de acceso de abajo decide.
  let profileError: string | null = null;
  try {
    await ensureProfile();
  } catch (err) {
    profileError = err instanceof Error ? err.message : String(err);
  }

  // GATE DURO del paywall paga-primero. El proxy ya garantiza que hay sesión.
  // Sin compra (o cortesía) confirmada → /comprar. Sin poder VERIFICAR →
  // pantalla de error (nunca /comprar ni /plan: podría ser un pagador).
  // redirect() lanza NEXT_REDIRECT: va fuera de cualquier try/catch.
  if (userId && !(await userHasPaidAccess(userId))) {
    const second = await confirmAccess(userId);
    if (second === "unknown") {
      // Fuera del render: si la base está caída, alertAdmin no puede trabar la
      // pantalla (y cae solo al mail directo con freno).
      after(() =>
        alertAdmin({
          kind: "access_check_failed",
          severity: "M",
          dedupeKey: "access_check_failed",
          userId,
          escalate: { atOccurrences: 5, withinMinutes: 10 },
          details: {
            route: "app/(app)/layout",
            error: profileError ?? "userHasPaidAccess y la segunda verificación no respondieron",
          },
        }),
      );
      return <ServiceErrorScreen message={messageText("access_check_failed", {})} />;
    }
    if (second === "unpaid") {
      redirect("/comprar");
    }
    // second === "paid": confirmado positivamente, entra.
  }

  const admin = isAdmin(userId);

  return (
    <AppProviders>
      {/*
        AppBackground aporta el gradient a TODA la sección autenticada. Sidebar
        (desktop, con la campanita en la fila del logo), MobileTopbar (mobile:
        logo, saldo y campanita) y BottomNav viven adentro del shell.
      */}
      <AppBackground>
        <div className="flex min-h-dvh flex-1">
          <Sidebar isAdmin={admin} />
          <main className="flex flex-1 flex-col pb-24 lg:pb-0">
            <MobileTopbar isAdmin={admin} />
            {/* Banner de IA caída: primer contenido del main (solo aparece caída). */}
            <AiDownBanner />
            {children}
          </main>
        </div>
        <BottomNav />
      </AppBackground>
    </AppProviders>
  );
}
