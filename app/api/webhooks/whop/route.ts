import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWhopWebhook } from "@/lib/whop/verify-webhook";
import { inBackground } from "@/lib/whop/background";
import {
  isWhopTestPaymentId,
  paymentAmountUsd,
  paymentPlanId,
  readMetaString,
  type WhopPayment,
} from "@/lib/whop/payments";
import { resolveUnmatchedBuyer } from "@/lib/whop/resolve-buyer";
import { unreconciledAlertKey } from "@/lib/whop/reconcile";
import { sendCreditsGrantedEmail } from "@/lib/email/credits-granted";
import { alertAdmin, resolveAlert } from "@/lib/avisos/alert";
import { notifyUser } from "@/lib/avisos/notify";
import { NOTICE_KEYS } from "@/lib/avisos/types";
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
 *   1. Sin `WHOP_WEBHOOK_SECRET` -> 503 + alerta U (sin secret no se acredita
 *      NADA: cada venta queda cobrada y sin créditos).
 *   2. `raw = await req.text()` ANTES de parsear: la firma se calcula sobre los
 *      bytes exactos.
 *   3. Firma inválida o fuera de la ventana anti-replay -> 401 + alerta B (el
 *      endpoint es público: cualquiera le manda basura; si el secret quedó mal
 *      cargado, lo detecta el cruce con Whop, que sí es U).
 *   4. JSON roto -> 200 + alerta M con un extracto (reintentar no lo arregla).
 *   5. `payment.succeeded`:
 *      - `data.status` tiene que ser "paid" (NO "succeeded": ese es el nombre
 *        del evento). Otro status -> alerta M.
 *      - Sin `data.id` -> alerta U: es un cobro que no podemos acreditar.
 *      - Pago de prueba del dashboard (`pay_xxxx…`) -> se ignora.
 *      - Sin atribución completa -> se ESTACIONA en `whop_unmatched_payments`
 *        (no se pierde) y, después de responder, alerta U a Paolo con monto,
 *        plan y email + aviso al cliente si sabemos quién es.
 *      - Con atribución -> `process_whop_payment` (idempotente). Si falla:
 *        500 (Whop reintenta) + alerta U con llave por pago (cada reintento
 *        sube el contador). Si sale: aviso «Entraron tus {n} créditos del
 *        {pack}.», se cierran las alertas de ese pago y sale el mail.
 *   6. `dispute.*` / `refund.*` / `dispute_alert.*` -> alerta U (cada
 *      contracargo cuesta US$15). `payment.failed` -> alerta B.
 *
 * ⏱️ HAY QUE RESPONDER EN MENOS DE 5 SEGUNDOS o Whop reintenta (12 veces, ~71
 * h). En el camino síncrono solo queda lo que no se puede perder (estacionar o
 * acreditar). Alertas, avisos, Clerk, la API de Whop y el mail van en `after()`
 * (`inBackground`).
 */

/** Subconjunto del evento que consumimos. Todo opcional: es input externo. */
type WhopEvent = {
  id?: string;
  type?: string;
  data?: (WhopPayment & {
    member_id?: string | null;
    // dispute.* / refund.*
    amount?: number | null;
    reason?: string | null;
    payment_id?: string | null;
    payment?: WhopPayment | null;
  }) | null;
};

const KEYS = {
  secretMissing: "whop:webhook_secret_missing",
  badSignature: "whop:webhook_bad_signature",
  badPayload: (ref: string) => `whop:webhook_bad_payload:${ref}`,
  creditFailed: (payId: string) => `whop:payment_credit_failed:${payId}`,
  unmatched: (payId: string) => `whop:payment_unmatched:${payId}`,
  disputed: (kind: string, id: string) => `whop:${kind}:${id}`,
  paymentFailed: (payId: string) => `whop:payment_failed:${payId}`,
  emailFailed: (payId: string) => `whop:purchase_email_failed:${payId}`,
  passTwice: (payId: string) => `whop:pass_paid_twice:${payId}`,
};

