import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWhopWebhook } from "@/lib/whop/verify-webhook";
import {
  getProduct,
  getProductByWhopPlanId,
  type Product,
} from "@/lib/billing/catalog";

// crypto (HMAC) requiere runtime Node (no Edge).
// force-dynamic: el webhook corre en cada request, nunca se prerenderiza.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/whop — FUENTE DE VERDAD del cobro por Whop.
 *
 * Whop notifica acá cuando un pago queda cobrado (evento `payment.succeeded`).
 * El flujo espeja al webhook de Shopify, que ya está probado:
 *   1. Sin `WHOP_WEBHOOK_SECRET` -> 503 (no podemos verificar nada).
 *   2. `raw = await req.text()` ANTES de parsear: la firma se calcula sobre los
 *      bytes exactos; re-serializar el JSON la rompe.
 *   3. Verificar firma + anti-replay -> 401 si falla.
 *   4. Parsear -> si el JSON está roto, 200 (reintentar no ayuda).
 *   5. Solo `payment.succeeded` con `data.status === "paid"`; el resto, 200.
 *   6. Atribución desde `data.metadata` (clerk_user_id + pack_id). Sin
 *      atribución, el pago NO SE PIERDE: se estaciona en
 *      `whop_unmatched_payments` y se responde 200.
 *   7. Créditos SIEMPRE del catálogo server-side por id de producto, JAMÁS del
 *      payload ni del monto cobrado.
 *   8. Upsert de `profiles` a mano (grant_credits explota sin la fila).
 *      ⚠️ `ensureProfile()` NO sirve acá: usa `auth()` de Clerk y en un webhook
 *      no hay sesión.
 *   9. `process_whop_payment` acredita idempotente (registro + grant en UNA
 *      transacción). Error -> 500 para que Whop reintente; la idempotencia por
 *      `whop_payment_id` hace que el reintento sea seguro.
 *
 * ⏱️ HAY QUE RESPONDER EN MENOS DE 5 SEGUNDOS o Whop reintenta (12 veces, ~71
 * horas). Por eso no se hace ni una llamada de red extra: todo lo que necesitamos
 * (quién compró y qué compró) viaja en el propio evento.
 */

/** Subconjunto del payload de `payment.succeeded` que consumimos. */
type WhopPaymentEvent = {
  id?: string;
  type?: string;
  data?: {
    id?: string;
    status?: string;
    /** `plan_...` de Whop. Fallback de atribución del producto (ver getProductByWhopPlanId). */
    plan_id?: string | null;
    checkout_configuration_id?: string | null;
    member_id?: string | null;
    user?: { id?: string; name?: string | null; username?: string | null } | null;
    metadata?: Record<string, unknown> | null;
  } | null;
};

