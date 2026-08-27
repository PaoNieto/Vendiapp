import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyShopifyHmac } from "@/lib/shopify/verify-webhook";
import { orderToCredits, type ShopifyOrder } from "@/lib/shopify/order-to-credits";

// crypto (HMAC) + el SDK de Clerk requieren runtime Node (no Edge).
// force-dynamic: el webhook corre en cada request, nunca se prerenderiza.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/shopify -- FUENTE DE VERDAD del cobro por Shopify.
 *
 * Shopify notifica aca cuando un pedido queda pago (topic orders/paid). El flujo
 * seguro espeja al webhook de Mercado Pago:
 *   1. Validar el HMAC (header X-Shopify-Hmac-Sha256) sobre el CUERPO CRUDO. El
 *      SDK no lo valida -> va a mano. raw = await req.text() ANTES de parsear.
 *   2. Confirmar topic 'orders/paid' (y opcionalmente el shop domain).
 *   3. Resolver creditos del CATALOGO server-side (orderToCredits), nunca del
 *      monto del pedido.
 *   4. Resolver el comprador -> id de Clerk (note_attributes preferido, si no por
 *      email via Clerk Backend SDK).
 *   5. Acreditar IDEMPOTENTE via la RPC process_shopify_order (registra el pedido
 *      y llama grant_credits en una sola transaccion atomica). Lifetime -> la RPC
 *      ya marca plan='founder'; aca NO tocamos el plan.
 *   6. Responder 200 rapido. Errores transitorios (DB caida) -> 500 para que
 *      Shopify reintente; la idempotencia evita doble acreditacion.
 *
 * Si el comprador no tiene cuenta Clerk todavia, el pedido NO se pierde: se
 * estaciona en shopify_unmatched_orders para reconciliar cuando se registre, y
 * se responde 200 (no queremos reintentos eternos de un pedido ya guardado).
 */
export async function POST(req: Request) {
  // --- 0. Config ---
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[shopify-webhook] Falta SHOPIFY_WEBHOOK_SECRET");
    return NextResponse.json({ error: "No configurado" }, { status: 503 });
  }

  // --- 1. Cuerpo CRUDO + validacion HMAC ---
  // El HMAC se calcula sobre estos bytes exactos. Parsear y re-stringificar
  // rompe la firma, asi que leemos texto y validamos ANTES de JSON.parse.
  const raw = await req.text();
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256");
  if (!verifyShopifyHmac(raw, hmacHeader, secret)) {
    console.warn("[shopify-webhook] Firma HMAC invalida");
    return NextResponse.json({ error: "Firma invalida" }, { status: 401 });
  }

  // --- 2. Defensa extra: solo el topic. NO validamos el shop-domain: Shopify
  // estampa el myshopifyDomain interno (mm1qu0-y3...), no el dominio principal
  // (vendilatam.com / vendi-9497), y ese nombre no se puede elegir. Ademas la
  // firma HMAC ya garantiza autenticidad (solo la tienda con el secret puede
  // firmar), asi que chequear el dominio no agrega seguridad real.
  const topic = req.headers.get("x-shopify-topic");
  if (topic !== "orders/paid") {
    // Otros topics: 200 e ignorar (responder 200 evita reintentos inutiles).
    return NextResponse.json({ ignored: true, topic }, { status: 200 });
  }

  // --- 3. Parsear el Order (ya con firma validada) ---
  let order: ShopifyOrder & {
    id?: number | string;
    email?: string | null;
    customer?: { email?: string | null; first_name?: string | null; last_name?: string | null } | null;
    note_attributes?: Array<{ name?: string; value?: string }> | null;
  };
  try {
    order = JSON.parse(raw);
  } catch {
    console.error("[shopify-webhook] Body no es JSON valido");
    // 200: con firma valida pero JSON roto, reintentar no ayuda.
    return NextResponse.json({ error: "Body invalido" }, { status: 200 });
  }

  const shopifyOrderId = order.id != null ? String(order.id) : null;
  if (!shopifyOrderId) {
    console.error("[shopify-webhook] Order sin id");
    return NextResponse.json({ error: "Order sin id" }, { status: 200 });
  }

  // --- 4. Resolver creditos del catalogo server-side ---
  const { credits, isLifetime } = orderToCredits(order);
  if (credits <= 0) {
    // Ningun line_item mapea a un producto de creditos (ej. el pedido era de
    // otra cosa). Nada que acreditar -> 200.
    console.warn(
      "[shopify-webhook] Pedido sin creditos a acreditar:",
      shopifyOrderId,
    );
    return NextResponse.json({ ok: true, credits: 0 }, { status: 200 });
  }

  // --- 5. Resolver el comprador -> id de Clerk ---
  const email =
    order.email?.trim() || order.customer?.email?.trim() || null;

  let clerkUserId = resolveClerkIdFromNote(order.note_attributes);
  if (!clerkUserId && email) {
    clerkUserId = await resolveClerkIdFromEmail(email);
  }

  const admin = createAdminClient();

  // --- 6a. Sin match: estacionar el pedido y responder 200 ---
  if (!clerkUserId) {
    console.warn(
      "[shopify-webhook] Sin usuario Clerk para el pedido (estacionado):",
      shopifyOrderId,
      email,
    );
    const { error } = await admin
      .from("shopify_unmatched_orders")
      .upsert(
        {
          shopify_order_id: shopifyOrderId,
          email,
          credits,
          is_lifetime: isLifetime,
          raw_event: order as unknown as Record<string, unknown>,
        },
        { onConflict: "shopify_order_id", ignoreDuplicates: true },
      );
    if (error) {
      console.error(
        "[shopify-webhook] No se pudo estacionar el pedido:",
        error,
      );
      // 500 -> Shopify reintenta; el upsert ignoreDuplicates lo hace seguro.
      return NextResponse.json({ error: "Error guardando" }, { status: 500 });
    }
    // 200: el pedido quedo guardado para reconciliar; no reintentar.
    return NextResponse.json({ ok: true, unmatched: true }, { status: 200 });
  }

  // --- 6b. Hay usuario: asegurar profile (grant_credits falla sin el) ---
  // El nombre del comprador (o el email) enriquece el display_name. ignoreDuplicates
  // hace el upsert idempotente y a prueba de carreras.
  const displayName = buildDisplayName(order, email);
  const { error: profileError } = await admin.from("profiles").upsert(
    { id: clerkUserId, display_name: displayName },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (profileError) {
    console.error("[shopify-webhook] No se pudo asegurar profile:", profileError);
    // 500 -> reintento seguro (la RPC es idempotente por shopify_order_id).
    return NextResponse.json({ error: "Error de perfil" }, { status: 500 });
  }

  // --- 7. Acreditar idempotente (registro + grant en una transaccion) ---
  const { data: result, error } = await admin.rpc("process_shopify_order", {
    p_shopify_order_id: shopifyOrderId,
    p_clerk_user_id: clerkUserId,
    p_credits: credits,
    p_is_lifetime: isLifetime,
    p_raw: order as unknown as Record<string, unknown>,
  });
  if (error) {
    console.error("[shopify-webhook] process_shopify_order fallo:", error);
    // 500 -> Shopify reintenta; la idempotencia evita doble acreditacion.
    return NextResponse.json({ error: "Error acreditando" }, { status: 500 });
  }

  // result === 'duplicate' significa que ya se proceso antes (no se re-acredito).
  return NextResponse.json({ result }, { status: 200 });
}

