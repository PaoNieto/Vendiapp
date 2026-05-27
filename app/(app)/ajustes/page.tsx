"use client";

import Link from "next/link";
import { ArrowUpRight, Mail } from "lucide-react";
import { useUser } from "@/lib/auth/use-user";
import { cn } from "@/lib/utils";

/**
 * Ajustes — pagina minima.
 *
 * Decision de producto: solo Correo (lectura) + estado de Plan + CTA de upgrade.
 * El upgrade lleva a /upgrade (landing externa que se va a construir aparte).
 *
 * El sistema de suscripciones todavia no existe (no hay Stripe, no hay tabla
 * `subscriptions`). El plan se hardcodea como "free" hasta que Integral
 * (integraciones) cablee el plumbing real. Cuando ese momento llegue, leer
 * `currentPlan` del store que corresponda.
 */
export default function AjustesPage() {
  const { user } = useUser();
  const email = user?.email ?? "—";
  // TODO(integral): cuando exista el sistema de suscripciones, leer el plan
  // real del store en vez de hardcodear "free".
  const currentPlan: "free" | "pro" = "free";

  return (
    <div className="px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-medium tracking-tight text-foreground sm:text-3xl">
          Ajustes
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tu cuenta y tu plan.
        </p>

        <div className="mt-8 flex flex-col gap-5">
          <AccountSection email={email} />
          <PlanSection currentPlan={currentPlan} />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function AccountSection({ email }: { email: string }) {
  return (
    <section className="glass-card flex flex-col gap-4 p-6 sm:p-7">
      <span className="eyebrow">Cuenta</span>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">Correo</span>
        <div className="flex items-center gap-2">
          <Mail
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <span className="break-all text-sm font-medium text-foreground">
            {email}
          </span>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function PlanSection({ currentPlan }: { currentPlan: "free" | "pro" }) {
  const isFree = currentPlan === "free";

  return (
    <section className="glass-card flex flex-col gap-5 p-6 sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow">Tu plan</span>
        <PlanBadge plan={currentPlan} />
      </div>

      <p className="text-sm text-foreground">
        {isFree
          ? "Estás usando Vendí en su plan gratuito."
          : "Tenés Vendí Pro activo."}
      </p>

      <Link
        href="/upgrade"
        className={cn(
          "inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3",
          "text-sm font-semibold",
          isFree
            ? "bg-pill-bg text-pill-fg hover:opacity-90"
            : "border border-border bg-card text-foreground hover:bg-foreground/5",
          "transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pill-bg/40",
        )}
      >
        {isFree ? "Subir a Pro" : "Gestionar plan"}
        <ArrowUpRight className="h-4 w-4" aria-hidden />
      </Link>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function PlanBadge({ plan }: { plan: "free" | "pro" }) {
  if (plan === "pro") {
    return (
      <span className="rounded-full bg-pill-bg px-3 py-1 text-xs font-semibold uppercase tracking-wide text-pill-fg">
        Pro
      </span>
    );
  }
  return (
    <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      Free
    </span>
  );
}
