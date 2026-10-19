import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureProfile } from "@/lib/auth/ensure-profile";
import { userHasPaidAccess } from "@/lib/auth/paid-access";
import { analyzeImage } from "@/lib/ai/image-analyzer";
import {
  aiOutageCause,
  isInputBlocked,
  reportAiOutage,
  type GeminiError,
} from "@/lib/ai/gemini-client";
import { isInsufficientCreditsError } from "@/lib/generations/format";
import { analyzeRequestSchema } from "@/lib/validations/analyze";
import { aiGate, watchAiOutage } from "@/lib/avisos/ai-gate";
import { alertAdmin } from "@/lib/avisos/alert";
import { notifyUser } from "@/lib/avisos/notify";
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

/**
 * POST /api/analyze — análisis de imagen con Gemini Vision (Oráculo),
 * SERVER-SIDE con la key propia de Vendí.
 *
 * Modelo de créditos: analizar gasta 1 crédito de la bolsa SEPARADA de análisis
 * (`profiles.analysis_credits_remaining`), distinta de los créditos de generar.
 * Si el análisis falla por algo nuestro o de Google, se devuelve el crédito con
 * su aviso (`refundOrPend`, bolsa 'analysis'); si Google bloqueó la ENTRADA (la
 * imagen del cliente), no se devuelve.
 *
 * Los créditos de análisis se mutan SOLO con el cliente admin (service_role)
 * vía deduct_analysis_credit / grant_analysis_credits — el usuario nunca puede
 * regalárselos.
 *
 * Recibe { imageDataUrl, ratio }. Requiere usuario logueado. Al cliente, en
 * error, solo `{ error, message, refunded, notificationId? }`.
 */

// El análisis es 1 llamada a Gemini (hasta 60s por AbortController) + parseo.
// Techo holgado para no morir entre el deduct y el refund del crédito.
export const maxDuration = 120;

/** Misma forma que valida lib/ai/image-analyzer.ts (parseDataUrl). */
const DATA_URL_RE = /^data:([^;]+);base64,(.+)$/;

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

  // Sin key no hay IA: es caída (alerta U a Paolo) y el cliente ve el banner.
  const apiKey = process.env.GOOGLE_API_KEY?.trim();
  if (!apiKey) {
    await reportAiOutage({ kind: "missing_key" });
    await watchAiOutage(userId);
    return NextResponse.json(aiUnavailableBody(), { status: 503 });
  }

  // 3.a Portero de la IA ANTES del 402: con la IA caída no tiene sentido
  // mandarlo a comprar análisis que no puede usar (Hawkeye).
  const gate = await aiGate({ watchUserId: userId });
  if (!gate.open) {
    return NextResponse.json(aiUnavailableBody(), { status: 503 });
  }

  // 3.b Imagen ilegible ANTES de cobrar (antes se descontaba y se devolvía).
  if (!DATA_URL_RE.test(imageDataUrl)) {
    return NextResponse.json(photosUnreadableBody(), { status: 422 });
  }

  // 3.b' Tope por usuario (30/hora, 100/día; migración 0028). Después del
  // portero (un 503 no gasta cupo) y antes de cobrar. Fail-open.
  const rate = await checkActionRateLimit(userId, "analyze");
  if (!rate.allowed) {
    return NextResponse.json(rateLimitedBody(rate.limitHour), { status: 429 });
  }

  // Cliente admin (service_role): se usa para el chequeo de ilimitados y para
  // las mutaciones de créditos de análisis (deduct/grant) más abajo.
  const admin = createAdminClient();

  // 3.c Pre-check de créditos de análisis (early reject, no gastamos en Google).
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
  const { data: isUnlimitedRaw } = await admin.rpc("is_unlimited", {
    p_user_id: userId,
  });
  const isUnlimited = isUnlimitedRaw === true;
  if (!isUnlimited && (profile.analysis_credits_remaining ?? 0) < 1) {
    return NextResponse.json(
      {
        error: "insufficient_analysis_credits",
        message: "Te quedaste sin créditos de análisis.",
        analysisCreditsRemaining: profile.analysis_credits_remaining ?? 0,
        refunded: 0,
      },
      { status: 402 },
    );
  }

  // 4. Reservar 1 crédito de análisis (atómico, service_role). 402 solo si de
  // verdad no le queda; otro error es nuestro (503 + alerta U).
  const { error: deductErr } = await admin.rpc("deduct_analysis_credit", {
    p_user_id: userId,
  });
  if (deductErr) {
    if (isInsufficientCreditsError(deductErr.message)) {
      return NextResponse.json(
        {
          error: "insufficient_analysis_credits",
          message: "Te quedaste sin créditos de análisis.",
          refunded: 0,
        },
        { status: 402 },
      );
    }
    await alertAdmin({
      kind: "charge_failed",
      severity: "U",
      dedupeKey: "charge_failed:analyze",
      userId,
      details: { route: "POST /api/analyze", error: deductErr.message },
    });
    return NextResponse.json(chargeFailedBody(), { status: 503 });
  }
  const charged = isUnlimited ? 0 : 1;

  // 5. Analizar.
  const requestId = randomUUID();
  const noticeKey = NOTICE_KEYS.analysis(requestId);
  const result = await analyzeImage({ apiKey, imageDataUrl, ratio });
  if (result.ok) {
    return NextResponse.json(result.analysis, { status: 200 });
  }

  // 5.a Google bloqueó la ENTRADA (la imagen del cliente): no se devuelve.
  //     Bloqueo de la SALIDA más allá del tope (3 en 24 h): igual, sin
  //     devolución y con alerta M.
  const outputCapped =
    charged > 0 && isOutputBlocked(result.error) && !(await claimOutputBlockRefund(userId));
  if (isInputBlocked(result.error) || outputCapped) {
    const notificationId = await notifyUser(userId, "input_blocked", {}, noticeKey);
    const blockDetails = {
      charged,
      refunded: 0,
      block_reason: result.error.kind === "content_blocked" ? result.error.reason ?? null : null,
    };
    if (outputCapped) {
      await alertOutputBlockCapped({ userId, route: "POST /api/analyze", details: blockDetails });
    } else {
      await alertAdmin({
        kind: "input_blocked",
        severity: "B",
        dedupeKey: `input_blocked:${noticeKey}`,
        userId,
        details: blockDetails,
      });
    }
    const responseBody: AiRouteError = {
      error: "input_blocked",
      message: noticeText("input_blocked", {}),
      refunded: 0,
      notificationId,
    };
    return NextResponse.json(responseBody, { status: 422 });
  }

  // 5.b Falla nuestra o de Google: se devuelve el análisis con su aviso.
  //     Ilimitados: aviso sin «te devolvimos» (su descuento fue no-op).
  const outage = aiOutageCause(result.error) !== null;
  const refund = await refundOrPend({
    userId,
    amount: 1,
    bucket: "analysis",
    kind: "analysis_failed",
    data: {},
    noticeKey,
  });
  if (outage) await watchAiOutage(userId);
  await alertFailure({
    kind: "analysis_failed",
    userId,
    dedupeKey: `analysis_failed:${requestId}`,
    outage,
    details: {
      charged,
      refunded: refund.refunded,
      cause: result.error.kind,
      raw: describeGeminiError(result.error),
    },
  });
  const responseBody: AiRouteError = {
    error: refund.status === "pending" ? "refund_pending" : "analysis_failed",
    message: refund.message,
    refunded: refund.refunded,
    notificationId: refund.notificationId,
  };
  return NextResponse.json(responseBody, { status: outage ? 503 : 502 });
}
