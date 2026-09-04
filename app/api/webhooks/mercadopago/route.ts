import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { Payment } from "mercadopago";
import { getMercadoPagoClient } from "@/lib/mercadopago/client";
import { getProduct } from "@/lib/billing/catalog";
import { createAdminClient } from "@/lib/supabase/admin";

// crypto + SDK de MP requieren runtime Node (no Edge). force-dynamic: el webhook
// se ejecuta en cada request, nunca se prerenderiza.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/mercadopago — FUENTE DE VERDAD del cobro.
 *
 * Mercado Pago notifica acá cuando cambia un pago. El flujo seguro:
 *   1. Validar la firma `x-signature` (HMAC-SHA256 sobre un manifest con
 *      data.id + x-request-id + ts). El SDK NO valida firma → va a mano.
 *   2. Re-consultar Payment.get(data.id) con el Access Token — NO confiar en el
 *      body del evento (podría ser falsificado / desactualizado).
 *   3. Si status === 'approved': acreditar créditos de forma IDEMPOTENTE
 *      (MP notifica doble y reintenta) vía la RPC process_mp_payment, que
 *      registra el pago y llama grant_credits en una sola transacción atómica.
 *   4. Responder 200 rápido (<22s o MP reintenta).
 *
 * Los créditos se resuelven del catálogo server-side por pack_id, NUNCA del
 * monto/metadata del evento.
 */
export async function POST(req: Request) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[mp-webhook] Falta MP_WEBHOOK_SECRET");
    return NextResponse.json({ error: "No configurado" }, { status: 503 });
  }

  // --- Identificar el recurso notificado (query tiene prioridad sobre el body) ---
  const url = new URL(req.url);
  const queryDataId = url.searchParams.get("data.id");
  const queryType = url.searchParams.get("type") ?? url.searchParams.get("topic");

  const body = await req.json().catch(() => null);
  const type = queryType ?? body?.type ?? body?.action?.split(".")?.[0];
  const dataId = queryDataId ?? body?.data?.id?.toString() ?? null;

  // Solo nos interesan los pagos. merchant_order y otros topics → 200 e ignorar
  // (responder 200 evita reintentos innecesarios de MP).
  if (type !== "payment") {
    return NextResponse.json({ ignored: true }, { status: 200 });
  }
  if (!dataId) {
    return NextResponse.json({ error: "Falta data.id" }, { status: 400 });
  }

  // --- 1. Validar la firma x-signature ---
  if (!verifySignature(req, dataId, secret)) {
    console.warn("[mp-webhook] Firma inválida para data.id", dataId);
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  // --- 2. Re-consultar el pago real con el Access Token ---
  let payment;
  try {
    const client = getMercadoPagoClient();
    payment = await new Payment(client).get({ id: dataId });
  } catch (err) {
    console.error("[mp-webhook] Error consultando Payment.get:", err);
    // 500 → MP reintenta (puede ser un pago aún no propagado).
    return NextResponse.json({ error: "Error consultando pago" }, { status: 500 });
  }

  // Solo acreditamos pagos aprobados. Pending/rejected → 200 sin acreditar.
  if (payment.status !== "approved") {
    return NextResponse.json({ status: payment.status }, { status: 200 });
  }

  const clerkUserId = payment.external_reference;
  const packId = (payment.metadata?.pack_id ?? payment.metadata?.packId) as
    | string
    | undefined;
  if (!clerkUserId || !packId) {
    console.error(
      "[mp-webhook] Pago aprobado sin external_reference/pack_id",
      payment.id,
    );
    // 200: el evento es válido pero no podemos atribuirlo; reintentar no ayuda.
    return NextResponse.json({ error: "Pago sin atribución" }, { status: 200 });
  }

  // Créditos resueltos del catálogo server-side (NO de metadata.credits).
  const product = getProduct(packId);
  if (!product) {
    console.error("[mp-webhook] pack_id desconocido en pago aprobado:", packId);
    return NextResponse.json({ error: "Producto desconocido" }, { status: 200 });
  }

  // --- 3. Acreditar idempotente (registro + grant en una transacción) ---
  // Lifetime (Pase Fundador): la RPC además marca plan='founder' y acredita los
  // créditos de análisis. is_lifetime y analysis_credits salen del catálogo
  // server-side, NUNCA del evento.
  const admin = createAdminClient();
  const { data: result, error } = await admin.rpc("process_mp_payment", {
    p_mp_payment_id: String(payment.id),
    p_clerk_user_id: clerkUserId,
    p_credits: product.credits,
    p_is_lifetime: product.kind === "lifetime",
    p_analysis_credits: product.analysisCredits ?? 0,
    p_raw: payment as unknown as Record<string, unknown>,
  });
  if (error) {
    console.error("[mp-webhook] process_mp_payment falló:", error);
    // 500 → MP reintenta; la idempotencia evita doble acreditación.
    return NextResponse.json({ error: "Error acreditando" }, { status: 500 });
  }

  // result === 'duplicate' significa que ya se procesó antes (no se re-acreditó).
  return NextResponse.json({ result }, { status: 200 });
}

/**
 * Valida el header `x-signature` de Mercado Pago.
 *
 * Formato del header: `ts=<timestamp>,v1=<hmac_sha256_hex>`.
 * Manifest firmado: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 * (data.id en minúsculas si es alfanumérico, según la doc de MP).
 * HMAC-SHA256 con MP_WEBHOOK_SECRET; comparación en tiempo constante.
 */
function verifySignature(req: Request, dataId: string, secret: string): boolean {
  const xSignature = req.headers.get("x-signature");
  const xRequestId = req.headers.get("x-request-id");
  if (!xSignature || !xRequestId) return false;

  let ts: string | undefined;
  let v1: string | undefined;
  for (const part of xSignature.split(",")) {
    const [rawKey, rawValue] = part.split("=", 2);
    const key = rawKey?.trim();
    const value = rawValue?.trim();
    if (key === "ts") ts = value;
    else if (key === "v1") v1 = value;
  }
  if (!ts || !v1) return false;

  const manifest = `id:${dataId.toLowerCase()};request-id:${xRequestId};ts:${ts};`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(v1, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
