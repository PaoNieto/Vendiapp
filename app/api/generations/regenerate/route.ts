import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureProfile } from "@/lib/auth/ensure-profile";
import { userHasPaidAccess } from "@/lib/auth/paid-access";
import { regenerateImageRequestSchema } from "@/lib/validations/generations";
import { generateOnServer } from "@/lib/ai/generate-server";
import { getStyleFragment, type StyleId } from "@/lib/styles";
import type { OutputRatio } from "@/lib/constants";

/**
 * POST /api/generations/regenerate — REGENERACIÓN por imagen con PROMPT ESTRICTO.
 *
 * A diferencia de /api/generations (que arma el prompt desde la versión: estilo
 * + Director), acá manda el TEXTO del usuario. El `strictPrompt` es autoritativo:
 * la generación lo cumple al pie de la letra, pero MANTIENE el producto, las
 * referencias de escena y el estilo elegido — el texto solo gana en conflicto
 * (ver `generateOnServer({ strictPrompt })`).
 *
 * Flujo (cobra 1 crédito, 1 imagen):
 *  1. Auth Clerk + ensureProfile.
 *  2. Resolver por `imageId` (RLS): imagen → generación → versión → producto.
 *  3. Pre-check de créditos (necesita 1). 402 si no alcanza.
 *  4. Reservar 1 crédito (deduct atómico vía service_role).
 *  5. Generar 1 variación con el prompt estricto (key propia de Vendí).
 *  6. Subir a Storage + insert en generated_images (arrastra el strict_prompt).
 *  7. Si falló: reembolsar el crédito. Devolver { image, creditsRemaining }.
 */

