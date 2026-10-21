/**
 * Pixel de Meta en la app — el MISMO dataset que la landing (www.vendilatam.com).
 *
 * La landing solo ve la visita: la compra pasa acá (signup → /pagar con el
 * checkout de Whop embebido → /pago/resultado). Sin el pixel en la app, Meta
 * nunca se entera de una compra y las campañas que optimizan por "Comprar" no
 * tienen señal.
 *
 * Eventos que manda la app:
 *  - PageView: el snippet base (root layout). Las navegaciones internas las
 *    cuenta solo fbevents.js (se engancha a history.pushState): NO mandar
 *    PageView a mano, se duplicaría o Meta lo descarta.
 *  - InitiateCheckout: al abrir /pagar (no se repite si recarga el mismo
 *    producto al rato).
 *  - Purchase: en /pago/resultado, cuando vuelve el checkout que se pagó
 *    (`app/pago/resultado/meta-purchase.tsx`).
 *
 * ⚠️ El Purchase de acá es SEÑAL para los anuncios, no contabilidad: lo que
 * acredita créditos sigue siendo el webhook de Whop. Solo cubre las compras por
 * /pagar (el embudo de los anuncios); las recargas por whop.com (/upgrade,
 * /fundador) y los compradores con bloqueador de anuncios quedan para la
 * Conversions API desde el webhook, que tiene que mandar el MISMO `eventID`
 * (el id del checkout, `ch_...` = `data.checkout_configuration_id`) para que
 * Meta no cuente dos veces.
 *
 * Es un ID público: va hardcodeado, como SUPABASE_HOST en next.config.
 */
export const META_PIXEL_ID = "2212150892981463";

/**
 * Snippet base oficial de Meta. Va inline en el <head> del root layout (como
 * el anti-flash del tema), así `window.fbq` existe ANTES de hidratar y los
 * eventos que se disparan en un useEffect nunca se pierden: quedan en la cola
 * del stub hasta que carga fbevents.js.
 */
export const metaPixelScript = `!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${META_PIXEL_ID}');
fbq('track', 'PageView');`;

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

/**
 * Manda un evento estándar al pixel. No-op si el pixel no está cargado (en
 * local y en previews no se inyecta). `eventId` es lo que Meta usa para
 * descartar duplicados del mismo evento.
 */
export function trackMeta(
  event: "InitiateCheckout" | "Purchase",
  params: Record<string, unknown>,
  eventId: string,
): void {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;
  window.fbq("track", event, params, { eventID: eventId });
}

/* ────────────────────────────────────────────────────────────────────────────
   Checkouts en curso — lo que /pago/resultado necesita para mandar el Purchase.

   /pago/resultado no sabe QUÉ se compró ni por cuánto. Por eso /pagar deja
   anotado cada checkout en localStorage (no sessionStorage: Yape y los bancos
   con 3DS pueden volver en otra pestaña), indexado por su session, y la vuelta
   trae `?cs=<sessionId>` para saber cuál de todos se pagó (dos pestañas de
   /pagar no se pisan). Los flags `initiated` / `purchased` hacen que recargar
   no duplique eventos.
   ──────────────────────────────────────────────────────────────────────────── */

const CHECKOUTS_KEY = "vendi:meta-checkouts";
/** Un checkout anotado hace más de esto ya no cuenta como compra de ahora. */
const CHECKOUT_TTL_MS = 24 * 60 * 60 * 1000;
/** Tope de checkouts guardados: alcanza para varias pestañas y recargas. */
const MAX_CHECKOUTS = 5;

export type MetaCheckout = {
  sessionId: string;
  productId: string;
  productName: string;
  /** Precio en USD del catálogo (el monto que se le informa a Meta). */
  value: number;
  startedAt: number;
  initiated?: boolean;
  /** El embed de Whop avisó `onComplete` (el cobro salió en la página). */
  completed?: boolean;
  purchased?: boolean;
};

/** Los checkouts vigentes (sin los vencidos). Storage roto → vacío. */
function readCheckouts(): MetaCheckout[] {
  try {
    const raw = window.localStorage.getItem(CHECKOUTS_KEY);
    const list = raw ? (JSON.parse(raw) as MetaCheckout[]) : [];
    if (!Array.isArray(list)) return [];
    return list.filter((c) => Date.now() - c.startedAt <= CHECKOUT_TTL_MS);
  } catch {
    return [];
  }
}

export function readMetaCheckout(sessionId: string): MetaCheckout | null {
  return readCheckouts().find((c) => c.sessionId === sessionId) ?? null;
}

/**
 * El último checkout del mismo producto que ya avisó InitiateCheckout, no se
 * pagó y empezó hace menos de `withinMs` (para no repetir el evento en
 * recargas).
 */
export function findRecentMetaCheckout(
  productId: string,
  withinMs: number,
): MetaCheckout | null {
  const recientes = readCheckouts().filter(
    (c) =>
      c.productId === productId &&
      c.initiated &&
      !c.purchased &&
      Date.now() - c.startedAt < withinMs,
  );
  return recientes.sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;
}

/** Guarda (o reemplaza, por sessionId) un checkout. */
export function writeMetaCheckout(checkout: MetaCheckout): void {
  try {
    const resto = readCheckouts().filter(
      (c) => c.sessionId !== checkout.sessionId,
    );
    const list = [checkout, ...resto].slice(0, MAX_CHECKOUTS);
    window.localStorage.setItem(CHECKOUTS_KEY, JSON.stringify(list));
  } catch {
    // Modo privado / storage bloqueado: se pierde la señal, no el pago.
  }
}

/** Parámetros de contenido que Meta espera en InitiateCheckout y Purchase. */
export function checkoutParams(checkout: MetaCheckout): Record<string, unknown> {
  return {
    value: checkout.value,
    currency: "USD",
    content_ids: [checkout.productId],
    content_name: checkout.productName,
    content_type: "product",
    num_items: 1,
  };
}
