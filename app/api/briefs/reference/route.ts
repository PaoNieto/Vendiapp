import { NextResponse, after } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { userHasPaidAccess } from "@/lib/auth/paid-access";
import { referenceBriefRequestSchema } from "@/lib/validations/briefs";
import { isPipelineV2User } from "@/lib/ai/v2/constants";
import { isGeminiBillingExhausted } from "@/lib/ai/gemini-client";
import {
  referenceBriefMisses,
  reserveBriefQuota,
  runReferenceBriefJob,
} from "@/lib/ai/v2/brief-jobs";
import { createSupabaseV2Store } from "@/lib/ai/v2/store-supabase";

/**
 * POST /api/briefs/reference { versionId } — calcula EN SEGUNDO PLANO las notas
 * de las referencias de una versión (pipeline v2, spec §2.0).
 *
 * Lo dispara el browser (fire-and-forget, keepalive) después de guardar un
 * cambio en `versions.reference_images`. Responde 202 y trabaja en `after()`.
 *
 * Las notas van por PRODUCTO + URL (no por versión): una versión duplicada, o
 * una a la que le sacaron una referencia, reusa las que ya existen sin llamar
 * a Gemini. Solo se calculan las que faltan, y nunca más de las que se
 * reservaron del tope de 40 por hora.
 *
 * Mismas respuestas que /api/briefs/product (204 fuera de la v2, 200 nada que
 * calcular, 202, 401, 403, 404, 422, 429, 503).
 */

// Hasta 5 referencias EN PARALELO: descarga (20s) + nota (75s) + guardado.
export const maxDuration = 120;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!isPipelineV2User(userId)) {
    return new NextResponse(null, { status: 204 });
  }
  if (!(await userHasPaidAccess(userId))) {
    return NextResponse.json(
      { error: "Necesitás una compra activa para usar esta función." },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = referenceBriefRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Request inválido", details: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const { versionId } = parsed.data;

  // Ownership con el token del USUARIO (RLS), versión y producto padre. El
  // nombre del producto entra en el hash de la nota de referencia.
  const supabase = await createClient();
  const { data: version, error: versionErr } = await supabase
    .from("versions")
    .select("id, product_id, reference_images")
    .eq("id", versionId)
    .maybeSingle();
  if (versionErr || !version) {
    return NextResponse.json({ error: "Versión no encontrada" }, { status: 404 });
  }
  const { data: product, error: productErr } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", version.product_id)
    .maybeSingle();
  if (productErr || !product) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  const apiKey = process.env.GOOGLE_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "briefs_unavailable" }, { status: 503 });
  }
  // Sin saldo en Google: ninguna nota saldría. 503 ANTES de reservar cupo.
  if (isGeminiBillingExhausted()) {
    return NextResponse.json(
      { error: "briefs_unavailable", reason: "ai_billing_exhausted" },
      { status: 503 },
    );
  }

  const store = createSupabaseV2Store();
  const productName = typeof product.name === "string" ? product.name : "";
  const referenceImages = version.reference_images as unknown;

  // El costo = las referencias SIN nota (máx 5). Si no falta ninguna, no se
  // reserva cupo ni se encola nada.
  const misses = await referenceBriefMisses(store, {
    productId: product.id as string,
    productName,
    referenceImages,
  });
  if (misses.length === 0) {
    return NextResponse.json({ queued: false, reason: "cached" }, { status: 200 });
  }

  // Reserva ATÓMICA (puede ser parcial: si quedan 2 de cupo y faltan 5 notas,
  // se reservan 2 y el trabajo calcula solo esas).
  const granted = await reserveBriefQuota(store, userId, misses.length);
  if (granted === null) {
    return NextResponse.json({ error: "briefs_unavailable" }, { status: 503 });
  }
  if (granted < 1) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const job = {
    userId,
    productId: product.id as string,
    versionId,
    productName,
    referenceImages,
    maxToCompute: granted,
  };
  after(() => runReferenceBriefJob(job, { apiKey, store }));

  return NextResponse.json({ queued: true }, { status: 202 });
}
