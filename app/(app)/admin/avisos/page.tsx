import { Topbar } from "@/components/app/topbar";
import { requireAdmin } from "@/lib/avisos/admin";
import { formatAgo, formatLima } from "@/lib/avisos/mail";
import { AI_CAUSE_LABELS, SEVERITY_LABELS, adminAlertLabel } from "@/lib/avisos/textos";
import type { AlertSeverity } from "@/lib/avisos/types";
import { cn } from "@/lib/utils";
import { loadAvisosPanel, type LightState, type PanelAlert } from "./data";
import { RecheckAiButton, ResolveAlertButton } from "./panel-buttons";

/**
 * /admin/avisos — el panel de Paolo (mockup aprobado, "Lo que ves vos").
 * Acá SÍ aparecen Google, Gemini y Whop: es la causa. El cliente no ve nada.
 * Lo protegen el layout, este page, `loadAvisosPanel()` y cada server action.
 */
export default async function AdminAvisosPage() {
  await requireAdmin();
  const data = await loadAvisosPanel();

  const counts = { U: 0, M: 0, B: 0 } as Record<AlertSeverity, number>;
  for (const a of data.alerts.rows) counts[a.severity] = (counts[a.severity] ?? 0) + 1;

  const ai = data.ai.status;
  const aiCause = ai?.cause ? (AI_CAUSE_LABELS[ai.cause] ?? ai.cause) : null;

  return (
    <>
      <Topbar
        eyebrow="Admin"
        title="Panel de"
        titleAccent="avisos"
        subtitle="Acá llega la causa de cada problema. El cliente no ve nada de esto."
      />

      <div className="flex flex-1 flex-col gap-5 px-4 pb-10 pt-2 sm:px-8 lg:px-10">
        {/* Semáforo */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <LightCard eyebrow="IA · Google Gemini" state={data.ai.state}>
            {ai === null ? (
              <>
                <p className="text-[17px] text-foreground">No se pudo leer el estado</p>
                <p className="text-[12.5px] text-mute">service_status no respondió (¿0028 sin aplicar?).</p>
              </>
            ) : ai.ok ? (
              <>
                <p className="text-[17px] text-foreground">Funciona</p>
                <p className="text-[12.5px] text-mute">Las tandas y los análisis se cobran normal.</p>
              </>
            ) : (
              <>
                <p className="text-[17px] text-foreground">Caída desde {formatLima(ai.since)}</p>
                <p className="text-[12.5px] text-mute">
                  {aiCause ?? "Causa desconocida"}
                  {ai.model ? ` · modelo ${ai.model}` : ""}. Se corta antes de cobrar.
                </p>
              </>
            )}
            <div className="mt-2">
              <RecheckAiButton />
            </div>
          </LightCard>

          <LightCard eyebrow="Cobro · Whop" state={data.billing.state}>
            <p className="text-[17px] text-foreground">
              {data.billing.state === "ok"
                ? "Sin problemas abiertos"
                : `${data.billing.openAlerts} ${data.billing.openAlerts === 1 ? "alerta abierta" : "alertas abiertas"}`}
            </p>
            <p className="text-[12.5px] text-mute">
              {data.billing.urgent > 0 ? `${data.billing.urgent} urgente(s). ` : ""}
              {data.billing.unmatched > 0
                ? `${data.billing.unmatched} ${data.billing.unmatched === 1 ? "pago sin acreditar" : "pagos sin acreditar"}.`
                : "Sin pagos estacionados."}
            </p>
          </LightCard>

          <LightCard eyebrow="Base · Supabase" state={data.db.state}>
            <p className="text-[17px] text-foreground">
              {data.db.latencyMs === null ? "No responde" : `Responde en ${data.db.latencyMs} ms`}
            </p>
            <p className="text-[12.5px] text-mute">
              {data.db.latencyMs === null ? "El panel no pudo leer la base." : "Lectura de prueba desde el server."}
            </p>
          </LightCard>
        </div>

        {/* Alertas abiertas */}
        <section aria-label="Alertas abiertas" className="glass-card flex flex-col gap-1 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-2">
            <h2 className="font-display text-[24px] italic leading-none text-foreground">Alertas abiertas</h2>
            <div className="flex flex-wrap gap-2">
              <SeverityChip severity="U" text={`${counts.U} ${counts.U === 1 ? "urgente" : "urgentes"}`} />
              <SeverityChip severity="M" text={`${counts.M} ${counts.M === 1 ? "media" : "medias"}`} />
              <SeverityChip severity="B" text={`${counts.B} ${counts.B === 1 ? "baja" : "bajas"}`} />
            </div>
          </div>
          {data.alerts.failed ? (
            <p className="py-6 text-center text-sm text-clay">No se pudieron leer las alertas (¿0028 sin aplicar?).</p>
          ) : data.alerts.rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-mute">No hay alertas abiertas.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {data.alerts.rows.map((a) => (
                <AlertRow key={a.id} alert={a} />
              ))}
            </ul>
          )}
        </section>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Plata pendiente */}
          <section aria-label="Plata pendiente" className="glass-card flex flex-col gap-1 p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-2">
              <h2 className="font-display text-[24px] italic leading-none text-foreground">Plata pendiente</h2>
              <span className="font-mono text-[11px] tracking-wide text-mute">Pagos sin atribuir</span>
            </div>
            {data.unmatched.failed ? (
              <p className="py-6 text-center text-sm text-clay">No se pudieron leer los pagos sin atribuir.</p>
            ) : data.unmatched.rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-mute">Ningún pago esperando dueño.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {data.unmatched.rows.map((p) => (
                  <li key={p.id} className="flex flex-col gap-0.5 py-3">
                    <p className="text-[14px] font-medium text-foreground">
                      {p.lifetime ? "Pase Fundador" : (p.pack ?? "Pack desconocido")}
                      <span className="text-mute">
                        {" "}
                        · {p.credits} créditos{p.analysisCredits > 0 ? ` + ${p.analysisCredits} análisis` : ""}
                      </span>
                    </p>
                    <p className="break-all text-[12px] text-mute">
                      {p.email ?? "Sin email"} · {p.id} · {formatAgo(p.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Últimas 24 h */}
          <section aria-label="Últimas 24 horas" className="glass-card flex flex-col gap-3 p-4 sm:p-6">
            <h2 className="font-display text-[24px] italic leading-none text-foreground">Últimas 24 h</h2>
            {data.last24h.failed || !data.last24h.data ? (
              <p className="py-6 text-center text-sm text-clay">No se pudieron leer los números del día.</p>
            ) : (
              <dl className="grid grid-cols-2 gap-3">
                <Stat label="Tandas" value={data.last24h.data.batches} />
                <Stat
                  label="Fallidas"
                  value={
                    data.last24h.data.batches > 0
                      ? `${data.last24h.data.failedBatches} (${Math.round((data.last24h.data.failedBatches / data.last24h.data.batches) * 100)}%)`
                      : data.last24h.data.failedBatches
                  }
                />
                <Stat label="Créditos devueltos" value={data.last24h.data.refundedCredits} />
                <Stat
                  label="Ventas"
                  value={`${data.last24h.data.sales} · ${data.last24h.data.soldCredits} créditos`}
                />
                <Stat label="Alertas nuevas" value={data.last24h.data.alertsOpened} />
              </dl>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */

const LIGHT_LABEL: Record<LightState, string> = { ok: "Funciona", warn: "Atención", down: "Caída" };
const LIGHT_CLASS: Record<LightState, string> = {
  ok: "border-success/30 bg-success/10 text-success",
  warn: "border-butter/30 bg-butter/10 text-butter",
  down: "border-clay/30 bg-clay/10 text-clay",
};
const DOT_CLASS: Record<LightState, string> = { ok: "bg-success", warn: "bg-butter", down: "bg-clay" };

function LightCard({
  eyebrow,
  state,
  children,
}: {
  eyebrow: string;
  state: LightState;
  children: React.ReactNode;
}) {
  return (
    <div className="glass-card flex flex-col gap-1.5 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2 pb-1">
        <span className="eyebrow">{eyebrow}</span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none",
            LIGHT_CLASS[state],
          )}
        >
          <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", DOT_CLASS[state])} />
          {LIGHT_LABEL[state]}
        </span>
      </div>
      {children}
    </div>
  );
}

const SEVERITY_CLASS: Record<AlertSeverity, string> = {
  U: "border-clay/30 bg-clay/10 text-clay",
  M: "border-butter/30 bg-butter/10 text-butter",
  B: "border-border bg-foreground/5 text-mute",
};

function SeverityChip({ severity, text }: { severity: AlertSeverity; text: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none",
        SEVERITY_CLASS[severity],
      )}
    >
      {text}
    </span>
  );
}