export async function POST(req: Request) {
  const webhookId = (req.headers.get("webhook-id") ?? "").slice(0, 120) || null;

  // --- 0. Config ---
  const secret = process.env.WHOP_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[whop-webhook] Falta WHOP_WEBHOOK_SECRET");
    inBackground("secret_missing", () =>
      alertAdmin({
        kind: "webhook_secret_missing",
        severity: "U",
        dedupeKey: KEYS.secretMissing,
        details: {
          webhook_id: webhookId,
          cause: "Falta WHOP_WEBHOOK_SECRET en Vercel: ningún pago se puede acreditar",
        },
      }),
    );
    // 503 -> Whop reintenta (hasta ~71 h): si se carga el secret a tiempo, los
    // pagos entran solos con el reintento.
    return NextResponse.json({ error: "No configurado" }, { status: 503 });
  }

  // --- 1. Cuerpo CRUDO + verificación de firma ---
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
    inBackground("bad_signature", () =>
      alertAdmin({
        kind: "webhook_bad_signature",
        severity: "B",
        dedupeKey: KEYS.badSignature,
        details: {
          webhook_id: webhookId,
          reason: req.headers.get("webhook-signature")
            ? "firma que no coincide o timestamp fuera de los 5 min"
            : "sin headers de firma",
        },
      }),
    );
    return NextResponse.json({ error: "Firma invalida" }, { status: 401 });
  }

  // Llegó un webhook firmado: el secret está bien cargado.
  inBackground("secret_ok", () =>
    resolveAlert(KEYS.secretMissing, { resolution: { by: "webhook firmado" } }),
  );

  // --- 2. Parsear el evento (ya con firma validada) ---
  let event: WhopEvent;
  try {
    event = JSON.parse(raw) as WhopEvent;
    if (!event || typeof event !== "object") throw new Error("no es un objeto");
  } catch {
    console.error("[whop-webhook] Body no es JSON valido");
    inBackground("bad_json", () =>
      alertAdmin({
        kind: "webhook_bad_payload",
        severity: "M",
        dedupeKey: KEYS.badPayload(webhookId ?? "sin-id"),
        details: {
          cause: "JSON roto con firma válida",
          webhook_id: webhookId,
          raw: raw.slice(0, 800),
        },
      }),
    );
    // 200: reintentar no lo arregla. Si era un pago, el cruce con Whop lo ve.
    return NextResponse.json({ error: "Body invalido" }, { status: 200 });
  }

  const type = typeof event.type === "string" ? event.type : "";

  if (type === "payment.succeeded") {
    return handlePaymentSucceeded(event, webhookId);
  }
  if (/^(dispute|refund|dispute_alert)\./.test(type)) {
    handleDisputeOrRefund(event, type, webhookId);
    return NextResponse.json({ ok: true, alerted: type }, { status: 200 });
  }
  if (type === "payment.failed") {
    const payId = event.data?.id ? String(event.data.id) : null;
    if (payId && !isWhopTestPaymentId(payId)) {
      const data = event.data ?? {};
      inBackground("payment_failed", () =>
        alertAdmin({
          kind: "payment_failed",
          severity: "B",
          dedupeKey: KEYS.paymentFailed(payId),
          userId: readMetaString(data.metadata, "clerk_user_id"),
          details: {
            whop_payment_id: payId,
            amount_usd: paymentAmountUsd(data),
            plan_id: paymentPlanId(data),
            pack: readMetaString(data.metadata, "pack_id"),
            customer_email: data.user?.email ?? null,
          },
        }),
      );
    }
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // Otros eventos: 200 e ignorar, para que Whop no reintente.
  return NextResponse.json({ ignored: true, type }, { status: 200 });
}

/* -------------------------------------------------------------------------- */
/*  payment.succeeded                                                          */
/* -------------------------------------------------------------------------- */

