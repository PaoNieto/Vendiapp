import { listProducts } from "@/lib/billing/catalog";
import { UpgradeStore } from "./upgrade-store";

/**
 * Tienda de Vendí — Server Component.
 *
 * Lee el catálogo server-side (FUENTE DE VERDAD de precios/créditos) y se lo
 * pasa por props a la vitrina cliente. Así la card y el cobro leen los mismos
 * valores: no hay precios hardcodeados en el cliente ni drift.
 *
 * Hoy hay 4 productos: el Pase Fundador (lifetime) + los 3 packs de créditos.
 * El cobro real (Whop) lo maneja /api/checkout + el webhook /api/webhooks/whop.
 */
export default function UpgradePage() {
  const products = listProducts();
  return <UpgradeStore products={products} />;
}
