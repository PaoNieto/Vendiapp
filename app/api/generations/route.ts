import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverGenerationRequestSchema } from "@/lib/validations/generations";
import { generateOnServer } from "@/lib/ai/generate-server";
import type { OutputRatio } from "@/lib/constants";

/**
 * POST /api/generations — generación SERVER-SIDE (modelo de créditos).
 *
 * Flujo:
 *  1. Auth: el usuario tiene que estar logueado.
 *  2. Buscar la versión (RLS garantiza que es del usuario) → producto, refs,
 *     ratio, variaciones, prompt.
 *  3. Pre-check de créditos: si no le alcanza, rechazar ANTES de gastar plata
 *     en Google.
 *  4. Crear el row `generations` (status processing).
 *  5. RESERVAR créditos (deduct atómico). Si no alcanza, marcar failed + 402.
 *  6. Generar con la key propia de Vendí (generateOnServer).
 *  7. Subir imágenes OK a Storage + insert en generated_images.
 *  8. Reembolsar los créditos de las variaciones que fallaron.
 *  9. Marcar completed y devolver { generationId, images, creditsRemaining }.
 *
 * Los créditos se mutan SOLO con el cliente admin (service_role) vía las RPC
 * deduct_credits / grant_credits — el usuario nunca las puede invocar directo.
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

  // Validación del body
  const body = await req.json().catch(() => null);
  const parsed = serverGenerationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Request inválido", details: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const { versionId, styleFragment, brand } = parsed.data;

  // 2. Versión (RLS: solo si es del usuario)
  const { data: version, error: versionErr } = await supabase
    .from("versions")
    .select(
      "id, product_id, reference_images, output_ratio, variations_default, user_prompt",
    )
    .eq("id", versionId)
    .single();
  if (versionErr || !version) {
    return NextResponse.json({ error: "Versión no encontrada" }, { status: 404 });
  }

  // Producto padre (tabla projects)
  const { data: product, error: productErr } = await supabase
    .from("projects")
    .select("id, product_images")
    .eq("id", version.product_id)
    .single();
  if (productErr || !product) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  const productImages: string[] = Array.isArray(product.product_images)
    ? (product.product_images as string[])
    : [];
  const referenceImages: string[] = Array.isArray(version.reference_images)
    ? (version.reference_images as string[])
    : [];
  const ratio = version.output_ratio as OutputRatio;
  const variations = Math.max(1, version.variations_default ?? 1);
  const userPrompt: string | undefined =
    typeof version.user_prompt === "string" && version.user_prompt.trim().length > 0
      ? version.user_prompt
      : undefined;

  if (productImages.length === 0) {
    return NextResponse.json(
      { error: "Este producto no tiene fotos cargadas" },
      { status: 400 },
    );
  }

  // Cliente admin (service_role): se usa para el chequeo de ilimitados y para
  // las mutaciones de créditos (deduct/grant) más abajo.
  const admin = createAdminClient();

  // 3. Pre-check de créditos (early reject, no gastamos en Google)
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("credits_remaining")
    .eq("id", user.id)
    .single();
  if (profileErr || !profile) {
    return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });
  }
  // Usuarios ilimitados (allowlist) saltan el rechazo por saldo. El deduct de
  // abajo ya es no-op server-side para ellos.
  const { data: isUnlimited } = await admin.rpc("is_unlimited", {
    p_user_id: user.id,
  });
  if (!isUnlimited && (profile.credits_remaining ?? 0) < variations) {
    return NextResponse.json(
      {
        error: "insufficient_credits",
        message: `Necesitás ${variations} créditos y tenés ${profile.credits_remaining ?? 0}.`,
        creditsRemaining: profile.credits_remaining ?? 0,
      },
      { status: 402 },
    );
  }

  // 4. Crear el row de generación (processing)
  const { data: generation, error: genErr } = await supabase
    .from("generations")
    .insert({
      user_id: user.id,
      project_id: product.id,
      version_id: version.id,
      status: "processing",
      product_images: productImages,
      reference_images: referenceImages,
      user_prompt: userPrompt ?? null,
      output_ratio: ratio,
      variations_requested: variations,
    })
    .select("id")
    .single();
  if (genErr || !generation) {
    return NextResponse.json(
      { error: "No se pudo crear la generación" },
      { status: 500 },
    );
  }
  const generationId = generation.id as string;

  // 5. RESERVAR créditos (deduct atómico vía service_role)
  const { error: deductErr } = await admin.rpc("deduct_credits", {
    p_user_id: user.id,
    p_amount: variations,
    p_generation_id: generationId,
  });
  if (deductErr) {
    await supabase
      .from("generations")
      .update({ status: "failed", error_message: "Créditos insuficientes" })
      .eq("id", generationId);
    return NextResponse.json(
      { error: "insufficient_credits", message: deductErr.message },
      { status: 402 },
    );
  }

  // 6. Generar con la key propia
  const result = await generateOnServer({
    productImages,
    referenceImages,
    ratio,
    variations,
    userPrompt,
    styleFragment,
    brand,
  });

  // Si falló TODO: reembolsar el total y marcar failed.
  if (!result.ok) {
    await admin.rpc("grant_credits", {
      p_user_id: user.id,
      p_amount: variations,
      p_reason: "refund",
    });
    await supabase
      .from("generations")
      .update({ status: "failed", error_message: result.error.kind })
      .eq("id", generationId);
    return NextResponse.json(
      { error: "generation_failed", detail: result.error },
      { status: 502 },
    );
  }

  // 7. Subir imágenes OK a Storage + insert en generated_images
  const urls: string[] = [];
  let index = 0;
  for (const img of result.images) {
    const path = `${user.id}/${generationId}/${index}.jpg`;
    const { error: upErr } = await supabase.storage
      .from("generated-images")
      .upload(path, img.buffer, { contentType: img.contentType, upsert: false });
    if (upErr) {
      // si una falla al subir, la contamos como fallida (se reembolsa abajo)
      index += 1;
      continue;
    }
    const ONE_YEAR = 60 * 60 * 24 * 365;
    const { data: signed } = await supabase.storage
      .from("generated-images")
      .createSignedUrl(path, ONE_YEAR);
    const url = signed?.signedUrl ?? "";

    await supabase.from("generated_images").insert({
      generation_id: generationId,
      user_id: user.id,
      image_url: url,
      variation_index: index,
      strict_prompt: result.finalPrompt,
    });
    if (url) urls.push(url);
    index += 1;
  }

  // 8. Reembolsar las variaciones que NO produjeron imagen subida.
  const delivered = urls.length;
  const refundCount = variations - delivered;
  if (refundCount > 0) {
    await admin.rpc("grant_credits", {
      p_user_id: user.id,
      p_amount: refundCount,
      p_reason: "refund",
    });
  }

  // 9. Completar + leer saldo final
  await supabase
    .from("generations")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", generationId);

  const { data: finalProfile } = await supabase
    .from("profiles")
    .select("credits_remaining")
    .eq("id", user.id)
    .single();

  return NextResponse.json(
    {
      generationId,
      images: urls,
      delivered,
      requested: variations,
      creditsRemaining: finalProfile?.credits_remaining ?? null,
    },
    { status: 201 },
  );
}
