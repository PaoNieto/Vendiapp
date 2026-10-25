import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { fetchCheckoutMetadata, readMetaString } from "./payments";

/**
 * ¿Quién pagó? para un pago que llegó SIN atribución completa.
 *
 * Sirve SOLO para avisarle al cliente «Recibimos tu pago y estamos terminando
 * de acreditarlo…» y para que Paolo sepa a quién acreditar. NUNCA acredita:
 * eso lo hace Paolo desde el panel con el `pay_` original (JonSnow #2/#5).
 *
 * Orden de confianza:
 *  1. `clerk_user_id` del metadata del pago (lo escribimos nosotros).
 *  2. El metadata de la checkout configuration (`ch_...`) que produjo el pago:
 *     también la creamos nosotros server-side.
 *  3. Email del comprador en Whop → Clerk, SOLO si hay UN único usuario con ese
 *     email y ese email está VERIFICADO en Clerk (la regla de Shopify + JonSnow
 *     #5). Cualquier otro caso: no sabemos quién es.
 *
 * Corre dentro de `after()` (hace llamadas de red). Nunca tira.
 */
export type BuyerMatch = {
  userId: string;
  via: "metadata" | "checkout" | "email";
  /** Pack que figuraba en el checkout guardado, si había. */
  packId: string | null;
};

export async function resolveUnmatchedBuyer(input: {
  metadataUserId: string | null;
  checkoutConfigurationId: string | null;
  email: string | null;
}): Promise<BuyerMatch | null> {
  if (input.metadataUserId) {
    return { userId: input.metadataUserId, via: "metadata", packId: null };
  }

  if (input.checkoutConfigurationId) {
    const metadata = await fetchCheckoutMetadata(input.checkoutConfigurationId);
    const userId = readMetaString(metadata, "clerk_user_id");
    if (userId) {
      return {
        userId,
        via: "checkout",
        packId:
          readMetaString(metadata, "pack_id") ??
          readMetaString(metadata, "product_id"),
      };
    }
  }

  const email = input.email?.trim().toLowerCase();
  if (email && email.includes("@")) {
    const userId = await uniqueVerifiedUserByEmail(email);
    if (userId) return { userId, via: "email", packId: null };
  }

  return null;
}

/** Id de Clerk del ÚNICO usuario con ese email verificado, o null. */
async function uniqueVerifiedUserByEmail(email: string): Promise<string | null> {
  try {
    const client = await clerkClient();
    const { data, totalCount } = await client.users.getUserList({
      emailAddress: [email],
      limit: 2,
    });
    if (totalCount !== 1 || data.length !== 1) return null;
    const user = data[0];
    const match = user.emailAddresses.find(
      (address) => address.emailAddress.trim().toLowerCase() === email,
    );
    return match?.verification?.status === "verified" ? user.id : null;
  } catch (err) {
    console.error(
      "[whop] No se pudo buscar el comprador por email en Clerk:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
