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
 * Hoy hay 4 productos, todos pago único:
 *   - lifetime-pass: PASE FUNDADOR (primeros 30 fundadores). 60 créditos +
 *     perks de fundador (los perks son marketing, NO afectan la acreditación).
 *   - pack-inicial / pack-pro / pack-negocio: RECARGA PURA de créditos de
 *     generación, sin perks. `kind: "pack"`.
 *
 * La vitrina de /upgrade se renderiza desde acá (listProducts), así no hay
 * precios duplicados en el cliente: la card y el cobro leen la misma fuente.
 * Los campos de UI (name/badge/highlight/perks/order) son cosméticos — el cobro
 * solo usa id/title/description/credits/priceSoles.
 *
 * Modelo de datos preparado para suscripciones futuras: `kind` distingue el
 * tipo de compra. El ledger de créditos ya soporta el resto (ver migración
 * 0007 / grant_credits reason 'purchase').
 */

export type ProductKind = "lifetime" | "pack";

export type Product = {
  /** id estable, viaja como metadata.pack_id en la Preference y reconcilia el webhook. */
  id: string;
  kind: ProductKind;
  /** Nombre corto para la vitrina (card de /upgrade). */
  name: string;
  /** Título largo mostrado en el checkout de Mercado Pago. */
  title: string;
  description: string;
  /** Créditos de GENERACIÓN que acredita grant_credits al aprobarse el pago. */
  credits: number;
  /** Precio en soles (PEN). Mercado Pago Perú cobra en moneda local. */
  priceSoles: number;
  /** Orden en la vitrina (menor primero). Solo UI. */
  order: number;
  /** Texto del badge superior de la card (opcional). Solo UI. */
  badge?: string;
  /** Resalta la card como recomendada en la vitrina. Solo UI. */
  highlight?: boolean;
  /** Beneficios extra (solo Lifetime). Marketing — NO afectan la acreditación. */
  perks?: string[];
};

// Precio del Lifetime Pass en soles (confirmado por Paolo, 2026-06-16).
const LIFETIME_PASS_PRICE_PEN = 37.9;

export const PRODUCTS: Record<string, Product> = {
  "lifetime-pass": {
    id: "lifetime-pass",
    kind: "lifetime",
    name: "Pase Fundador",
    title: "Vendí — Pase Fundador (de por vida)",
    description:
      "60 créditos de generación + soporte y perks de fundador. Pago único.",
    credits: 60,
    priceSoles: LIFETIME_PASS_PRICE_PEN,
    order: 0,
    badge: "Primeros 30 fundadores",
    highlight: true,
    perks: [
      "60 créditos de generación",
      "Soporte constante",
      "Insignia de Fundador",
      "Acceso anticipado a lo nuevo",
    ],
  },
  "pack-inicial": {
    id: "pack-inicial",
    kind: "pack",
    name: "Pack Inicial",
    title: "Vendí — Pack Inicial (30 créditos)",
    description:
      "30 créditos de generación. Pago único. Los créditos no vencen.",
    credits: 30,
    priceSoles: 24.9,
    order: 1,
  },
  "pack-pro": {
    id: "pack-pro",
    kind: "pack",
    name: "Pack Pro",
    title: "Vendí — Pack Pro (80 créditos)",
    description:
      "80 créditos de generación. Pago único. Los créditos no vencen.",
    credits: 80,
    priceSoles: 54.9,
    order: 2,
    badge: "Más elegido",
    highlight: true,
  },
  "pack-negocio": {
    id: "pack-negocio",
    kind: "pack",
    name: "Pack Negocio",
    title: "Vendí — Pack Negocio (200 créditos)",
    description:
      "200 créditos de generación. Pago único. Los créditos no vencen.",
    credits: 200,
    priceSoles: 119.9,
    order: 3,
  },
};

/** Resuelve un producto del catálogo por id. Devuelve null si no existe. */
export function getProduct(id: string): Product | null {
  return PRODUCTS[id] ?? null;
}

/** Lista los productos en orden de vitrina (para renderizar /upgrade). */
export function listProducts(): Product[] {
  return Object.values(PRODUCTS).sort((a, b) => a.order - b.order);
}
