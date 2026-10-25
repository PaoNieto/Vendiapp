import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureProfile } from "@/lib/auth/ensure-profile";
import { userHasPaidAccess } from "@/lib/auth/paid-access";
import { regenerateImageRequestSchema } from "@/lib/validations/generations";
import { generateOnServer, prepareProductParts } from "@/lib/ai/generate-server";
import { getStyleFragment, type StyleId } from "@/lib/styles";
import { type OutputRatio } from "@/lib/constants";
import { aiOutageCause, isInputBlocked, type GeminiError } from "@/lib/ai/gemini-client";
import { isInsufficientCreditsError } from "@/lib/generations/format";
import { aiGate, watchAiOutage } from "@/lib/avisos/ai-gate";
import { alertAdmin } from "@/lib/avisos/alert";
import { runAfter } from "@/lib/avisos/db";
import { maybeNotifyCreditsLow, notifyUser } from "@/lib/avisos/notify";
import {
  aiUnavailableBody,
  alertFailure,
  alertOutputBlockCapped,
  chargeFailedBody,
  checkActionRateLimit,
  claimOutputBlockRefund,
  isOutputBlocked,
  photosUnreadableBody,
  rateLimitedBody,
  refundOrPend,
  type AiRouteError,
} from "@/lib/avisos/rutas";
import { noticeText } from "@/lib/avisos/textos";
import { NOTICE_KEYS } from "@/lib/avisos/types";
import { persistGeneratedImage } from "../_lib/persist";

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
 *  3. Portero de la IA (503 antes de cobrar y antes del 402) + pre-check de
 *     créditos (necesita 1) + fotos del producto legibles (si no, sin cobrar).
 *  4. Reservar 1 crédito (deduct atómico vía service_role). 402 solo si de
 *     verdad no alcanza; otro error es nuestro (503 + alerta U).
 *  5. Generar 1 variación con el prompt estricto (key propia de Vendí).
 *  6. Subir a Storage + insert en generated_images, reintentando con los bytes
 *     en memoria (arrastra el strict_prompt).
 *  7. Si falló: devolver el crédito con su aviso (salvo entrada bloqueada).
 *
 * Avisos: cada regeneración que falla deja UN aviso con llave
 * `regen:<generation_id>:<request_id>` (regenerar cobra sobre la tanda madre,
 * que ya terminó: no usa la llave `gen:`). Al cliente solo
 * `{ error, message, refunded, notificationId? }`.
 */

// Misma razón que /api/generations: la generación (hasta 60s) + sharp + upload
// pueden superar el default de Vercel; si corta, muere entre deduct y refund y
// el usuario pierde el crédito de la regeneración.
export const maxDuration = 300;

