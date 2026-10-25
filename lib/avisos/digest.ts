import "server-only";
import { adminClientOrNull, errorText } from "./db";
import { formatAgo, formatLima, formatValue, sendAdminMail, type MailCard, type MailItem, type MailResult } from "./mail";
import { adminAlertLabel } from "./textos";
import type { AdminAlertRow } from "./types";

/**
 * RESUMEN DIARIO a Paolo (8:00 de Lima = `0 13 * * *` UTC en vercel.json).
 *
 * Sale TODOS los días, aunque esté vacío: si un día no llega, Paolo sabe que
 * el canal de alertas está roto (Hawkeye). Trae las U y M abiertas, lo resuelto
 * en las últimas 24 h y cuántas B hay en el panel.
 *
 * Una sola vez por día: candado en `cron_runs` (job 'admin_digest', fecha de
 * Lima), porque Vercel puede invocar el cron más de una vez. Si el mail falla,
 * se libera el candado para que un reintento lo mande. `force: true` lo saltea.
 *
 * NUNCA tira.
 */

export type DigestResult = {
  status: MailResult | "already_sent";
  open: number;
  resolved24h: number;
};

const DIGEST_JOB = "admin_digest";

/** "2026-10-16" en hora de Lima. */
export function limaDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export async function sendAdminDigest(opts: { force?: boolean } = {}): Promise<DigestResult> {
  const now = new Date();
  const dateKey = limaDateKey(now);
  const displayDate = dateKey.split("-").reverse().join("/");
  const admin = adminClientOrNull();

  if (!admin) {
    const status = await sendAdminMail({
      subject: `[Vendí] Resumen diario · ${displayDate} · sin base`,
      badge: "Urgente",
      tone: "urgent",
      eyebrow: "Resumen diario",
      title: "No pude armar el resumen",
      lead: "No hay conexión a la base (falta la config de Supabase en el entorno). Las alertas tampoco se están guardando.",
      cards: [],
    });
    return { status, open: 0, resolved24h: 0 };
  }

  let lockTaken = false;
  if (!opts.force) {
    try {
      const { data, error } = await admin
        .from("cron_runs")
        .upsert({ job: DIGEST_JOB, run_key: dateKey }, { onConflict: "job,run_key", ignoreDuplicates: true })
        .select("job");
      if (!error && Array.isArray(data) && data.length === 0) {
        return { status: "already_sent", open: 0, resolved24h: 0 };
      }
      lockTaken = !error;
      if (error) console.error("[avisos] Candado del resumen falló (sigo igual):", error.message);
    } catch (err) {
      console.error("[avisos] Candado del resumen tiró (sigo igual):", errorText(err));
    }
  }

  let open: AdminAlertRow[] = [];
  let resolved: AdminAlertRow[] = [];
  let loadError: string | null = null;
  try {
    const since24h = new Date(now.getTime() - 24 * 3_600_000).toISOString();
    const [openRes, resolvedRes] = await Promise.all([
      admin
        .from("admin_alerts")
        .select("*")
        .is("resolved_at", null)
        .order("last_seen", { ascending: false })
        .limit(300),
      admin
        .from("admin_alerts")
        .select("*")
        .gte("resolved_at", since24h)
        .order("resolved_at", { ascending: false })
        .limit(50),
    ]);
    if (openRes.error) loadError = openRes.error.message;
    if (resolvedRes.error) loadError = loadError ?? resolvedRes.error.message;
    open = (openRes.data ?? []) as AdminAlertRow[];
    resolved = (resolvedRes.data ?? []) as AdminAlertRow[];
  } catch (err) {
    loadError = errorText(err);
  }

  const urgent = open.filter((a) => a.severity === "U");
  const medium = open.filter((a) => a.severity === "M");
  const low = open.filter((a) => a.severity === "B");

  const toItem = (a: AdminAlertRow): MailItem => ({
    title: adminAlertLabel(a.kind),
    meta: [
      `${a.occurrences} ${a.occurrences === 1 ? "vez" : "veces"}`,
      `desde ${formatLima(a.first_seen)} (${formatAgo(a.first_seen, now.getTime())})`,
      a.user_id ? `cliente ${a.user_id}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    body: compactDetails(a.details),
  });

  const cards: MailCard[] = [];
  if (loadError) {
    cards.push({ heading: "Ojo", empty: `No pude leer todas las alertas: ${formatValue(loadError, 200)}` });
  }
  cards.push(
    { heading: `Urgentes abiertas (${urgent.length})`, items: urgent.slice(0, 30).map(toItem), empty: "Ninguna." },
    { heading: `Medias abiertas (${medium.length})`, items: medium.slice(0, 30).map(toItem), empty: "Ninguna." },
    {
      heading: `Resueltas en las últimas 24 h (${resolved.length})`,
      items: resolved.slice(0, 20).map((a) => ({
        title: adminAlertLabel(a.kind),
        meta: `resuelta ${formatLima(a.resolved_at)} · ${a.occurrences} ${a.occurrences === 1 ? "vez" : "veces"}`,
      })),
      empty: "Ninguna.",
    },
  );
  if (low.length > 0) {
    cards.push({ heading: "Menores", empty: `Hay ${low.length} avisos menores (B) en el panel.` });
  }

  const allClear = urgent.length === 0 && medium.length === 0 && !loadError;
  const subject = allClear
    ? `[Vendí] Resumen diario · ${displayDate} · todo en orden`
    : `[Vendí] Resumen diario · ${displayDate} · ${urgent.length} urgentes, ${medium.length} medias`;

  const status = await sendAdminMail({
    subject,
    badge: allClear ? "Todo en orden" : urgent.length > 0 ? "Urgente" : "Para revisar",
    tone: allClear ? "ok" : urgent.length > 0 ? "urgent" : "info",
    eyebrow: `Resumen diario · ${displayDate}`,
    title: allClear ? "Todo en orden" : "Lo que quedó abierto",
    lead: allClear
      ? "No hay alertas urgentes ni medias abiertas. Este mail llega todos los días: si un día no llega, el canal de alertas está roto."
      : `Abiertas: ${urgent.length} urgentes y ${medium.length} medias. Se resolvieron ${resolved.length} en las últimas 24 h.`,
    cards,
  });

  // Si no salió, se libera el candado para que un reintento del cron lo mande.
  if (status !== "sent" && lockTaken) {
    try {
      await admin.from("cron_runs").delete().eq("job", DIGEST_JOB).eq("run_key", dateKey);
    } catch (err) {
      console.error("[avisos] No se pudo liberar el candado del resumen:", errorText(err));
    }
  }

  return { status, open: open.length, resolved24h: resolved.length };
}

/** Detalles en una línea corta: "causa: billing · modelo: …". */
function compactDetails(details: Record<string, unknown> | null): string | undefined {
  if (!details) return undefined;
  const parts = Object.entries(details)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .slice(0, 6)
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${formatValue(v, 80)}`);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}