/**
 * Busca el id de Clerk en note_attributes (array {name,value}). Esto soporta que
 * la app, a futuro, mande al comprador a Shopify con su id pegado ('clerk_user_id'),
 * igual que external_reference en Mercado Pago. Match exacto, directo.
 */
function resolveClerkIdFromNote(
  noteAttributes: Array<{ name?: string; value?: string }> | null | undefined,
): string | null {
  if (!Array.isArray(noteAttributes)) return null;
  for (const attr of noteAttributes) {
    if (attr?.name === "clerk_user_id" && attr.value?.trim()) {
      return attr.value.trim();
    }
  }
  return null;
}

/**
 * Resuelve un id de Clerk por email via el Backend SDK. Solo aceptamos un match
 * INEQUIVOCO: si la busqueda devuelve exactamente 1 usuario, usamos su id. Si hay
 * 0 o mas de 1, devolvemos null (el pedido se estaciona para reconciliar a mano).
 */
async function resolveClerkIdFromEmail(email: string): Promise<string | null> {
  try {
    const client = await clerkClient();
    const res = await client.users.getUserList({ emailAddress: [email] });
    // En @clerk/backend v1+/v7, getUserList devuelve un objeto paginado
    // { data: User[], totalCount }. Soportamos ambas formas por las dudas.
    const users = Array.isArray(res)
      ? res
      : (res?.data ?? []);
    if (users.length === 1) {
      return users[0].id;
    }
    if (users.length > 1) {
      console.warn(
        "[shopify-webhook] Email con multiples usuarios Clerk, no se atribuye:",
        email,
      );
    }
    return null;
  } catch (err) {
    console.error("[shopify-webhook] Error consultando Clerk por email:", err);
    return null;
  }
}

/** Arma un display_name a partir del comprador del pedido o, en su defecto, el email. */
function buildDisplayName(
  order: {
    customer?: { first_name?: string | null; last_name?: string | null } | null;
  },
  email: string | null,
): string | null {
  const first = order.customer?.first_name?.trim() ?? "";
  const last = order.customer?.last_name?.trim() ?? "";
  const full = `${first} ${last}`.trim();
  return full || email || null;
}
