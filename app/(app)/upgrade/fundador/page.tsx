import { notFound } from "next/navigation";
import { getProduct } from "@/lib/mercadopago/catalog";
import { UpgradeStore } from "../upgrade-store";

/**
 * Página de compra del PASE FUNDADOR (Lifetime) — Server Component.
 *
 * Destino de TODOS los CTA de compra de la landing (vía
 * /comenzar?producto=lifetime-pass). La landing vende la app a través del
 * Lifetime, así que acá se muestra SOLO ese producto — NO la vitrina de packs
 * (esa es /upgrade, la tienda interna de recarga).
 *
 * Reusa el componente `UpgradeStore` pasándole un único producto (el lifetime):
 * el mismo botón dispara POST /api/checkout con productId="lifetime-pass", que
 * crea la Preference de Mercado Pago con external_reference = id de Clerk. El
 * webhook (process_mp_payment) acredita 60 créditos + 10 análisis y marca
 * plan='founder' — abriendo el paywall.
 *
 * Exenta del paywall vía el matcher `/upgrade/(.*)` del proxy: un usuario
 * logueado-sin-pagar SÍ puede verla (es donde paga y se desbloquea).
 */
export default function FundadorPage() {
  const lifetime = getProduct("lifetime-pass");
  // Si el producto saliera del catálogo, 404 en vez de una página vacía.
  if (!lifetime || lifetime.kind !== "lifetime") notFound();

  return (
    <UpgradeStore
      products={[lifetime]}
      title="Pase Fundador"
      subtitle="Pago único para los primeros 30 fundadores de Vendí. Incluye 60 créditos de generación y 10 análisis con IA. Los créditos no vencen."
    />
  );
}
