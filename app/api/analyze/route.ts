import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureProfile } from "@/lib/auth/ensure-profile";
import { userHasPaidAccess } from "@/lib/auth/paid-access";
import { analyzeImage } from "@/lib/ai/image-analyzer";
import { analyzeRequestSchema } from "@/lib/validations/analyze";

/**
 * POST /api/analyze — análisis de imagen con Gemini Vision (Oráculo),
 * SERVER-SIDE con la key propia de Vendí.
 *
 * Modelo de créditos: analizar gasta 1 crédito de la bolsa SEPARADA de análisis
 * (`profiles.analysis_credits_remaining`), distinta de los créditos de generar.
 * El usuario arranca con 10 análisis de regalo. Si el análisis falla, se
 * reembolsa el crédito.
 *
 * Los créditos de análisis se mutan SOLO con el cliente admin (service_role)
 * vía deduct_analysis_credit / grant_analysis_credits — el usuario nunca puede
 * regalárselos.
 *
 * Recibe { imageDataUrl, ratio }. Requiere usuario logueado.
 */

// El análisis es 1 llamada a Gemini (hasta 60s por AbortController) + parseo.
// Techo holgado para no morir entre el deduct y el refund del crédito.
export const maxDuration = 120;

export async function POST(req: Request) {
  // 1. Auth (Clerk). El id canónico del usuario es el id de Clerk (string
  // `user_xxx`), que viaja como `sub` en el JWT y resuelve la RLS de Supabase
  // (`auth.jwt()->>'sub'`). El cliente de `lib/supabase/server.ts` ya inyecta
  // ese token.
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  // Candado PAGA-PRIMERO también en la API (no solo en el proxy de páginas): un
  // usuario logueado que NUNCA pagó no puede analizar, aunque arrastre saldo
  // heredado de antes del paywall. Misma fuente de verdad que el middleware:
  // una compra en `credit_ledger` o estar en la allowlist de acceso libre.
  if (!(await userHasPaidAccess(userId))) {
    return NextResponse.json(
      { error: "Necesitás una compra activa para usar esta función." },
      { status: 403 },
    );
  }
  // Red de seguridad: provisiona el perfil del usuario Clerk si aún no existe.
  // Idempotente. Reemplaza al trigger handle_new_user (muerto con Clerk).
  await ensureProfile();
  const supabase = await createClient();

  // 2. Validación estricta del body.
  const body = await req.json().catch(() => null);
  const parsed = analyzeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Request inválido", details: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const { imageDataUrl, ratio } = parsed.data;

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Servicio no configurado" },
      { status: 503 },
    );
  }

  // Cliente admin (service_role): se usa para el chequeo de ilimitados y para
  // las mutaciones de créditos de análisis (deduct/grant) más abajo.
  const admin = createAdminClient();

  // 3. Pre-check de créditos de análisis (early reject, no gastamos en Google).
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("analysis_credits_remaining")
    .eq("id", userId)
    .single();
  if (profileErr || !profile) {
    return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });
  }
  // Usuarios ilimitados (allowlist) saltan el rechazo por saldo. El deduct de
  // abajo ya es no-op server-side para ellos.
  const { data: isUnlimited } = await admin.rpc("is_unlimited", {
    p_user_id: userId,
  });
  if (!isUnlimited && (profile.analysis_credits_remaining ?? 0) < 1) {
    return NextResponse.json(
      {
        error: "insufficient_analysis_credits",
        message: "Te quedaste sin créditos de análisis.",
        analysisCreditsRemaining: profile.analysis_credits_remaining ?? 0,
      },
      { status: 402 },
    );
  }

  // 4. Reservar 1 crédito de análisis (atómico, service_role).
  const { error: deductErr } = await admin.rpc("deduct_analysis_credit", {
    p_user_id: userId,
  });
  if (deductErr) {
    return NextResponse.json(
      { error: "insufficient_analysis_credits", message: deductErr.message },
      { status: 402 },
    );
  }

  // 5. Analizar. Si falla, reembolsar el crédito.
  const result = await analyzeImage({ apiKey, imageDataUrl, ratio });
  if (!result.ok) {
    await admin.rpc("grant_analysis_credits", {
      p_user_id: userId,
      p_amount: 1,
    });
    return NextResponse.json(
      { error: "analysis_failed", detail: result.error },
      { status: 502 },
    );
  }

  return NextResponse.json(result.analysis, { status: 200 });
}
