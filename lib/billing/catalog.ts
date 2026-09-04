import "server-only";

/**
 * Catálogo de productos de cobro — FUENTE DE VERDAD server-side.
 *
 * ⚠️ SEGURIDAD: precio y créditos se resuelven SIEMPRE acá, NUNCA desde el
 * cliente ni desde el body del webhook. Si el cliente pudiera elegir el precio
 * o los créditos, alguien compraría 200 créditos por un dólar abriendo devtools.
 * `/api/checkout` arma el checkout con estos valores; el webhook acredita
 * `credits` resolviendo por `id` (pack), no por lo que venga en el evento.
 *
 * ⚠️ VIVE EN `lib/billing/` A PROPÓSITO (movido desde `lib/mercadopago/` el
 * 2026-09-04). El catálogo es AGNÓSTICO del riel de cobro: hoy lo consumen el
 * riel de Whop (checkout + webhook) y el de Shopify (`lib/shopify/
 * order-to-credits.ts`). Vivía bajo `lib/mercadopago/` por accidente histórico.
 *
 * Hoy hay 4 productos, TODOS de PAGO ÚNICO (ninguno es suscripción):
 *   - lifetime-pass: PASE FUNDADOR (primeros 30 fundadores). Se compra UNA vez:
 *     60 créditos + 10 análisis + perks de fundador (los perks son marketing, NO
 *     afectan la acreditación).
 *     ⚠️ Vive SOLO en la landing, NO en la vitrina de la app (ver listProducts).
 *   - pack-inicial / pack-pro / pack-negocio: RECARGA PURA de créditos de
 *     generación, sin perks. `kind: "pack"`. Estos SÍ se muestran en /upgrade y
 *     se pueden comprar TODAS las veces que el usuario quiera (cada compra suma
 *     créditos al saldo; no hay tope ni renovación automática).
 *
 * La vitrina de /upgrade se renderiza desde acá (listProducts), así no hay
 * precios duplicados en el cliente: la card y el cobro leen la misma fuente.
 * Los campos de UI (name/badge/highlight/perks/order) son cosméticos — el cobro
 * solo usa id/title/description/credits/priceUsd/whopPlanId.
 *
 * Modelo de datos preparado para suscripciones futuras: `kind` distingue el
 * tipo de compra. El ledger de créditos ya soporta el resto (ver migración
 * 0007 / grant_credits reason 'purchase').
 */

export type ProductKind = "lifetime" | "pack";

export type Product = {
  /** id estable, viaja como metadata.pack_id en el checkout y reconcilia el webhook. */
  id: string;
  kind: ProductKind;
  /** Nombre corto para la vitrina (card de /upgrade). */
  name: string;
  /** Título largo mostrado en el checkout. */
  title: string;
  description: string;
  /** Créditos de GENERACIÓN que acredita grant_credits al aprobarse el pago. */
  credits: number;
  /**
   * Créditos de ANÁLISIS IA que acredita grant_analysis_credits al aprobarse el
   * pago (bolsa aparte de los de generación). Opcional: hoy solo el Lifetime los
   * da. El webhook los resuelve de acá, NUNCA del evento.
   */
  analysisCredits?: number;
  /**
   * Precio REAL en dólares (USD). Es lo que se cobra y lo que se muestra: el
   * riel es Whop, que cobra en USD con adaptive pricing (el comprador ve su
   * moneda local y paga como local). Ya no hay precio en soles: el ancla
   * PEN/USD murió con Mercado Pago (2026-09-04).
   *
   * ⚠️ Este número es DISPLAY + referencia. El monto que Whop cobra de verdad
   * lo fija el `plan_...` de Whop (whopPlanId). Si cambia uno, cambiar el otro.
   */
  priceUsd: number;
  /**
   * Plan de Whop (`plan_...`) que cobra este producto. Es el VÍNCULO
   * catálogo ↔ Whop: `createWhopCheckout` lo manda como `plan_id` de nivel
   * superior de la checkout configuration (plan YA EXISTENTE), y el webhook lo
   * usa como fallback de atribución cuando el metadata no llega.
   *
   * Los 4 son planes `one_time` (billing_period null, renewal_price 0): NINGUNO
   * renueva ni es suscripción.
   *
   * Cuenta de Whop: biz_k4v3iljkFYxhCO.
   */
  whopPlanId: string;
  /** Orden en la vitrina (menor primero). Solo UI. */
  order: number;
  /** Texto del badge superior de la card (opcional). Solo UI. */
  badge?: string;
  /** Resalta la card como recomendada en la vitrina. Solo UI. */
  highlight?: boolean;
  /** Beneficios extra (solo Lifetime). Marketing — NO afectan la acreditación. */
  perks?: string[];
};

export const PRODUCTS: Record<string, Product> = {
  "lifetime-pass": {
    id: "lifetime-pass",
    kind: "lifetime",
    name: "Pase Fundador",
    title: "Vendí — Pase Fundador (de por vida)",
    description:
      "60 créditos de generación + 10 análisis con IA + perks de fundador. Pago único.",
    credits: 60,
    analysisCredits: 10,
    priceUsd: 10,
    whopPlanId: "plan_Cgn3jEiaucHkf",
    order: 0,
    badge: "Primeros 30 fundadores",
    highlight: true,
    perks: [
      "60 créditos de generación",
      "10 análisis con IA",
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
    priceUsd: 9,
    whopPlanId: "plan_uX5zoWJBeIDEP",
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
    priceUsd: 19,
    whopPlanId: "plan_Au5BdLxtu3nJK",
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
    priceUsd: 39,
    whopPlanId: "plan_0NIsyszmcO8dd",
    order: 3,
  },
};

/** Resuelve un producto del catálogo por id. Devuelve null si no existe. */
export function getProduct(id: string): Product | null {
  return PRODUCTS[id] ?? null;
}

/**
 * Resuelve un producto por su `plan_...` de Whop. Lo usa el webhook como
 * FALLBACK de atribución del producto cuando el evento llega sin metadata
 * (ej. una compra hecha desde un checkout link estático de Whop, que no lleva
 * nuestro metadata). Se deriva del mismo catálogo, así que no puede driftear
 * contra un segundo mapa hardcodeado.
 */
export function getProductByWhopPlanId(planId: string): Product | null {
  if (!planId) return null;
  return (
    Object.values(PRODUCTS).find((p) => p.whopPlanId === planId) ?? null
  );
}

/**
 * Lista los productos para la VITRINA de /upgrade (dentro de la app), en orden.
 *
 * Excluye el Pase Fundador (kind "lifetime"): NO va en la vitrina de packs. Se
 * vende en su propia pantalla de paywall (`/plan`, a la que llega el CTA del
 * Lifetime de la landing vía `/comenzar` → `/comprar`). El producto sigue en
 * PRODUCTS y `getProduct()` lo resuelve igual, así el cobro per-usuario
 * (/api/checkout → webhook process_whop_payment) lo acredita con plan founder.
 */
export function listProducts(): Product[] {
  return Object.values(PRODUCTS)
    .filter((p) => p.kind !== "lifetime")
    .sort((a, b) => a.order - b.order);
}