async function handlePaymentSucceeded(
  event: WhopEvent,
  webhookId: string | null,
): Promise<Response> {
  const data = event.data ?? {};

  // ⚠️ El estado "cobrado" es **paid**, NO "succeeded".
  if (typeof data.status === "string" && data.status !== "paid") {
    console.warn("[whop-webhook] payment.succeeded con status distinto de paid:", data.status);
    inBackground("bad_status", () =>
      alertAdmin({
        kind: "webhook_bad_payload",
        severity: "M",
        dedupeKey: KEYS.badPayload(data.id ? String(data.id) : webhookId ?? "sin-id"),
        details: {
          cause: `payment.succeeded con status "${data.status}"`,
          whop_payment_id: data.id ? String(data.id) : null,
          webhook_id: webhookId,
        },
      }),
    );
    return NextResponse.json({ ignored: true, status: data.status }, { status: 200 });
  }

  const whopPaymentId = data.id ? String(data.id) : null;
  if (!whopPaymentId) {
    console.error("[whop-webhook] payment.succeeded sin data.id");
    // Un cobro que no podemos acreditar: U (es "acreditación fallida").
    inBackground("no_id", () =>
      alertAdmin({
        kind: "webhook_bad_payload",
        severity: "U",
        dedupeKey: KEYS.badPayload(webhookId ?? "sin-id"),
        userId: readMetaString(data.metadata, "clerk_user_id"),
        details: {
          cause: "payment.succeeded sin data.id: cobrado y sin acreditar",
          webhook_id: webhookId,
          amount_usd: paymentAmountUsd(data),
          plan_id: paymentPlanId(data),
          customer_email: data.user?.email ?? null,
          raw: JSON.stringify(data).slice(0, 800),
        },
      }),
    );
    return NextResponse.json({ error: "Pago sin id" }, { status: 200 });
  }

  // Pago de prueba del botón "send test event" de Whop: nunca acredita.
  if (isWhopTestPaymentId(whopPaymentId)) {
    console.log("[whop-webhook] Pago de prueba ignorado:", whopPaymentId);
    return NextResponse.json({ ignored: true, test: true }, { status: 200 });
  }

  // --- Atribución: quién compró y qué compró ---
  const metadata = data.metadata ?? {};
  const clerkUserId = readMetaString(metadata, "clerk_user_id");
  const packId =
    readMetaString(metadata, "pack_id") ?? readMetaString(metadata, "product_id");
  const planId = paymentPlanId(data);

  // Créditos SIEMPRE del catálogo server-side (jamás del payload ni del monto).
  const product: Product | null =
    (packId ? getProduct(packId) : null) ??
    (planId ? getProductByWhopPlanId(planId) : null);

  const admin = createAdminClient();
  const amountUsd = paymentAmountUsd(data);
  const customerEmail = data.user?.email ?? null;

  // --- Sin atribución completa: estacionar (síncrono) y alertar (después) ---
  if (!clerkUserId || !product) {
    console.error("[whop-webhook] Pago sin atribucion (estacionado):", whopPaymentId, {
      clerkUserId,
      packId,
      planId,
    });
    const { error } = await admin.from("whop_unmatched_payments").upsert(
      {
        whop_payment_id: whopPaymentId,
        clerk_user_id: clerkUserId,
        pack_id: packId ?? product?.id ?? null,
        whop_plan_id: planId,
        credits: product?.credits ?? 0,
        analysis_credits: product?.analysisCredits ?? 0,
        is_lifetime: product?.kind === "lifetime",
        raw_event: event as unknown as Record<string, unknown>,
      },
      { onConflict: "whop_payment_id", ignoreDuplicates: true },
    );
    if (error) {
      console.error("[whop-webhook] No se pudo estacionar el pago:", error);
      inBackground("park_failed", () =>
        alertAdmin({
          kind: "payment_credit_failed",
          severity: "U",
          dedupeKey: KEYS.creditFailed(whopPaymentId),
          userId: clerkUserId,
          details: {
            whop_payment_id: whopPaymentId,
            amount_usd: amountUsd,
            plan_id: planId,
            pack: packId ?? product?.id ?? null,
            customer_email: customerEmail,
            cause: "Pago sin atribución que NO se pudo estacionar (Whop reintenta)",
            raw: error.message,
          },
        }),
      );
      // 500 -> Whop reintenta; el upsert con ignoreDuplicates lo hace seguro.
      return NextResponse.json({ error: "Error guardando" }, { status: 500 });
    }

    inBackground("unmatched", () =>
      handleUnmatched({
        whopPaymentId,
        clerkUserId,
        packId,
        planId,
        product,
        amountUsd,
        customerEmail,
        checkoutConfigurationId: data.checkout_configuration_id ?? null,
      }),
    );
    return NextResponse.json({ ok: true, unmatched: true }, { status: 200 });
  }

  // --- Asegurar la fila profiles (grant_credits falla sin ella) ---
  const creditFailed = (cause: string, raw: string) =>
    inBackground("credit_failed", () =>
      alertAdmin({
        kind: "payment_credit_failed",
        severity: "U",
        // Una llave por pago: los reintentos de Whop suben el contador.
        dedupeKey: KEYS.creditFailed(whopPaymentId),
        userId: clerkUserId,
        details: {
          whop_payment_id: whopPaymentId,
          amount_usd: amountUsd,
          plan_id: planId,
          pack: product.id,
          customer_email: customerEmail,
          cause,
          raw,
        },
      }),
    );

  const displayName = data.user?.name?.trim() || data.user?.username?.trim() || null;
  const { error: profileError } = await admin.from("profiles").upsert(
    { id: clerkUserId, display_name: displayName },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (profileError) {
    console.error("[whop-webhook] No se pudo asegurar profile:", profileError);
    creditFailed("No se pudo asegurar la fila profiles (Whop reintenta)", profileError.message);
    return NextResponse.json({ error: "Error de perfil" }, { status: 500 });
  }

  // --- Acreditar idempotente (registro + grant en una transacción) ---
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
    creditFailed("process_whop_payment falló (Whop reintenta)", error.message);
    // 500 -> Whop reintenta; la idempotencia evita doble acreditación.
    return NextResponse.json({ error: "Error acreditando" }, { status: 500 });
  }

  // 'granted' = primera vez; 'duplicate' = ya estaba (reintento). En los dos
  // casos la plata está puesta: se avisa (idempotente por llave), se cierran
  // las alertas de ese pago y, SOLO con 'granted', sale el mail (uno por compra).
  inBackground("credited", () =>
    afterCredited({
      whopPaymentId,
      clerkUserId,
      product,
      granted: result === "granted",
    }),
  );

  return NextResponse.json({ result }, { status: 200 });
}

