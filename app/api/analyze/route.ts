import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { analyzeImage } from "@/lib/ai/image-analyzer";
import type { OutputRatio } from "@/lib/constants";

/**
 * POST /api/analyze — análisis de imagen con Gemini Vision (Oráculo),
 * SERVER-SIDE con la key propia de Vendí (modelo de créditos).
 *
 * Por ahora NO descuenta créditos: el análisis es una herramienta de enganche
 * y el costo de Vision por imagen es bajo. Si más adelante se quiere cobrar,
 * agregar el deduct_credits acá como en /api/generations.
 *
 * Recibe { imageDataUrl, ratio }. Requiere usuario logueado.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    imageDataUrl?: string;
    ratio?: string;
  } | null;

  if (!body?.imageDataUrl || !body.ratio) {
    return NextResponse.json(
      { error: "Faltan imageDataUrl o ratio" },
      { status: 422 },
    );
  }

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Servicio no configurado" },
      { status: 503 },
    );
  }

  const result = await analyzeImage({
    apiKey,
    imageDataUrl: body.imageDataUrl,
    ratio: body.ratio as OutputRatio,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: "analysis_failed", detail: result.error },
      { status: 502 },
    );
  }

  return NextResponse.json(result.analysis, { status: 200 });
}