function AlertRow({ alert }: { alert: PanelAlert }) {
  const { cause, detail } = describeAlert(alert);
  const sameTime = alert.first_seen === alert.last_seen;
  return (
    <li className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityChip severity={alert.severity} text={SEVERITY_LABELS[alert.severity] ?? alert.severity} />
          <p className="text-[14.5px] font-medium text-foreground">{adminAlertLabel(alert.kind)}</p>
        </div>
        {cause ? <p className="break-words text-[13px] leading-snug text-ink-soft">{cause}</p> : null}
        {detail ? <p className="break-all font-mono text-[11px] leading-relaxed text-mute">{detail}</p> : null}
        <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-mute">
          <span>
            <b className="font-mono text-foreground">×{alert.occurrences}</b>
          </span>
          {alert.email || alert.user_id ? <span className="break-all">{alert.email ?? alert.user_id}</span> : null}
          <span>{sameTime ? formatLima(alert.first_seen) : `Primera ${formatLima(alert.first_seen)}`}</span>
          {!sameTime ? <span>Última {formatLima(alert.last_seen)}</span> : null}
        </p>
      </div>
      {alert.kind === "refund_failed" ? (
        // Sin [Marcar resuelta]: el cron solo reintenta las `refund_failed`
        // ABIERTAS. Cerrarla a mano deja al cliente sin su devolución.
        <span className="shrink-0 font-mono text-[11px] tracking-wide text-mute sm:max-w-[160px] sm:text-right">
          Se reintenta sola en el cron
        </span>
      ) : (
        <ResolveAlertButton dedupeKey={alert.dedupe_key} />
      )}
    </li>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3">
      <dt className="text-[11px] text-mute">{label}</dt>
      <dd className="font-mono text-[18px] font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Causa legible de una alerta (para Paolo: acá sí van proveedor y códigos)   */
/* -------------------------------------------------------------------------- */

const DETAIL_KEYS = [
  "product",
  "generation_id",
  "version_id",
  "analysis_id",
  "charged",
  "delivered",
  "requested",
  "refunded",
  "amount",
  "bucket",
  "pack",
  "plan_id",
  "amount_usd",
  "whop_payment_id",
  "customer_email",
  "route",
  "stage",
  "count",
  "method",
  "event",
] as const;

function short(value: unknown, max = 240): string | null {
  if (value === null || value === undefined || value === "") return null;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function describeAlert(alert: PanelAlert): { cause: string | null; detail: string | null } {
  const d = alert.details;
  let cause: string | null = null;
  if (alert.kind === "ai_down") {
    const label = typeof d.cause === "string" ? (AI_CAUSE_LABELS[d.cause] ?? d.cause) : null;
    const http = typeof d.status === "number" ? ` · HTTP ${d.status}` : "";
    const model = typeof d.model === "string" ? ` · ${d.model}` : "";
    cause = [label ? `${label}${http}${model}` : null, short(d.message)].filter(Boolean).join(" — ") || null;
  } else {
    cause =
      [short(d.cause), short(d.block_reason), short(d.reason), short(d.error), short(d.raw)]
        .filter(Boolean)
        .join(" — ") || null;
  }
  if (alert.kind === "batch_timeout" && d.needs_review === true) {
    cause = `${cause ? `${cause} — ` : ""}No se pudo devolver solo: revisala a mano.`;
  }
  const detail =
    DETAIL_KEYS.map((key) => {
      const v = short(d[key], 80);
      return v ? `${key}: ${v}` : null;
    })
      .filter(Boolean)
      .join(" · ") || null;
  return { cause, detail };
}
