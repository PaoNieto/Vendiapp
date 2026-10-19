import "server-only";
import { adminClientOrNull, errorText } from "./db";
import { NOTICE_KEYS, type NoticeKind, type NoticePayloads } from "./types";

/**
 * Avisos al CLIENTE (campanita). Solo server: escribe con service_role vía la
 * RPC `notify_user` (el cliente no tiene INSERT sobre user_notifications).
 */

/**
 * Crea un aviso para `userId` y devuelve su id. NUNCA tira: ante cualquier
 * error loguea y devuelve null (un aviso que no sale no puede romper la
 * acción que lo disparó).
 *
 * Con `dedupeKey`, es idempotente: si ya existía un aviso con esa llave para
 * ese usuario, no crea otro y devuelve el id del existente. Usá las llaves de
 * `NOTICE_KEYS` (el reaper depende de `gen:<generation_id>`).
 *
 * Devolvé el id en la respuesta de la ruta: si la pantalla mostró el resultado,
 * marca ese aviso leído y no se duplica en la campanita.
 *
 * `opts.read`: crearlo ya leído (ej. tanda OK con el cliente esperando la
 * respuesta: queda la marca 'gen:<id>' sin sumar a la campanita).
 */
export async function notifyUser<K extends NoticeKind>(
  userId: string,
  kind: K,
  data: NoticePayloads[K],
  dedupeKey?: string | null,
  opts: { read?: boolean } = {},
): Promise<string | null> {
  if (!userId) {
    console.error("[avisos] notifyUser sin userId:", kind);
    return null;
  }
  const admin = adminClientOrNull();
  if (!admin) return null;

  // Un reintento: la RPC es idempotente por dedupe_key, así que repetir es
  // seguro (sin llave, un reintento tras un timeout podría duplicar el aviso:
  // es preferible a perder el aviso de una tanda).
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data: id, error } = await admin.rpc("notify_user", {
        p_user_id: userId,
        p_kind: kind,
        p_data: data ?? {},
        p_dedupe_key: dedupeKey ?? null,
        p_read: opts.read === true,
      });
      if (!error) return typeof id === "string" ? id : null;
      console.error(`[avisos] notify_user falló (${kind}, intento ${attempt + 1}):`, error.message);
    } catch (err) {
      console.error(`[avisos] notify_user tiró (${kind}, intento ${attempt + 1}):`, errorText(err));
    }
  }
  return null;
}

/**
 * «Te quedan {n} créditos…» — solo si el saldo de GENERACIÓN quedó entre 1 y 4,
 * y una sola vez por compra (dedupe con el id de la última compra del ledger).
 * Llamalo después de una tanda con el saldo final. No hace nada con ilimitados.
 * NUNCA tira; devuelve el id del aviso o null.
 */
export async function maybeNotifyCreditsLow(input: {
  userId: string;
  balance: number | null | undefined;
  unlimited?: boolean | null;
}): Promise<string | null> {
  const balance = input.balance;
  if (input.unlimited || typeof balance !== "number" || balance < 1 || balance > 4) {
    return null;
  }
  const admin = adminClientOrNull();
  if (!admin) return null;
  try {
    const { data, error } = await admin
      .from("credit_ledger")
      .select("id")
      .eq("user_id", input.userId)
      .eq("reason", "purchase")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data?.id) return null;
    return await notifyUser(
      input.userId,
      "credits_low",
      { n: Math.floor(balance) },
      NOTICE_KEYS.creditsLow(String(data.id)),
    );
  } catch (err) {
    console.error("[avisos] maybeNotifyCreditsLow falló:", errorText(err));
    return null;
  }
}
