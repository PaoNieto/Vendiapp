import "server-only";

/**
 * Catálogo de productos de cobro — FUENTE DE VERDAD server-side.
 *
 * ⚠️ SEGURIDAD: precio y créditos se resuelven SIEMPRE acá, NUNCA desde el
 * cliente ni desde el body del webhook. Si el cliente pudiera elegir el precio
 * o los créditos, alguien compraría 200 créditos por 1 sol abriendo devtools.
 * `/api/checkout` arma la Preference con estos valores; el webhook acredita
 * `credits` resolviendo por `id` (pack), no por lo que venga en el evento.
 *
 * Primer producto = LIFETIME PASS (pago único, primeros 30 fundadores):
 * 60 créditos de generación + perks de fundador (los perks son marketing, no
 * afectan la acreditación de créditos). Los packs 30/75/200 vienen después;
 * se agregan como entradas nuevas acá sin tocar checkout ni webhook.
 *
 * Modelo de datos preparado para suscripciones futuras: `kind` distingue el
 * tipo de compra; hoy solo `lifetime`. El ledger de créditos ya soporta el
 * resto (ver migración 0007 / grant_credits reason 'purchase').
 */

export type ProductKind = "lifetime" | "pack";

export type Product = {
  /** id estable, viaja como metadata.pack_id en la Preference y reconcilia el webhook. */
  id: string;
  kind: ProductKind;
  /** Título mostrado en el checkout de Mercado Pago. */
  title: string;
  description: string;
  /** Créditos de GENERACIÓN que acredita grant_credits al aprobarse el pago. */
  credits: number;
  /** Precio en soles (PEN). Mercado Pago Perú cobra en moneda local. */
  priceSoles: number;
};

// Precio del Lifetime Pass en soles (confirmado por Paolo, 2026-06-16).
const LIFETIME_PASS_PRICE_PEN = 37.9;

export const PRODUCTS: Record<string, Product> = {
  "lifetime-pass": {
    id: "lifetime-pass",
    kind: "lifetime",
    title: "Vendí — Pase Fundador (de por vida)",
    description:
      "60 créditos de generación + soporte y perks de fundador. Pago único.",
    credits: 60,
    priceSoles: LIFETIME_PASS_PRICE_PEN,
  },
};

/** Resuelve un producto del catálogo por id. Devuelve null si no existe. */
export function getProduct(id: string): Product | null {
  return PRODUCTS[id] ?? null;
}
