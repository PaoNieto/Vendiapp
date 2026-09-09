import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureProfile } from "@/lib/auth/ensure-profile";
import { userHasPaidAccess } from "@/lib/auth/paid-access";
import { serverGenerationRequestSchema } from "@/lib/validations/generations";
import { generateOnServer } from "@/lib/ai/generate-server";
import { getStyleFragment, type StyleId } from "@/lib/styles";
import { SIGNED_URL_TTL_SECONDS, type OutputRatio } from "@/lib/constants";

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

// Peor caso de la tanda: Director (45s) + 5 llamadas de imagen (60s c/u, en
// paralelo) + sharp + uploads a Storage. Sin techo explícito Vercel corta antes
// y la función muere ENTRE el deduct y el refund → el cliente pierde créditos.
export const maxDuration = 300;

/**
 * Frase que aclara el reembolso, SÓLO cuando de verdad hubo uno.
 *
 * Los usuarios de la allowlist (`unlimited_users`) no reciben refund porque su
 * deduct es no-op server-side; prometerles créditos de vuelta sería mentirles, y
 * un refund real les acuñaría saldo de la nada (ya pasó en prod: +2 sin deduct).
 */
function refundNote(amount: number, isUnlimited: boolean): string {
  if (isUnlimited || amount <= 0) return "";
  return ` Te devolvimos ${amount} ${amount === 1 ? "crédito" : "créditos"}.`;
}

