import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { requireAdmin } from "@/lib/avisos/admin";
import { getAiStatus, type AiStatus } from "@/lib/avisos/ai-gate";
import type { AdminAlertRow, AlertSeverity } from "@/lib/avisos/types";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Datos del panel /admin/avisos (lee con service_role).
 *
 * ⚠️ `requireAdmin()` va ACÁ también (JonSnow #2): el layout no se re-ejecuta en
 * una navegación parcial, así que cada pieza que toca datos de clientes se
 * protege sola. Si no es admin, corta con 404 antes de leer nada.
 */

export type LightState = "ok" | "warn" | "down";

export type PanelAlert = AdminAlertRow & { email: string | null };

export type UnmatchedPayment = {
  id: string;
  pack: string | null;
  credits: number;
  analysisCredits: number;
  lifetime: boolean;
  email: string | null;
  createdAt: string | null;
};

export type Last24h = {
  batches: number;
  failedBatches: number;
  refundedCredits: number;
  sales: number;
  soldCredits: number;
  alertsOpened: number;
};

export type AvisosPanelData = {
  ai: { state: LightState; status: AiStatus | null };
  billing: { state: LightState; openAlerts: number; urgent: number; unmatched: number };
  db: { state: LightState; latencyMs: number | null };
  alerts: { rows: PanelAlert[]; failed: boolean };
  unmatched: { rows: UnmatchedPayment[]; failed: boolean };
  last24h: { data: Last24h | null; failed: boolean };
};

/** Kinds del cobro (semáforo "Cobro"). */
const BILLING_KINDS = new Set([
  "checkout_failed",
  "webhook_secret_missing",
  "webhook_bad_signature",
  "webhook_bad_payload",
  "payment_credit_failed",
  "payment_unmatched",
  "payment_unreconciled",
  "payment_disputed",
  "payment_failed",
  "pass_paid_twice",
  "purchase_email_failed",
]);

const SEVERITY_ORDER: Record<AlertSeverity, number> = { U: 0, M: 1, B: 2 };

type Admin = ReturnType<typeof createAdminClient>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function int(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Emails de Clerk para una lista de ids (nunca tira: sin email se muestra el id). */
async function emailsFor(userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(userIds.filter(Boolean))].slice(0, 100);
  if (unique.length === 0) return out;
  try {
    const client = await clerkClient();
    const { data } = await client.users.getUserList({ userId: unique, limit: unique.length });
    for (const user of data) {
      const email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
      if (email) out.set(user.id, email);
    }
  } catch (err) {
    console.error("[admin/avisos] No se pudieron leer los emails de Clerk:", err instanceof Error ? err.message : err);
  }
  return out;
}

async function loadAlerts(admin: Admin): Promise<{ rows: AdminAlertRow[]; failed: boolean }> {
  try {
    const { data, error } = await admin
      .from("admin_alerts")
      .select("id, kind, severity, dedupe_key, details, user_id, occurrences, first_seen, last_seen, last_emailed_at, resolved_at")
      .is("resolved_at", null)
      .order("last_seen", { ascending: false })
      .limit(200);
    if (error) return { rows: [], failed: true };
    const rows = ((data ?? []) as AdminAlertRow[]).map((r) => ({ ...r, details: asRecord(r.details) }));
    rows.sort(
      (a, b) =>
        (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3) ||
        (a.last_seen < b.last_seen ? 1 : -1),
    );
    return { rows, failed: false };
  } catch {
    return { rows: [], failed: true };
  }
}

async function loadUnmatched(admin: Admin): Promise<{ raw: Record<string, unknown>[]; failed: boolean }> {
  try {
    const { data, error } = await admin
      .from("whop_unmatched_payments")
      .select("*")
      .eq("reconciled", false)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return { raw: [], failed: true };
    return { raw: (data ?? []) as Record<string, unknown>[], failed: false };
  } catch {
    return { raw: [], failed: true };
  }
}

/** Email del comprador dentro del pago estacionado (columna o evento crudo). */
function unmatchedEmail(row: Record<string, unknown>): string | null {
  const direct = str(row.customer_email);
  if (direct) return direct;
  const event = asRecord(row.raw_event);
  const data = asRecord(event.data);
  return str(asRecord(data.user).email) ?? str(data.email) ?? str(asRecord(data.member).email);
}

async function loadLast24h(admin: Admin): Promise<{ data: Last24h | null; failed: boolean }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  try {
    const [gens, refunds, sales, alerts] = await Promise.all([
      admin.from("generations").select("status").gte("created_at", since).limit(5000),
      admin.from("credit_ledger").select("delta").eq("reason", "refund").gte("created_at", since).limit(5000),
      admin.from("whop_processed_payments").select("credits_granted").gte("processed_at", since).limit(1000),
      admin.from("admin_alerts").select("id", { count: "exact", head: true }).gte("first_seen", since),
    ]);
    if (gens.error || refunds.error) return { data: null, failed: true };
    const genRows = (gens.data ?? []) as { status: string }[];
    const saleRows = sales.error ? [] : ((sales.data ?? []) as { credits_granted: number }[]);
    return {
      failed: false,
      data: {
        batches: genRows.length,
        failedBatches: genRows.filter((g) => g.status === "failed").length,
        refundedCredits: ((refunds.data ?? []) as { delta: number }[]).reduce((sum, r) => sum + Math.max(0, int(r.delta)), 0),
        sales: saleRows.length,
        soldCredits: saleRows.reduce((sum, r) => sum + int(r.credits_granted), 0),
        alertsOpened: alerts.error ? 0 : (alerts.count ?? 0),
      },
    };
  } catch {
    return { data: null, failed: true };
  }
}