export async function POST(req: Request) {
  // --- 0. Config ---
  const secret = process.env.WHOP_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[whop-webhook] Falta WHOP_WEBHOOK_SECRET");
    return NextResponse.json({ error: "No configurado" }, { status: 503 });
  }

  // --- 1. Cuerpo CRUDO + verificación de firma ---
  // La firma se calcula sobre estos bytes exactos. Parsear y re-stringificar la
  // rompe, así que leemos texto y verificamos ANTES de JSON.parse.
  const raw = await req.text();
  const ok = verifyWhopWebhook(
    raw,
    {
      id: req.headers.get("webhook-id"),
      timestamp: req.headers.get("webhook-timestamp"),
      signature: req.headers.get("webhook-signature"),
    },
    secret,
  );
  if (!ok) {
    console.warn("[whop-webhook] Firma invalida o fuera de la ventana anti-replay");
    return NextResponse.json({ error: "Firma invalida" }, { status: 401 });
  }

  // --- 2. Parsear el evento (ya con firma validada) ---
  let event: WhopPaymentEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    console.error("[whop-webhook] Body no es JSON valido");
    // 200: con firma valida pero JSON roto, reintentar no ayuda.
    return NextResponse.json({ error: "Body invalido" }, { status: 200 });
  }

  // --- 3. Solo pagos cobrados ---
  if (event.type !== "payment.succeeded") {
    // Otros eventos (payment.failed, etc.): 200 e ignorar, para que Whop no
    // reintente algo que nunca vamos a procesar.
    return NextResponse.json({ ignored: true, type: event.type }, { status: 200 });
  }

  const data = event.data ?? {};

  // ⚠️ El enum de `data.status` es draft|open|authorized|PAID|pending|
  // uncollectible|unresolved|void. El estado "cobrado" es **paid**, NO
  // "succeeded" (eso es el nombre del EVENTO, no del status). Filtrar por
  // "succeeded" ignoraría TODOS los pagos y nadie recibiría créditos.
  if (typeof data.status === "string" && data.status !== "paid") {
    console.warn("[whop-webhook] payment.succeeded con status distinto de paid:", data.status);
    return NextResponse.json({ ignored: true, status: data.status }, { status: 200 });
  }

  const whopPaymentId = data.id ? String(data.id) : null;
  if (!whopPaymentId) {
    console.error("[whop-webhook] Evento sin data.id");
    return NextResponse.json({ error: "Pago sin id" }, { status: 200 });
  }

  // --- 4. Atribución: quién compró y qué compró ---
  const metadata = data.metadata ?? {};
  const clerkUserId = readMetaString(metadata, "clerk_user_id");
  // `pack_id` es el nombre canónico; `product_id` se acepta como sinónimo por si
  // el checkout se creó con la otra convención (los mandamos los dos).
  const packId =
    readMetaString(metadata, "pack_id") ?? readMetaString(metadata, "product_id");

  // Créditos SIEMPRE del catálogo server-side. Fallback de atribución del
  // PRODUCTO por `plan_id` de Whop: cubre compras hechas desde un checkout link
  // estático (sin nuestro metadata). El mapa plan_id -> producto se deriva del
  // mismo catálogo, así que no puede driftear.
  const product: Product | null =
    (packId ? getProduct(packId) : null) ??
    (data.plan_id ? getProductByWhopPlanId(String(data.plan_id)) : null);

  const admin = createAdminClient();

  // --- 5. Sin atribución completa: estacionar el pago y responder 200 ---
  // Falta el comprador (no hay clerk_user_id) o el producto no se pudo resolver.
  // En cualquiera de los dos casos NO se pierde la plata: queda registrada para
  // reconciliar a mano, y no reintentamos eternamente algo ya guardado.
  if (!clerkUserId || !product) {
    console.error(
      "[whop-webhook] Pago sin atribucion (estacionado):",
      whopPaymentId,
      { clerkUserId, packId, planId: data.plan_id },
    );
    const { error } = await admin.from("whop_unmatched_payments").upsert(
      {
        whop_payment_id: whopPaymentId,
        clerk_user_id: clerkUserId,
        pack_id: packId ?? product?.id ?? null,
        whop_plan_id: data.plan_id ?? null,
        credits: product?.credits ?? 0,
        analysis_credits: product?.analysisCredits ?? 0,
        is_lifetime: product?.kind === "lifetime",
        raw_event: event as unknown as Record<string, unknown>,
      },
      { onConflict: "whop_payment_id", ignoreDuplicates: true },
    );
    if (error) {
      console.error("[whop-webhook] No se pudo estacionar el pago:", error);
      // 500 -> Whop reintenta; el upsert con ignoreDuplicates lo hace seguro.
      return NextResponse.json({ error: "Error guardando" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, unmatched: true }, { status: 200 });
  }

  // --- 6. Asegurar la fila profiles (grant_credits falla sin ella) ---
  // ignoreDuplicates hace el upsert idempotente y a prueba de carreras.
  const displayName =
    data.user?.name?.trim() || data.user?.username?.trim() || null;
  const { error: profileError } = await admin.from("profiles").upsert(
    { id: clerkUserId, display_name: displayName },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (profileError) {
    console.error("[whop-webhook] No se pudo asegurar profile:", profileError);
    // 500 -> reintento seguro (la RPC es idempotente por whop_payment_id).
    return NextResponse.json({ error: "Error de perfil" }, { status: 500 });
  }

  // --- 7. Acreditar idempotente (registro + grant en una transaccion) ---
  // is_lifetime y analysis_credits salen del CATÁLOGO, nunca del evento. El Pase
  // Fundador acredita ademas 10 creditos de analisis y marca plan='founder'.
  const { data: result, error } = await admin.rpc("process_whop_payment", {
    p_whop_payment_id: whopPaymentId,
    p_clerk_user_id: clerkUserId,
    p_credits: product.credits,
    p_is_lifetime: product.kind === "lifetime",
    p_analysis_credits: product.analysisCredits ?? 0,
    p_raw: event as unknown as Record<string, unknown>,
  });
  if (error) {
    console.error("[whop-webhook] process_whop_payment fallo:", error);
    // 500 -> Whop reintenta; la idempotencia evita doble acreditacion.
    return NextResponse.json({ error: "Error acreditando" }, { status: 500 });
  }

  // result === 'duplicate' significa que ya se proceso antes (no se re-acredito).
  return NextResponse.json({ result }, { status: 200 });
}

/**
 * Lee una clave del metadata como string no vacío.
 * Whop solo admite valores string en metadata, pero validamos igual: el payload
 * es input externo y nunca se asume su forma.
 */
function readMetaString(
  metadata: Record<string, unknown>,
  key: string,
): string | null {
  const value = metadata[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