export async function POST(req: Request) {
  // 1. Auth (Clerk). El id canónico del usuario es el id de Clerk (string
  // `user_xxx`), que viaja como `sub` en el JWT y resuelve la RLS de Supabase
  // (`auth.jwt()->>'sub'`). El cliente de `lib/supabase/server.ts` ya inyecta
  // ese token, así que las queries de abajo respetan ownership.
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  // Candado PAGA-PRIMERO también en la API (no solo en el proxy de páginas): un
  // usuario logueado que NUNCA pagó no puede generar, aunque arrastre saldo
  // heredado de antes del paywall. Misma fuente de verdad que el middleware:
  // una compra en `credit_ledger` o estar en la allowlist de acceso libre.
  if (!(await userHasPaidAccess(userId))) {
    return NextResponse.json(
      { error: "Necesitás una compra activa para usar esta función." },
      { status: 403 },
    );
  }
  // Red de seguridad: si el usuario Clerk todavía no tiene perfil (ej. primera
  // acción antes de cargar una página del shell), lo creamos acá. Idempotente.
  await ensureProfile();
  const supabase = await createClient();

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
      "id, product_id, reference_images, output_ratio, variations_default, user_prompt, style_id",
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

  // 2.b Tope de generaciones por usuario (migración 0025). Va ANTES del
  // pre-check de créditos y de cualquier llamada a Google: cada tanda cuesta
  // plata real y la ruta no tenía ningún freno para un bucle automatizado. A
  // los que pagan los frena el saldo; a un usuario de `unlimited_users`, nada.
  //
  // Los topes son holgados (30/hora, 100/día): están para cortar un script, no
  // para racionar el uso legítimo.
  //
  // FAIL-OPEN a propósito: si la RPC falla, dejamos pasar. Mismo criterio que
  // `userHasPaidAccess` — un limitador roto no puede convertirse en una app
  // rota para el que sí quiere generar.
  const { data: rateRaw, error: rateErr } = await admin.rpc(
    "check_generation_rate_limit",
    { p_user_id: userId },
  );
  if (!rateErr) {
    // PostgREST devuelve el jsonb de una función escalar como objeto, pero
    // aceptamos [objeto] también: si eso cambiara y sólo leyéramos una forma,
    // el limitador quedaría mudo (siempre "allowed") sin que nadie se entere.
    const rate = (Array.isArray(rateRaw) ? rateRaw[0] : rateRaw) as {
      allowed?: boolean;
      limit_hour?: number;
      limit_day?: number;
    } | null;
    if (rate?.allowed === false) {
      return NextResponse.json(
        {
          error: "rate_limited",
          message: `Llegaste al máximo de tandas por ahora (${rate.limit_hour ?? 30} por hora). Esperá un rato y seguí.`,
        },
        { status: 429 },
      );
    }
  }

  // 3. Pre-check de créditos (early reject, no gastamos en Google)
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("credits_remaining")
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
      user_id: userId,
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
    p_user_id: userId,
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

  // 6. Generar con la key propia.
  // El estilo AUTORITATIVO es el persistido en la versión (style_id, migración
  // 0010): así el server no depende de lo que mande el cliente. Si la versión
  // no tiene estilo, caemos al styleFragment del body (compat / override).
  const versionStyleFragment = getStyleFragment(
    version.style_id as StyleId | null,
  );
  const effectiveStyleFragment = versionStyleFragment || styleFragment;
  const result = await generateOnServer({
    productImages,
    referenceImages,
    ratio,
    variations,
    userPrompt,
    styleFragment: effectiveStyleFragment,
    brand,
  });

  // Si falló TODO: reembolsar el total y marcar failed.
  if (!result.ok) {
    // Refund SOLO si hubo deduct real: para ilimitados el deduct es no-op y
    // un refund acuñaría créditos de la nada (ya pasó en prod: +2 sin deduct).
    if (!isUnlimited) {
      await admin.rpc("grant_credits", {
        p_user_id: userId,
        p_amount: variations,
        p_reason: "refund",
      });
    }
    await admin
      .from("generations")
      .update({ status: "failed", error_message: result.error.kind })
      .eq("id", generationId);
    return NextResponse.json(
      {
        error: "generation_failed",
        detail: result.error,
        // `message` en castellano y para humanos. Sin esto el cliente cae a
        // `data.error` y le muestra al usuario el literal "generation_failed"
        // — que es exactamente lo que reportó Paolo el 2026-09-09. Y además
        // nadie le decía que la plata volvía.
        message: `No pudimos generar las imágenes.${refundNote(variations, isUnlimited)} Probá de nuevo.`,
        refunded: isUnlimited ? 0 : variations,
      },
      { status: 502 },
    );
  }

  // 7. Subir imágenes OK a Storage + insert en generated_images.
  //
  // TODO lo que va de acá para abajo usa el cliente ADMIN (service_role), no el
  // del usuario. Motivo, con evidencia de prod (2026-09-09): el token de sesión
  // de Clerk vive ~60s, pero esta ruta puede tardar hasta 300s (maxDuration). El
  // token llega con la request y NO se renueva mientras corre, así que para
  // cuando el Director + las imágenes terminan, ya venció. Storage rechazaba las
  // subidas con `400 · "exp" claim timestamp check failed` y la tanda entera
  // moría en `upload_failed` — con las imágenes YA generadas y pagadas (230KB
  // cada una, tiradas a la basura). Intermitente por naturaleza: dependía de
  // cuánta vida le quedaba al token al entrar.
  //
  // El ownership ya quedó probado ARRIBA: la versión y el producto se leyeron
  // con el token del usuario bajo RLS, y el `path` va namespaceado por `userId`,
  // que sale de `auth()` y no del body. El service_role acá no afloja ningún
  // borde de seguridad; sólo evita depender de un token que puede vencer.
  const urls: string[] = [];
  let index = 0;
  for (const img of result.images) {
    const path = `${userId}/${generationId}/${index}.jpg`;
    const { error: upErr } = await admin.storage
      .from("generated-images")
      .upload(path, img.buffer, { contentType: img.contentType, upsert: false });
    if (upErr) {
      // si una falla al subir, la contamos como fallida (se reembolsa abajo)
      index += 1;
      continue;
    }
    const { data: signed } = await admin.storage
      .from("generated-images")
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    const url = signed?.signedUrl ?? "";
    if (!url) {
      // Sin signed URL no hay imagen visible: la contamos como fallida (se
      // reembolsa abajo) en vez de insertar una fila rota en la Fábrica.
      index += 1;
      continue;
    }

    await admin.from("generated_images").insert({
      generation_id: generationId,
      user_id: userId,
      image_url: url,
      variation_index: index,
      // El prompt estricto del usuario arranca vacío; es lo que él edita luego.
      strict_prompt: "",
      // El prompt original/base (lo que produjo el modelo) queda read-only acá.
      metadata: { base_prompt: result.finalPrompt },
    });
    urls.push(url);
    index += 1;
  }

  // 8. Reembolsar las variaciones que NO produjeron imagen subida. Ilimitados
  // no reciben refund (su deduct fue no-op; sería acuñar saldo en el ledger).
  const delivered = urls.length;
  const refundCount = variations - delivered;
  if (refundCount > 0 && !isUnlimited) {
    await admin.rpc("grant_credits", {
      p_user_id: userId,
      p_amount: refundCount,
      p_reason: "refund",
    });
  }

  // 9. Cerrar la generación. Con 0 imágenes subidas no hay nada "completado":
  // queda failed (el costo entero ya se reembolsó arriba) y el cliente recibe
  // el mismo contrato de error que un fallo total de generación.
  if (delivered === 0) {
    await admin
      .from("generations")
      .update({ status: "failed", error_message: "upload_failed" })
      .eq("id", generationId);
    return NextResponse.json(
      {
        error: "generation_failed",
        detail: { kind: "upload_failed" },
        message: `Las imágenes se generaron pero no pudimos guardarlas.${refundNote(variations, isUnlimited)} Probá de nuevo.`,
        refunded: isUnlimited ? 0 : variations,
      },
      { status: 502 },
    );
  }
  await admin
    .from("generations")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", generationId);

  const { data: finalProfile } = await admin
    .from("profiles")
    .select("credits_remaining")
    .eq("id", userId)
    .single();

  return NextResponse.json(
    {
      generationId,
      images: urls,
      delivered,
      requested: variations,
      // Cuántos créditos volvieron por las variaciones que no salieron. El
      // cliente lo necesita para no prometerle un reembolso a un ilimitado,
      // que nunca pagó por esa tanda.
      refunded: isUnlimited ? 0 : refundCount,
      creditsRemaining: finalProfile?.credits_remaining ?? null,
    },
    { status: 201 },
  );
}
