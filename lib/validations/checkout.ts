import { z } from "zod";

/**
 * Validación del request de checkout. El cliente SOLO manda qué producto quiere
 * comprar (`productId`); el precio y los créditos los resuelve el servidor desde
 * el catálogo (lib/mercadopago/catalog.ts), NUNCA el cliente.
 */
export const checkoutRequestSchema = z.object({
  productId: z.string().min(1, "Falta el id del producto"),
});

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;
