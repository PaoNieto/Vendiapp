"use client";

import { useEffect } from "react";
import {
  checkoutParams,
  readMetaCheckout,
  trackMeta,
  writeMetaCheckout,
} from "@/lib/meta-pixel";

/** `status` de la vuelta que significa "cobrado" (Whop y nuestro onComplete). */
const COBRADO = new Set(["success", "succeeded", "approved", "paid", "completed"]);

/**
 * Purchase del pixel de Meta — la señal que necesitan las campañas que
 * optimizan por "Comprar". No pinta nada: va montado en el layout de
 * /pago/resultado para no tocar la pantalla de resultado.
 *
 * Sale UNA vez y solo si vuelve el checkout que se anotó en /pagar (`?cs=`) y
 * el pago salió:
 *  - `status` de cobrado: el embed avisó `onComplete` y navegó con
 *    `status=success`, o Whop volvió de un paso fuera del sitio (3DS, banco)
 *    con `status=succeeded`.
 *  - Sin `status`, pero el embed avisó `onComplete` en /pagar.
 * `processing`, `failed`, `canceled` y cualquier otro NO disparan: contar como
 * compra algo que no se cobró le mentiría a Meta.
 *
 * Sin `cs` que coincida no se manda nada: las compras por whop.com (/upgrade)
 * vuelven sin él, y un Purchase con el producto o el monto de otro checkout
 * ensucia más de lo que ayuda.
 */
export function MetaPurchase() {
  useEffect(() => {
    // Se lee de la URL acá (y no con useSearchParams) porque a esta página
    // siempre se llega con navegación completa: la monta un redirect.
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("cs");
    if (!sessionId) return;
    const checkout = readMetaCheckout(sessionId);
    if (!checkout || checkout.purchased) return;
    const status = (params.get("status") ?? "").trim().toLowerCase();
    const cobrado =
      COBRADO.has(status) || (status === "" && checkout.completed === true);
    if (!cobrado) return;
    trackMeta("Purchase", checkoutParams(checkout), checkout.sessionId);
    writeMetaCheckout({ ...checkout, purchased: true });
  }, []);

  return null;
}