/** Texto interno del error, SOLO para Paolo. */
function describeGeminiError(error: GeminiError): string {
  switch (error.kind) {
    case "unknown":
      return error.message;
    case "billing":
      return `billing${error.message ? `: ${error.message}` : ""}`;
    case "model_not_found":
      return `model_not_found${error.model ? ` (${error.model})` : ""}`;
    case "content_blocked":
      return `content_blocked:${error.stage ?? "?"}${error.reason ? ` (${error.reason})` : ""}`;
    default:
      return error.kind;
  }
}

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
    .select("id, name, product_images")
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
  const productName =
    typeof product.name === "string" && product.name.trim() ? product.name.trim() : null;

  if (productImages.length === 0) {
    return NextResponse.json(
      { error: "Este producto no tiene fotos cargadas" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // 3.a Portero de la IA ANTES del 402: con la IA caída no tiene sentido
  // mandarlo a comprar créditos que no puede usar (Hawkeye).
  const gate = await aiGate({ watchUserId: userId });
  if (!gate.open) {
    return NextResponse.json(aiUnavailableBody(), { status: 503 });
  }

  // 3.a' Tope por usuario (60/hora, 300/día; migración 0028). Antes no había
  // ninguno: con el saldo que vuelve en cada devolución, una falla forzada se
  // repetía sin fin a costa de Gemini. Fail-open.
  const rate = await checkActionRateLimit(userId, "regenerate");
  if (!rate.allowed) {
    return NextResponse.json(rateLimitedBody(rate.limitHour), { status: 429 });
  }

  // 3.b Pre-check de créditos (1). Los ilimitados se saltean.
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("credits_remaining")
    .eq("id", userId)
    .single();
  if (profileErr || !profile) {
    return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });
  }
  const { data: isUnlimitedRaw } = await admin.rpc("is_unlimited", {
    p_user_id: userId,
  });
  const isUnlimited = isUnlimitedRaw === true;
  if (!isUnlimited && (profile.credits_remaining ?? 0) < 1) {
    return NextResponse.json(
      {
        error: "insufficient_credits",
        message: "Necesitás 1 crédito para regenerar.",
        creditsRemaining: profile.credits_remaining ?? 0,
        refunded: 0,
      },
      { status: 402 },
    );
  }

  // 3.c Fotos del producto ANTES de cobrar: si no se pueden leer, no se
  // descuenta nada.
  const prepared = await prepareProductParts(productImages);
  if (!prepared.ok) {
    return NextResponse.json(photosUnreadableBody(), { status: 422 });
  }

  // Llave del aviso de ESTE pedido (regenerar cobra sobre la tanda madre).
  const requestId = randomUUID();
  const noticeKey = NOTICE_KEYS.regen(generationId, requestId);
  const ref = { generation_id: generationId, version_id: version.id as string, product: productName };

  // 4. Reservar 1 crédito (deduct atómico vía service_role).
  const { error: deductErr } = await admin.rpc("deduct_credits", {
    p_user_id: userId,
    p_amount: 1,
    p_generation_id: generationId,
  });
  if (deductErr) {
    if (isInsufficientCreditsError(deductErr.message)) {
      return NextResponse.json(
        {
          error: "insufficient_credits",
          message: "Necesitás 1 crédito para regenerar.",
          refunded: 0,
        },
        { status: 402 },
      );
    }
    await alertAdmin({
      kind: "charge_failed",
      severity: "U",
      dedupeKey: "charge_failed:regenerate",
      userId,
      details: { route: "POST /api/generations/regenerate", error: deductErr.message },
    });
    return NextResponse.json(chargeFailedBody(), { status: 503 });
  }
  const charged = isUnlimited ? 0 : 1;

  /**
   * Devuelve el crédito con su aviso «No pudimos terminar la imagen… Ya te
   * devolvimos el crédito: quedaste con {saldo}.» (a un ilimitado, sin el «te
   * devolvimos»), alerta a Paolo y arma la respuesta. Si la devolución falla:
   * «Tu devolución… está en proceso» + alerta U.
   */
  const failWithRefund = async (cause: string, raw: string | null, outage = false) => {
    const refund = await refundOrPend({
      userId,
      amount: 1,
      bucket: "generation",
      kind: "regen_failed",
      data: ref,
      noticeKey,
      generationId,
      versionId: version.id as string,
      product: productName,
    });
    if (outage) await watchAiOutage(userId);
    await alertFailure({
      kind: "regen_failed",
      userId,
      dedupeKey: `regen_failed:${generationId}:${requestId}`,
      outage,
      details: { ...ref, charged, refunded: refund.refunded, cause, raw },
    });
    const responseBody: AiRouteError = {
      error: refund.status === "pending" ? "refund_pending" : "generation_failed",
      message: refund.message,
      refunded: refund.refunded,
      notificationId: refund.notificationId,
    };
    return NextResponse.json(responseBody, { status: outage ? 503 : 502 });
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
    productParts: prepared.parts,
  });

  if (!result.ok) {
    // Google bloqueó la ENTRADA (la foto o el pedido): no se devuelve. Bloqueo
    // de la SALIDA más allá del tope (3 en 24 h): igual, sin devolución y con
    // alerta M (el strictPrompt lo escribe el cliente).
    const outputCapped =
      charged > 0 && isOutputBlocked(result.error) && !(await claimOutputBlockRefund(userId));
    if (isInputBlocked(result.error) || outputCapped) {
      const notificationId = await notifyUser(userId, "input_blocked", ref, noticeKey);
      const blockDetails = {
        ...ref,
        charged,
        refunded: 0,
        block_reason: result.error.kind === "content_blocked" ? result.error.reason ?? null : null,
      };
      if (outputCapped) {
        await alertOutputBlockCapped({
          userId,
          route: "POST /api/generations/regenerate",
          details: blockDetails,
        });
      } else {
        await alertAdmin({
          kind: "input_blocked",
          severity: "B",
          dedupeKey: `input_blocked:regen:${generationId}:${requestId}`,
          userId,
          details: blockDetails,
        });
      }
      const responseBody: AiRouteError = {
        error: "input_blocked",
        message: noticeText("input_blocked", ref),
        refunded: 0,
        notificationId,
      };
      return NextResponse.json(responseBody, { status: 422 });
    }
    return failWithRefund(
      result.error.kind,
      describeGeminiError(result.error),
      aiOutageCause(result.error) !== null,
    );
  }

  const generated = result.images[0];
  if (!generated) {
    return failWithRefund("no_image", "generateOnServer devolvió 0 imágenes");
  }

  // variation_index: siguiente al máximo de la generación (columna NOT NULL).
  const { data: maxRow } = await admin
    .from("generated_images")
    .select("variation_index")
    .eq("generation_id", generationId)
    .order("variation_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextIndex =
    (typeof maxRow?.variation_index === "number" ? maxRow.variation_index : -1) +
    1;

  // 6. Subir a Storage (path único por pedido para no colisionar con las
  // variaciones existentes de esta misma generación) + link + fila, con
  // reintentos y los bytes en memoria. Todo con el cliente ADMIN: el token de
  // Clerk vive ~60s y no se renueva durante la request (pasó en prod el
  // 2026-09-09). El ownership del `imageId` ya se resolvió arriba bajo RLS y el
  // `path` va namespaceado por el `userId` de `auth()`.
  const saved = await persistGeneratedImage(admin, {
    path: `${userId}/${generationId}/regen-${Date.now()}-${requestId.slice(0, 8)}.jpg`,
    buffer: generated.buffer,
    contentType: generated.contentType,
    selectRow: true,
    row: {
      generation_id: generationId,
      user_id: userId,
      variation_index: nextIndex,
      // Arrastra el strict_prompt para que el usuario pueda seguir iterando
      // desde ahí. `base_prompt` = prompt final read-only.
      strict_prompt: strictPrompt,
      metadata: { base_prompt: result.finalPrompt, regenerated: true },
    },
  });
  if (!saved.ok) {
    if (saved.countsAsDelivered) {
      // El archivo quedó en la carpeta del cliente y no se pudo borrar: cuenta
      // como entregada (JonSnow #1), no se devuelve. Paolo lo revisa.
      // (ownerDeleted: el dueño borró la tanda mientras corría → B.)
      await alertAdmin({
        kind: "image_lost",
        severity: saved.ownerDeleted ? "B" : "M",
        dedupeKey: `image_lost:regen:${generationId}:${requestId}`,
        userId,
        details: { ...ref, stage: saved.stage, raw: saved.error, charged, refunded: 0 },
      });
      const notificationId = await notifyUser(userId, "regen_failed", { ...ref, refunded: 0 }, noticeKey);
      const responseBody: AiRouteError = {
        error: "generation_failed",
        message: noticeText("regen_failed", { ...ref, refunded: 0 }),
        refunded: 0,
        notificationId,
      };
      return NextResponse.json(responseBody, { status: 502 });
    }
    // La perdimos nosotros aun reintentando: se devuelve.
    return failWithRefund(`upload_failed:${saved.stage}`, saved.error);
  }

  const { data: finalProfile } = await admin
    .from("profiles")
    .select("credits_remaining")
    .eq("id", userId)
    .single();
  const creditsRemaining =
    typeof finalProfile?.credits_remaining === "number" ? finalProfile.credits_remaining : null;
  runAfter(() =>
    maybeNotifyCreditsLow({ userId, balance: creditsRemaining, unlimited: isUnlimited }),
  );

  return NextResponse.json(
    {
      image: saved.row,
      creditsRemaining,
    },
    { status: 201 },
  );
}
