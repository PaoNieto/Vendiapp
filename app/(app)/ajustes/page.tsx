"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  Coins,
  LifeBuoy,
  Mail,
  ScanSearch,
  TrendingDown,
  Wallet,
} from "lucide-react";
import { useUser } from "@/lib/auth/use-user";
import { useCreditos, type LedgerEntry } from "@/lib/creditos/use-creditos";
import { cn } from "@/lib/utils";

// Correo único de soporte + contacto. Después se segmenta (etiquetas en la
// bandeja); por ahora todo entra por acá.
const SUPPORT_EMAIL = "soporte@vendilatam.com";

/**
 * Arma un `mailto:` a soporte con la cuenta del usuario prellenada en el
 * cuerpo. Sirve para identificar quién escribe aunque envíe desde otro correo.
 */
function buildSupportMailto(email: string) {
  const subject = "Ayuda desde la app de Vendí";
  const body = `Hola, necesito ayuda con:\n\n\n\n— — —\nMi cuenta: ${email}\n(dejá esta línea, nos ayuda a encontrarte)`;
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;
}

/**
 * Ajustes — Cuenta + Uso de créditos + Plan.
 *
 * La sección "Uso" es el dashboard de créditos: saldo, consumo del mes,
 * histórico y movimientos recientes (del credit_ledger).
 */
export default function AjustesPage() {
  const { user } = useUser();
  const email = user?.email ?? "—";

  return (
    <div className="px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-medium tracking-tight text-foreground sm:text-3xl">
          Ajustes
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tu cuenta, tu uso y tus créditos.
        </p>

        <div className="mt-8 flex flex-col gap-5">
          <AccountSection email={email} />
          <UsageSection />
          <PlanSection />
          <SupportSection email={email} />
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
          <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="break-all text-sm font-medium text-foreground">
            {email}
          </span>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Uso — dashboard de créditos                                                */
/* -------------------------------------------------------------------------- */

function UsageSection() {
  const { stats, ledger, loading } = useCreditos();

  return (
    <section className="glass-card flex flex-col gap-5 p-6 sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow">Uso</span>
        <Link
          href="/upgrade"
          className="inline-flex items-center gap-1 text-xs font-semibold text-sage-strong hover:underline"
        >
          Comprar créditos
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-3 gap-3">
        <MetricCard
          icon={<Coins className="h-4 w-4" />}
          label="Disponibles"
          value={loading ? "…" : stats.unlimited ? "∞" : stats.balance}
          tone="primary"
        />
        <MetricCard
          icon={<TrendingDown className="h-4 w-4" />}
          label="Usados este mes"
          value={loading ? "…" : stats.consumedThisMonth}
          tone="default"
        />
        <MetricCard
          icon={<Wallet className="h-4 w-4" />}
          label="Usados en total"
          value={loading ? "…" : stats.consumedAllTime}
          tone="default"
        />
      </div>

      {/* Créditos de análisis con IA — bolsa separada de los de generación. */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card px-3.5 py-3">
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <ScanSearch className="h-4 w-4 shrink-0" aria-hidden />
          Análisis con IA disponibles
        </span>
        <span className="text-base font-bold text-foreground">
          {loading ? "…" : stats.unlimited ? "∞" : stats.analysisBalance}
        </span>
      </div>

      {/* Historial reciente */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-muted-foreground">
          Movimientos recientes
        </span>
        {ledger.length === 0 ? (
          <p className="rounded-lg bg-muted px-3 py-4 text-center text-sm text-muted-foreground">
            Todavía no tenés movimientos de créditos.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {ledger.slice(0, 8).map((entry) => (
              <LedgerRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function MetricCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tone: "primary" | "default";
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-xl border p-3.5",
        tone === "primary"
          ? "border-pill-bg/30 bg-pill-bg/[0.06]"
          : "border-border bg-card",
      )}
    >
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
      </span>
      <span className="text-2xl font-bold text-foreground">{value}</span>
      <span className="text-[11px] leading-tight text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

const REASON_LABELS: Record<string, string> = {
  subscription_grant: "Recarga del plan",
  purchase: "Compra de créditos",
  generation: "Generación",
  refund: "Reembolso",
  manual_adjustment: "Ajuste",
  signup_bonus: "Bono de bienvenida",
};

function LedgerRow({ entry }: { entry: LedgerEntry }) {
  const isPositive = entry.delta > 0;
  const label = REASON_LABELS[entry.reason] ?? entry.reason;
  const date = new Date(entry.created_at).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
  });
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex flex-col">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-[11px] text-muted-foreground">{date}</span>
      </div>
      <span
        className={cn(
          "text-sm font-bold",
          isPositive ? "text-sage-strong" : "text-foreground",
        )}
      >
        {isPositive ? "+" : ""}
        {entry.delta}
      </span>
    </li>
  );
}

/* -------------------------------------------------------------------------- */

function PlanSection() {
  return (
    <section className="glass-card flex flex-col gap-5 p-6 sm:p-7">
      <span className="eyebrow">Tu plan</span>
      <p className="text-sm text-foreground">
        Pagás por créditos: 1 crédito = 1 imagen. Sin suscripción que se
        renueve sola — comprás cuando necesitás.
      </p>
      <Link
        href="/upgrade"
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-pill-bg px-5 py-3 text-sm font-semibold text-pill-fg transition-opacity hover:opacity-90"
      >
        Comprar créditos
        <ArrowUpRight className="h-4 w-4" aria-hidden />
      </Link>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Ayuda y soporte — un solo correo para cualquier consulta                   */
/* -------------------------------------------------------------------------- */

function SupportSection({ email }: { email: string }) {
  return (
    <section className="glass-card flex flex-col gap-4 p-6 sm:p-7">
      <span className="eyebrow">Ayuda y soporte</span>
      <p className="text-sm text-foreground">
        ¿Una duda, un problema con tu cuenta o una consulta comercial?
        Escribinos y te responde el fundador, de verdad.
      </p>
      <a
        href={buildSupportMailto(email)}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-pill-bg px-5 py-3 text-sm font-semibold text-pill-fg transition-opacity hover:opacity-90"
      >
        <LifeBuoy className="h-4 w-4" aria-hidden />
        Escribir a soporte
      </a>
      <span className="text-xs text-muted-foreground">
        Nos llega a {SUPPORT_EMAIL} y te contestamos por correo.
      </span>
    </section>
  );
}
