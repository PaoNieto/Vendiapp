import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { adminClientOrNull, errorText } from "@/lib/avisos/db";
import { limaDateKey, sendAdminDigest } from "@/lib/avisos/digest";
import { cleanupOldNotices, runAvisosMaintenance } from "@/lib/avisos/maintenance";

/**
 * GET /api/cron/avisos — el cron diario de avisos (vercel.json: `0 13 * * *`
 * = 8:00 de Lima).
 *
 *  1. Tandas colgadas: 'processing' hace más de 15 min. Se devuelve SOLO lo
 *     que el ledger dice que se cobró y todavía no tiene devolución (nunca
 *     leyendo solo `generations`: el dueño puede insertar ahí filas falsas).
 *     Quedan 'failed'/'timeout', aviso al cliente y alerta M.
 *  2. Reintenta devoluciones fallidas, recuerda las U abiertas y prueba la IA.
 *  3. Resumen diario a Paolo, AUNQUE ESTÉ VACÍO (si no llega, el canal está roto).
 *  4. Borra los avisos leídos de más de 90 días (nunca ledger ni *_processed_*).
 *
 * Seguridad (JonSnow #4):
 *  - Sin `CRON_SECRET` → 503 (el clásico `Bearer undefined` no pasa).
 *  - `Authorization: Bearer <CRON_SECRET>` comparado con timingSafeEqual.
 *  - Candado diario en `cron_runs`: corre una sola vez por día de Lima aunque
 *    Vercel lo invoque más de una vez.
 * Es pública en proxy.ts (`/api/cron/(.*)`): sin eso, el cron recibe un 307 a
 * /login.
 */

export const maxDuration = 120;

const LOCK_JOB = "avisos_cron";

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** Compara en tiempo constante (hash → mismo largo, sin filtrar el largo). */
function authorized(header: string | null, secret: string): boolean {
  if (!header) return false;
  return timingSafeEqual(sha256(header), sha256(`Bearer ${secret}`));
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "cron_not_configured" }, { status: 503 });
  }
  if (!authorized(req.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dateKey = limaDateKey();
  const admin = adminClientOrNull();
  if (!admin) {
    // Sin base no hay nada que mantener, pero el resumen avisa a Paolo por mail.
    const digest = await sendAdminDigest();
    return NextResponse.json({ status: "no_db", digest: digest.status }, { status: 503 });
  }

  // Candado: una sola corrida por día de Lima.
  try {
    const { data, error } = await admin
      .from("cron_runs")
      .upsert({ job: LOCK_JOB, run_key: dateKey }, { onConflict: "job,run_key", ignoreDuplicates: true })
      .select("job");
    if (!error && Array.isArray(data) && data.length === 0) {
      return NextResponse.json({ status: "already_ran", date: dateKey }, { status: 200 });
    }
    if (error) console.error("[cron/avisos] Candado falló (sigo igual):", error.message);
  } catch (err) {
    console.error("[cron/avisos] Candado tiró (sigo igual):", errorText(err));
  }

  const maintenance = await runAvisosMaintenance();
  const digest = await sendAdminDigest();
  const cleaned = await cleanupOldNotices(90);

  return NextResponse.json(
    {
      status: "ok",
      date: dateKey,
      maintenance,
      digest: digest.status,
      cleanedNotices: cleaned,
    },
    { status: 200 },
  );
}
