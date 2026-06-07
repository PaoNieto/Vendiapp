import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
export async function POST(req: Request) {
  // 1. Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

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

  // 3. Pre-check de créditos de análisis (early reject, no gastamos en Google).
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("analysis_credits_remaining")
    .eq("id", user.id)
    .single();
  if (profileErr || !profile) {
    return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });
  }
  if ((profile.analysis_credits_remaining ?? 0) < 1) {
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
  const admin = createAdminClient();
  const { error: deductErr } = await admin.rpc("deduct_analysis_credit", {
    p_user_id: user.id,
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
      p_user_id: user.id,
      p_amount: 1,
    });
    return NextResponse.json(
      { error: "analysis_failed", detail: result.error },
      { status: 502 },
    );
  }

  return NextResponse.json(result.analysis, { status: 200 });
}