/** Todo lo que pasa después de acreditar. Corre en after(). */
async function afterCredited(input: {
  whopPaymentId: string;
  clerkUserId: string;
  product: Product;
  granted: boolean;
}): Promise<void> {
  const { whopPaymentId, clerkUserId, product } = input;

  await Promise.all([
    // «Entraron tus {n} créditos del {pack}.» — uno por pago (llave).
    notifyUser(
      clerkUserId,
      "purchase_credited",
      { n: product.credits, pack: product.name, analysis: product.analysisCredits ?? 0 },
      NOTICE_KEYS.purchase(whopPaymentId),
    ),
    resolveAlert(KEYS.creditFailed(whopPaymentId), {
      resolution: { by: "webhook", note: "el reintento acreditó" },
    }),
    resolveAlert(unreconciledAlertKey(whopPaymentId), {
      resolution: { by: "webhook", note: "el webhook llegó y acreditó" },
    }),
  ]);

  if (!input.granted) return;

  await Promise.all([
    notifyCreditsGranted(whopPaymentId, clerkUserId, product),
    product.kind === "lifetime" ? checkPassPaidTwice(whopPaymentId, clerkUserId) : null,
  ]);
}

/**
 * Pago sin atribución completa (ya estacionado). Corre en after(): busca quién
 * pagó, alerta U a Paolo y, si lo sabemos, le avisa al cliente.
 */
async function handleUnmatched(input: {
  whopPaymentId: string;
  clerkUserId: string | null;
  packId: string | null;
  planId: string | null;
  product: Product | null;
  amountUsd: number | null;
  customerEmail: string | null;
  checkoutConfigurationId: string | null;
}): Promise<void> {
  const match = await resolveUnmatchedBuyer({
    metadataUserId: input.clerkUserId,
    checkoutConfigurationId: input.checkoutConfigurationId,
    email: input.customerEmail,
  });
  const product =
    input.product ?? (match?.packId ? getProduct(match.packId) : null);

  // Anotar a quién corresponde (si no venía) para que /api/pago/estado le
  // muestre el aviso correcto. NO acredita: eso lo hace Paolo con el pay_.
  if (match && !input.clerkUserId) {
    try {
      const { error } = await createAdminClient()
        .from("whop_unmatched_payments")
        .update({ clerk_user_id: match.userId })
        .eq("whop_payment_id", input.whopPaymentId)
        .is("clerk_user_id", null);
      if (error) console.error("[whop-webhook] No se pudo anotar al comprador:", error.message);
    } catch (err) {
      console.error("[whop-webhook] No se pudo anotar al comprador:", err);
    }
  }

  await alertAdmin({
    kind: "payment_unmatched",
    severity: "U",
    dedupeKey: KEYS.unmatched(input.whopPaymentId),
    userId: match?.userId ?? null,
    details: {
      whop_payment_id: input.whopPaymentId,
      amount_usd: input.amountUsd,
      plan_id: input.planId,
      pack: product?.id ?? input.packId,
      customer_email: input.customerEmail,
      cause: !input.clerkUserId
        ? "Llegó sin clerk_user_id en el metadata"
        : "No se pudo resolver el producto (ni pack_id ni plan_id)",
      matched_via: match?.via ?? "nadie",
    },
  });

  if (match) {
    await notifyUser(
      match.userId,
      "payment_unmatched",
      { pack: product?.name ?? null },
      NOTICE_KEYS.paymentUnmatched(input.whopPaymentId),
    );
  }
}

