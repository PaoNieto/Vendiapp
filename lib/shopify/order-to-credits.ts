import "server-only";
import { getProduct, type Product } from "@/lib/billing/catalog";

/**
 * Mapeo de un pedido de Shopify (orders/paid) -> creditos a acreditar.
 *
 * La FUENTE DE VERDAD de cuantos creditos da cada producto es el catalogo
 * server-side (lib/billing/catalog.ts, agnostico del riel de cobro). Aca NO
 * se inventan creditos ni se leen del precio del pedido: se resuelve el producto
 * del catalogo y se usa su `.credits`. Igual que en el webhook de MP, esto evita
 * que alguien manipule el payload para acreditarse de mas.
 *
 * El puente entre Shopify y el catalogo es el SKU del line_item: cada producto en
 * Shopify debe tener seteado uno de estos SKUs (ver SHOPIFY_SKU_TO_CATALOG). Si el
 * SKU falta, se intenta un fallback por coincidencia de titulo (mas fragil -- por
 * eso se recomienda setear los SKUs en el admin de Shopify).
 */

/**
 * SKU de Shopify -> id de producto en el catalogo. Estos son los SKUs que hay que
 * configurar en el admin de Shopify para cada producto:
 *   "VENDI Lifetime Pass"         -> SKU "lifetime-pass"   (60 creditos, kind lifetime)
 *   "Pack Inicial - 30 creditos"  -> SKU "pack-inicial"    (30 creditos)
 *   "Pack Pro - 80 creditos"      -> SKU "pack-pro"        (80 creditos)
 *   "Pack Negocio - 200 creditos" -> SKU "pack-negocio"    (200 creditos)
 *
 * Mantener los SKUs IGUALES a los ids del catalogo nos da un mapeo trivial y sin
 * ambiguedad. Si en el futuro hay que usar otros SKUs, alcanza con editar este
 * mapa (no toca el catalogo ni el route).
 */
export const SHOPIFY_SKU_TO_CATALOG: Record<string, string> = {
  "lifetime-pass": "lifetime-pass",
  "pack-inicial": "pack-inicial",
  "pack-pro": "pack-pro",
  "pack-negocio": "pack-negocio",
};

/**
 * Fallback por titulo: cuando un line_item viene SIN sku, se intenta resolver el
 * producto del catalogo comparando el titulo del item contra estos patrones.
 * Es un mapeo "contiene" insensible a mayusculas/acentos -- menos robusto que el
 * SKU, pero salva pedidos donde el SKU no quedo cargado.
 */
const TITLE_FALLBACK: Array<{ match: string; catalogId: string }> = [
  { match: "lifetime", catalogId: "lifetime-pass" },
  { match: "pase fundador", catalogId: "lifetime-pass" },
  { match: "pack inicial", catalogId: "pack-inicial" },
  { match: "pack pro", catalogId: "pack-pro" },
  { match: "pack negocio", catalogId: "pack-negocio" },
];

/** Line item de un Order de Shopify (solo los campos que nos importan). */
export type ShopifyLineItem = {
  sku?: string | null;
  title?: string | null;
  name?: string | null;
  quantity?: number | null;
};

/** Order de Shopify (subconjunto que consume este mapeo). */
export type ShopifyOrder = {
  line_items?: ShopifyLineItem[] | null;
};

export type CreditsResult = {
  /** Suma de creditos a acreditar por todos los line_items mapeables. */
  credits: number;
  /** true si ALGUN item resuelto es kind 'lifetime' (dispara plan founder en la RPC). */
  isLifetime: boolean;
};

// Bloque de "combining diacritical marks" U+0300..U+036F. Lo construimos con
// codepoints (sin caracteres no-ASCII en el source) para evitar problemas de
// encoding del archivo. Quita los acentos que deja NFD.
const COMBINING_MARKS = new RegExp(
  "[" + String.fromCharCode(0x0300) + "-" + String.fromCharCode(0x036f) + "]",
  "g",
);

/** Normaliza un texto para comparacion: minusculas + sin acentos + trim. */
function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(COMBINING_MARKS, "").trim();
}

/** Resuelve el producto del catalogo para un line_item (SKU preferido, titulo de fallback). */
function resolveProduct(item: ShopifyLineItem): Product | null {
  // 1. SKU exacto (caso normal y recomendado).
  const sku = item.sku?.trim();
  if (sku) {
    const catalogId = SHOPIFY_SKU_TO_CATALOG[sku];
    if (catalogId) {
      const product = getProduct(catalogId);
      if (product) return product;
    }
    // SKU presente pero desconocido -> no forzamos fallback por titulo (el SKU
    // manda); devolvemos null y el caller lo saltea con log.
    return null;
  }

  // 2. Fallback por titulo cuando no hay SKU.
  const title = normalize(item.title ?? item.name ?? "");
  if (!title) return null;
  for (const { match, catalogId } of TITLE_FALLBACK) {
    if (title.includes(match)) {
      const product = getProduct(catalogId);
      if (product) return product;
    }
  }
  return null;
}

/**
 * Mapea un Order de Shopify a { credits, isLifetime }.
 *
 * Recorre los line_items, resuelve cada uno contra el catalogo y acumula
 * `credits = Sum (product.credits * quantity)`. Si un item NO mapea a nada, se
 * loguea y se SALTEA (no se cae el pedido entero por un item raro). Si al final
 * credits === 0, el route lo trata como "nada que acreditar" y responde 200.
 */
export function orderToCredits(order: ShopifyOrder): CreditsResult {
  const items = order.line_items ?? [];
  let credits = 0;
  let isLifetime = false;

  for (const item of items) {
    const product = resolveProduct(item);
    if (!product) {
      console.warn(
        "[shopify-webhook] line_item sin mapeo en catalogo (se saltea):",
        { sku: item.sku, title: item.title ?? item.name },
      );
      continue;
    }
    const quantity = Math.max(1, Math.trunc(Number(item.quantity) || 1));
    credits += product.credits * quantity;
    if (product.kind === "lifetime") isLifetime = true;
  }

  return { credits, isLifetime };
}