// Misma razón que /api/generations: la generación (hasta 60s) + sharp + upload
// pueden superar el default de Vercel; si corta, muere entre deduct y refund y
// el usuario pierde el crédito de la regeneración.
export const maxDuration = 300;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  // Candado PAGA-PRIMERO también en la API (no solo en el proxy de páginas): un
  // usuario logueado que NUNCA pagó no puede regenerar, aunque arrastre saldo
  // heredado de antes del paywall. Misma fuente de verdad que el middleware:
  // una compra en `credit_ledger` o estar en la allowlist de acceso libre.
  if (!(await userHasPaidAccess(userId))) {
    return NextResponse.json(
      { error: "Necesitás una compra activa para usar esta función." },
      { status: 403 },
    );
  }
  await ensureProfile();
  const supabase = await createClient();

  // Validación del body
  const body = await req.json().catch(() => null);
  const parsed = regenerateImageRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Request inválido", details: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const { imageId, strictPrompt } = parsed.data;

  // 2. Resolver la cadena imagen → generación → versión → producto. RLS
  // garantiza ownership en cada salto (devuelve null si no es del usuario).
  const { data: image, error: imageErr } = await supabase
    .from("generated_images")
    .select("id, generation_id")
    .eq("id", imageId)
    .single();
  if (imageErr || !image) {
    return NextResponse.json({ error: "Imagen no encontrada" }, { status: 404 });
  }
  const generationId = image.generation_id as string;

  const { data: generation, error: genErr } = await supabase
    .from("generations")
    .select("id, version_id, project_id")
    .eq("id", generationId)
    .single();
  if (genErr || !generation || !generation.version_id) {
    return NextResponse.json(
      { error: "No se pudo resolver la versión de esta imagen" },
      { status: 404 },
    );
  }

  const { data: version, error: versionErr } = await supabase
    .from("versions")
    .select("id, product_id, reference_images, output_ratio, style_id")
    .eq("id", generation.version_id)
    .single();
  if (versionErr || !version) {
    return NextResponse.json({ error: "Versión no encontrada" }, { status: 404 });
  }

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

  if (productImages.length === 0) {
    return NextResponse.json(
      { error: "Este producto no tiene fotos cargadas" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // 3. Pre-check de créditos (1). Los ilimitados se saltean.
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("credits_remaining")
    .eq("id", userId)
    .single();
  if (profileErr || !profile) {
    return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });
  }
  const { data: isUnlimited } = await admin.rpc("is_unlimited", {
    p_user_id: userId,
  });
  if (!isUnlimited && (profile.credits_remaining ?? 0) < 1) {
    return NextResponse.json(
      {
        error: "insufficient_credits",
        message: "Necesitás 1 crédito para regenerar.",
        creditsRemaining: profile.credits_remaining ?? 0,
      },
      { status: 402 },
    );
  }

  // 4. Reservar 1 crédito (deduct atómico vía service_role).
  const { error: deductErr } = await admin.rpc("deduct_credits", {
    p_user_id: userId,
    p_amount: 1,
    p_generation_id: generationId,
  });
  if (deductErr) {
    return NextResponse.json(
      { error: "insufficient_credits", message: deductErr.message },
      { status: 402 },
    );
  }

  // Helper: reembolsa el crédito reservado ante cualquier fallo posterior.
  // No-op para ilimitados: su deduct no descontó nada, así que un refund
  // acuñaría créditos de la nada en el ledger.
  const refund = async () => {
    if (isUnlimited) return;
    await admin.rpc("grant_credits", {
      p_user_id: userId,
      p_amount: 1,
      p_reason: "refund",
    });
  };

  // 5. Generar 1 variación con el prompt estricto. Pasamos el estilo de la
  //    versión (style_id) para MANTENERLO: en estricto el texto del usuario gana
  //    solo donde haya conflicto, pero el estilo elegido se sigue honrando.
  const styleFragment = getStyleFragment(version.style_id as StyleId | null);
  const result = await generateOnServer({
    productImages,
    referenceImages,
    ratio,
    variations: 1,
    strictPrompt,
    styleFragment,
  });

  if (!result.ok) {
    await refund();
    return NextResponse.json(
      { error: "generation_failed", detail: result.error },
      { status: 502 },
    );
  }

  const generated = result.images[0];
  if (!generated) {
    await refund();
    return NextResponse.json(
      { error: "generation_failed", detail: { kind: "unknown" } },
      { status: 502 },
    );
  }

  // 6. Subir a Storage (path único por timestamp para no colisionar con las
  // variaciones existentes de esta misma generación).
  const path = `${userId}/${generationId}/regen-${Date.now()}.jpg`;
  const { error: upErr } = await supabase.storage
    .from("generated-images")
    .upload(path, generated.buffer, {
      contentType: generated.contentType,
      upsert: false,
    });
  if (upErr) {
    await refund();
    return NextResponse.json(
      { error: "upload_failed", message: upErr.message },
      { status: 502 },
    );
  }
  const ONE_YEAR = 60 * 60 * 24 * 365;
  const { data: signed } = await supabase.storage
    .from("generated-images")
    .createSignedUrl(path, ONE_YEAR);
  const url = signed?.signedUrl ?? "";
  if (!url) {
    // Se subió pero no pudo firmarse la URL: sin imagen visible no hay
    // entrega. Reembolsar y avisar, en vez de insertar una fila rota.
    await refund();
    return NextResponse.json(
      { error: "upload_failed", message: "No se pudo firmar la URL de la imagen" },
      { status: 502 },
    );
  }

  // variation_index: siguiente al máximo de la generación (columna NOT NULL).
  const { data: maxRow } = await supabase
    .from("generated_images")
    .select("variation_index")
    .eq("generation_id", generationId)
    .order("variation_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextIndex =
    (typeof maxRow?.variation_index === "number" ? maxRow.variation_index : -1) +
    1;

  // Insert de la nueva imagen. Arrastra el strict_prompt para que el usuario
  // pueda seguir iterando desde ahí. `base_prompt` = prompt final read-only.
  const { data: inserted, error: insertErr } = await supabase
    .from("generated_images")
    .insert({
      generation_id: generationId,
      user_id: userId,
      image_url: url,
      variation_index: nextIndex,
      strict_prompt: strictPrompt,
      metadata: { base_prompt: result.finalPrompt, regenerated: true },
    })
    .select()
    .single();
  if (insertErr) {
    // La imagen se generó y subió, pero no pudo persistirse. No reembolsamos
    // (el crédito produjo una imagen real en Storage), pero avisamos.
    return NextResponse.json(
      { error: "persist_failed", message: insertErr.message },
      { status: 500 },
    );
  }

  const { data: finalProfile } = await supabase
    .from("profiles")
    .select("credits_remaining")
    .eq("id", userId)
    .single();

  return NextResponse.json(
    {
      image: inserted,
      creditsRemaining: finalProfile?.credits_remaining ?? null,
    },
    { status: 201 },
  );
}