async function pingDb(admin: Admin): Promise<number | null> {
  const started = Date.now();
  try {
    const { error } = await admin
      .from("service_status")
      .select("id", { head: true, count: "exact" })
      .abortSignal(AbortSignal.timeout(5000));
    if (error) return null;
    return Date.now() - started;
  } catch {
    return null;
  }
}

export async function loadAvisosPanel(): Promise<AvisosPanelData> {
  await requireAdmin();

  let admin: Admin | null = null;
  try {
    admin = createAdminClient();
  } catch {
    admin = null;
  }
  if (!admin) {
    return {
      ai: { state: "warn", status: null },
      billing: { state: "warn", openAlerts: 0, urgent: 0, unmatched: 0 },
      db: { state: "down", latencyMs: null },
      alerts: { rows: [], failed: true },
      unmatched: { rows: [], failed: true },
      last24h: { data: null, failed: true },
    };
  }

  const [aiStatus, latencyMs, alerts, unmatched, last24h] = await Promise.all([
    getAiStatus({ fresh: true }),
    pingDb(admin),
    loadAlerts(admin),
    loadUnmatched(admin),
    loadLast24h(admin),
  ]);

  const userIds = [
    ...alerts.rows.map((a) => a.user_id ?? ""),
    ...unmatched.raw.map((r) => str(r.clerk_user_id) ?? ""),
  ];
  const emails = await emailsFor(userIds);

  const panelAlerts: PanelAlert[] = alerts.rows.map((a) => ({
    ...a,
    email: (a.user_id ? emails.get(a.user_id) : null) ?? str(a.details.customer_email) ?? null,
  }));

  const unmatchedRows: UnmatchedPayment[] = unmatched.raw.map((r) => {
    const userId = str(r.clerk_user_id);
    return {
      id: str(r.whop_payment_id) ?? "—",
      pack: str(r.pack_id) ?? str(r.whop_plan_id),
      credits: int(r.credits),
      analysisCredits: int(r.analysis_credits),
      lifetime: r.is_lifetime === true,
      email: (userId ? emails.get(userId) : null) ?? unmatchedEmail(r),
      createdAt: str(r.created_at),
    };
  });

  const billingAlerts = panelAlerts.filter((a) => BILLING_KINDS.has(a.kind));
  const billingUrgent = billingAlerts.filter((a) => a.severity === "U").length;
  const billingState: LightState =
    billingUrgent > 0 ? "down" : billingAlerts.length > 0 || unmatchedRows.length > 0 ? "warn" : "ok";

  return {
    ai: {
      state: aiStatus === null ? "warn" : aiStatus.ok ? "ok" : "down",
      status: aiStatus,
    },
    billing: {
      state: billingState,
      openAlerts: billingAlerts.length,
      urgent: billingUrgent,
      unmatched: unmatchedRows.length,
    },
    db: { state: latencyMs === null ? "down" : latencyMs > 1500 ? "warn" : "ok", latencyMs },
    alerts: { rows: panelAlerts, failed: alerts.failed },
    unmatched: { rows: unmatchedRows, failed: unmatched.failed },
    last24h,
  };
}