/* -------------------------------------------------------------------------- */
/*  Contracargos y reembolsos                                                  */
/* -------------------------------------------------------------------------- */

function handleDisputeOrRefund(
  event: WhopEvent,
  type: string,
  webhookId: string | null,
): void {
  const data = event.data ?? {};
  const payment = data.payment ?? null;
  const paymentId = payment?.id ?? data.payment_id ?? null;
  const kind = type.split(".")[0];
  const ref = data.id ? String(data.id) : paymentId ?? webhookId ?? "sin-id";
  if (isWhopTestPaymentId(paymentId)) return;

  const metadata = payment?.metadata ?? null;
  inBackground("disputed", () =>
    alertAdmin({
      kind: "payment_disputed",
      severity: "U",
      // Una llave por disputa/reembolso: los updates suben el contador.
      dedupeKey: KEYS.disputed(kind, ref),
      userId: readMetaString(metadata, "clerk_user_id"),
      details: {
        event: type,
        whop_payment_id: paymentId,
        amount: typeof data.amount === "number" ? data.amount : null,
        currency: typeof data.currency === "string" ? data.currency : null,
        amount_usd: payment ? paymentAmountUsd(payment) : null,
        status: typeof data.status === "string" ? data.status : null,
        reason: typeof data.reason === "string" ? data.reason : null,
        pack: readMetaString(metadata, "pack_id"),
        customer_email: payment?.user?.email ?? null,
        cause:
          kind === "refund"
            ? "Reembolso en Whop: los créditos NO se descuentan solos"
            : "Contracargo en Whop (cuesta US$15): responder en el dashboard",
      },
    }),
  );
}

/* -------------------------------------------------------------------------- */
/*  Mail de compra y Pase pagado dos veces                                     */
/* -------------------------------------------------------------------------- */

/**
 * Manda el mail de "tus créditos ya entraron". NUNCA tira. Si no sale, alerta
 * M a Paolo (spec #18). El destinatario sale de CLERK, no del evento.
 */
async function notifyCreditsGranted(
  whopPaymentId: string,
  clerkUserId: string,
  product: Product,
): Promise<void> {
  let outcome: string;
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(clerkUserId);
    const to = user.primaryEmailAddress?.emailAddress?.trim();
    if (!to) {
      outcome = "sin_email";
    } else {
      outcome = await sendCreditsGrantedEmail({
        to,
        productName: product.name,
        credits: product.credits,
        priceUsd: product.priceUsd,
        analysisCredits: product.analysisCredits ?? 0,
        isLifetime: product.kind === "lifetime",
      });
    }
  } catch (err) {
    console.error("[whop-webhook] No se pudo avisar por mail la acreditación:", err);
    outcome = "error";
  }
  console.log(`[whop-webhook] Mail de créditos (${product.id}) -> ${outcome}`);
  if (outcome === "sent") return;

  await alertAdmin({
    kind: "purchase_email_failed",
    severity: "M",
    dedupeKey: KEYS.emailFailed(whopPaymentId),
    userId: clerkUserId,
    details: { whop_payment_id: whopPaymentId, pack: product.id, result: outcome },
  });
}

/** El Pase Fundador se compra una vez: si ya había otro, alerta M a Paolo. */
async function checkPassPaidTwice(whopPaymentId: string, clerkUserId: string): Promise<void> {
  try {
    const { data, error } = await createAdminClient()
      .from("whop_processed_payments")
      .select("whop_payment_id")
      .eq("clerk_user_id", clerkUserId)
      .eq("is_lifetime", true)
      .limit(5);
    if (error || !Array.isArray(data) || data.length < 2) return;
    await alertAdmin({
      kind: "pass_paid_twice",
      severity: "M",
      dedupeKey: KEYS.passTwice(whopPaymentId),
      userId: clerkUserId,
      details: {
        whop_payment_id: whopPaymentId,
        pack: "lifetime-pass",
        cause: `Tiene ${data.length} pagos del Pase: ${data.map((r) => r.whop_payment_id).join(", ")}`,
      },
    });
  } catch (err) {
    console.error("[whop-webhook] No se pudo revisar el Pase repetido:", err);
  }
}
