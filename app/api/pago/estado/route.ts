import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProduct } from "@/lib/billing/catalog";
import { messageText, noticeText } from "@/lib/avisos/textos";
import { NOTICE_KEYS } from "@/lib/avisos/types";
import { inBackground } from "@/lib/whop/background";
import {
  isPaid,
  isWhopTestPaymentId,
  listWhopPaymentsSince,
  readMetaString,
} from "@/lib/whop/payments";
import { reconcileWhopPayments } from "@/lib/whop/reconcile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ¿En qué está la compra que el usuario acaba de hacer?
 *
 * Lo consulta `/pago/resultado` mientras espera el webhook de Whop. Solo lee
 * (la acreditación la hace el webhook) y responde:
 *
 *  - `acreditado`    → ya entraron los créditos («Entraron tus {n} créditos del {pack}.»).
 *  - `sin_acreditar` → el pago quedó estacionado a nombre de este usuario
 *                      («Recibimos tu pago y estamos terminando de acreditarlo…»).
 *  - `cobrado`       → (solo con `?tarde=1`) Whop ya lo cobró y todavía no se
 *                      acreditó («Ya recibimos tu pago y tus créditos vienen en camino…»).
 *  - `confirmando`   → (solo con `?tarde=1`) Whop todavía no lo dio por cobrado.
 *  - `esperando`     → todavía nada (los primeros 90 s).
 *
 * 🔒 SIN IDOR (JonSnow #5): la ruta NO acepta ningún id de pago ni de checkout.
 * Todo se busca por el usuario de la SESIÓN: sus filas en las tablas de pagos,
 * y en Whop solo los pagos cuyo metadata dice `clerk_user_id` = él. Presentar un
 * `pay_` ajeno no sirve para nada, y esta ruta nunca atribuye ni acredita.
 *
 * `?desde=<ISO>` = la compra tiene que ser posterior (la página lo fija al
 * cargar, con margen hacia atrás porque el webhook puede ganarle al regreso).
 */

type Estado = "acreditado" | "sin_acreditar" | "cobrado" | "confirmando" | "esperando";

/** Cuánto vale la consulta a Whop por usuario (por instancia). */
const WHOP_CHECK_TTL_MS = 30_000;
const whopCheckCache = new Map<string, { at: number; paid: boolean }>();

/** `desde` no puede ir más atrás que esto (acota las búsquedas). */
const MAX_LOOKBACK_MS = 3 * 24 * 3_600_000;

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const desdeRaw = params.get("desde");
  const parsed = desdeRaw ? new Date(desdeRaw) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return NextResponse.json({ error: "Falta ?desde" }, { status: 400 });
  }
  const desde = new Date(Math.max(parsed.getTime(), Date.now() - MAX_LOOKBACK_MS));
  const tarde = params.get("tarde") === "1";

  const admin = createAdminClient();
  const [processed, ledger, parked] = await Promise.all([
    admin
      .from("whop_processed_payments")
      .select("whop_payment_id, credits_granted, pack_id:raw_event->data->metadata->>pack_id")
      .eq("clerk_user_id", userId)
      .gte("processed_at", desde.toISOString())
      .order("processed_at", { ascending: false })
      .limit(1),
    // Respaldo: cualquier compra acreditada (otro riel, o acreditación a mano).
    admin
      .from("credit_ledger")
      .select("id, delta")
      .eq("user_id", userId)
      .eq("reason", "purchase")
      .gte("created_at", desde.toISOString())
      .order("created_at", { ascending: false })
      .limit(1),
    admin
      .from("whop_unmatched_payments")
      .select("whop_payment_id")
      .eq("clerk_user_id", userId)
      .eq("reconciled", false)
      .gte("created_at", desde.toISOString())
      .limit(1),
  ]);

  if (processed.error || ledger.error) {
    console.error(
      "[pago-estado] No se pudo leer el estado del pago:",
      processed.error?.message ?? ledger.error?.message,
    );
    return NextResponse.json({ error: "No se pudo consultar" }, { status: 502 });
  }

  const pay = processed.data?.[0] as
    | { whop_payment_id: string; credits_granted: number; pack_id: string | null }
    | undefined;
  if (pay) {
    const product = pay.pack_id ? getProduct(pay.pack_id) : null;
    // La pantalla le muestra el aviso: queda leído y no se repite en la campanita.
    inBackground("mark_read", async () => {
      await admin
        .from("user_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("dedupe_key", NOTICE_KEYS.purchase(pay.whop_payment_id))
        .is("read_at", null);
    });
    return respond("acreditado", {
      message: noticeText("purchase_credited", {
        n: pay.credits_granted,
        pack: product?.name ?? null,
      }),
    });
  }

  const purchase = ledger.data?.[0] as { id: string; delta: number } | undefined;
  if (purchase) {
    return respond("acreditado", {
      message: noticeText("purchase_credited", { n: purchase.delta, pack: null }),
    });
  }

  if (!parked.error && (parked.data?.length ?? 0) > 0) {
    return respond("sin_acreditar", { message: messageText("payment_unmatched", {}) });
  }
  if (parked.error) {
    console.error("[pago-estado] No se pudo leer whop_unmatched_payments:", parked.error.message);
  }

  if (!tarde) return respond("esperando");

  // Más de 90 s esperando: ¿Whop ya lo cobró? Solo pagos de ESTE usuario.
  const paid = await whopPaidForUser(userId, desde);
  if (paid) {
    // Cobrado y sin acreditar: que el cruce lo mire (candado global de 10 min,
    // así el polling de un cliente nunca lo dispara de más). Si sigue sin
    // procesar pasada la gracia, abre la alerta U a Paolo.
    inBackground("reconcile", () => reconcileWhopPayments());
    return respond("cobrado", { message: messageText("payment_delayed_paid", {}) });
  }
  return respond("confirmando", { message: messageText("payment_delayed_unconfirmed", {}) });
}

function respond(estado: Estado, extra: { message?: string } = {}) {
  return NextResponse.json(
    { estado, acreditado: estado === "acreditado", ...extra },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * ¿Hay en Whop un pago COBRADO de este usuario desde `desde`? Cacheado 30 s por
 * usuario para no martillar la API de Whop con el polling. Ante error, false
 * (el cliente ve «todavía se está confirmando», que no promete de más).
 */
async function whopPaidForUser(userId: string, desde: Date): Promise<boolean> {
  const now = Date.now();
  const cached = whopCheckCache.get(userId);
  if (cached && now - cached.at < WHOP_CHECK_TTL_MS) return cached.paid;

  let paid = false;
  try {
    const payments = await listWhopPaymentsSince(desde, 50);
    paid = payments.some(
      (p) =>
        !!p.id &&
        !isWhopTestPaymentId(p.id) &&
        isPaid(p) &&
        readMetaString(p.metadata, "clerk_user_id") === userId,
    );
  } catch (err) {
    console.error(
      "[pago-estado] No se pudo consultar Whop:",
      err instanceof Error ? err.message : err,
    );
  }

  if (whopCheckCache.size > 500) whopCheckCache.clear();
  whopCheckCache.set(userId, { at: now, paid });
  return paid;
}
