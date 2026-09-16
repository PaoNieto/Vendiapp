import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { ShieldAlert } from "lucide-react";
import { AppBackground } from "@/components/dashboard/app-background";
import { ensureProfile } from "@/lib/auth/ensure-profile";
import { getProduct } from "@/lib/billing/catalog";
import {
  createWhopCheckout,
  CreateCheckoutError,
} from "@/lib/whop/create-checkout";
import { PagarClient } from "./pagar-client";

/**
 * /pagar/[productId] — CHECKOUT DE WHOP EMBEBIDO EN NUESTRA PROPIA PÁGINA.
 *
 * Es la alternativa al salto a whop.com: en vez de mandar al comprador al
 * `purchase_url` (lo que sigue haciendo `/api/checkout` + `/comprar`), acá se
 * monta el iframe de Whop dentro de Vendí. Todo el resto del riel es EL MISMO:
 * el cobro lo confirma `app/api/webhooks/whop/route.ts` (fuente de verdad) y la
 * acreditación sale de ahí, nunca del cliente.
 *
 * 🔴 RUTA NUEVA EN PARALELO. No reemplaza ni toca `/comprar`, `/plan`,
 * `/upgrade` ni `/api/checkout`: esos siguen funcionando exactamente igual. Si
 * este camino falla, el embudo viejo sigue vivo.
 *
 * 🔴 LA ATRIBUCIÓN NO SE ROMPE. `createWhopCheckout` crea una CHECKOUT
 * CONFIGURATION vía API (`POST /checkout_configurations`) con el metadata
 * `{ clerk_user_id, pack_id, product_id }`. Whop copia ese metadata al pago, y
 * su `id` (prefijo `ch_`) es exactamente lo que consume la prop `sessionId` del
 * `<WhopCheckoutEmbed>` — es el mismo id que viaja en el `?session=ch_…` del
 * `purchase_url`. O sea: embeber NO pierde el "a quién le acredito".
 * (Verificado contra docs.whop.com: `CheckoutConfiguration.id` = `ch_…` y
 * `purchase_url` = `https://whop.com/checkout/plan_XXX/?session=ch_XXX`.)
 *
 * GUARDAS (y por qué esta ruta NO va en `isPublicRoute` de `proxy.ts`):
 *  - sin sesión → el proxy ya la manda a `/login?redirect_url=…` porque `/pagar`
 *    no está en la lista de rutas públicas. El `redirect()` de acá abajo es el
 *    cinturón además del tirante (defensa en profundidad si la ruta se moviera).
 *    NECESITAMOS el userId de Clerk: sin él no hay metadata y el webhook no
 *    sabría a quién acreditar.
 *  - producto inexistente → 404. El precio y los créditos NUNCA viajan desde el
 *    cliente: se resuelven acá con `getProduct()` (catálogo `server-only`).
 *
 * ⚠️ NO hay gate de "ya pagó": es deliberado. Los 3 packs son RECARGAS
 * repetibles (el que ya pagó tiene que poder comprar otra vez). El Pase
 * Fundador sí se podría gatear, pero eso es una decisión de embudo que hoy vive
 * en `/plan` y `/comprar`, no acá.
 */

// Crea un checkout NUEVO en cada request (una llamada HTTP a la API de Whop):
// prerenderizar esto no tendría sentido y además filtraría un `ch_` compartido
// entre usuarios distintos.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Pagar — Vendí",
  robots: { index: false, follow: false },
};

/**
 * Saca el `session=ch_…` del `purchase_url` de Whop.
 *
 * Es el PLAN B de la prop `sessionId`: `createWhopCheckout` ya devuelve
 * `config.id`, pero lo tipa como opcional (la respuesta de Whop es parcial en
 * nuestro tipo). El `purchase_url` lleva el MISMO id en su query, así que si
 * alguna vez volviera sin `id` podemos recuperarlo de ahí en vez de romper el
 * checkout. Sin `sessionId` el embed no puede montar con nuestro metadata.
 */
function sessionIdFromPurchaseUrl(purchaseUrl: string): string | null {
  try {
    return new URL(purchaseUrl).searchParams.get("session");
  } catch {
    return null;
  }
}

/**
 * Estado de error legible — nunca un stack ni el cuerpo crudo de Whop.
 *
 * El detalle técnico ya se logueó en el server (`console.error`); acá el
 * comprador solo ve qué pasó y por dónde seguir. La salida es `/upgrade`
 * porque es la tienda dentro de la app; el que no pagó nunca llega hasta acá
 * sin pasar antes por `/plan`.
 */
function CheckoutErrorState({ mensaje }: { mensaje: string }) {
  return (
    <div className="px-5 py-16 sm:px-8">
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        <ShieldAlert className="h-12 w-12 text-destructive" />
        <h1 className="mt-5 font-display text-3xl italic text-foreground">
          No pudimos abrir el pago
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{mensaje}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          No se hizo ningún cargo.
        </p>
        <div className="mt-8 flex gap-3">
          <Link
            href="/upgrade"
            className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-pill-bg px-5 py-3 text-sm font-semibold text-pill-fg transition-opacity hover:opacity-90"
          >
            Volver a la tienda
          </Link>
        </div>
      </div>
    </div>
  );
}

export default async function PagarPage({
  params,
}: {
  // Next 16: `params` es un Promise. Hay que await-earlo antes de leerlo.
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;

  // 1. Sesión Clerk. El userId es LA atribución del pago: sin él, el webhook
  //    `payment.succeeded` no sabría a quién acreditar los créditos.
  const { userId } = await auth();
  if (!userId) {
    // El productId viene de la URL (entrada del usuario): se encodea para que
    // no pueda inyectar query params ni un destino externo en el redirect_url
    // que honra el <SignIn/> de Clerk.
    const destino = `/pagar/${encodeURIComponent(productId)}`;
    redirect(`/login?redirect_url=${encodeURIComponent(destino)}`);
  }

  // 2. La fila `profiles` tiene que existir ANTES de pagar: el webhook acredita
  //    con `grant_credits`, que falla si el profile no existe. Idempotente.
  //    Mismo paso que hace `app/api/checkout/route.ts`.
  await ensureProfile();

  // 3. Producto del catálogo server-side. FUENTE DE VERDAD de precio y créditos.
  const product = getProduct(productId);
  if (!product) notFound();

  // 4. Checkout de Whop. `sessionId` (el `ch_…`) es lo único que baja al
  //    cliente: la API key y el metadata jamás salen del server.
  let sessionId: string | null = null;
  let errorMensaje: string | null = null;
  try {
    const checkout = await createWhopCheckout(userId, product.id);
    sessionId =
      checkout.sessionId ?? sessionIdFromPurchaseUrl(checkout.initPoint);
    if (!sessionId) {
      console.error(
        "[pagar] Whop creó el checkout pero no devolvió session id:",
        checkout.initPoint,
      );
      errorMensaje =
        "El proveedor de pagos respondió de forma inesperada. Probá de nuevo en un minuto.";
    }
  } catch (err) {
    // OJO: el try/catch envuelve SOLO la llamada a Whop. `redirect()` y
    // `notFound()` funcionan tirando un error especial de Next — si quedaran
    // adentro de un catch, se los tragaría y la navegación no pasaría nunca.
    if (err instanceof CreateCheckoutError) {
      console.error(
        `[pagar] CreateCheckoutError (${err.code}) para ${product.id}:`,
        err.message,
      );
      errorMensaje =
        err.code === "APP_URL_MISSING"
          ? "El sistema de pagos todavía no está configurado. Escribinos y lo resolvemos."
          : "No pudimos conectar con el proveedor de pagos. Probá de nuevo en un minuto.";
    } else {
      console.error("[pagar] Error inesperado creando el checkout:", err);
      errorMensaje =
        "Tuvimos un problema al abrir el pago. Probá de nuevo en un minuto.";
    }
  }

  if (errorMensaje || !sessionId) {
    return (
      <AppBackground>
        <CheckoutErrorState
          mensaje={
            errorMensaje ??
            "Tuvimos un problema al abrir el pago. Probá de nuevo en un minuto."
          }
        />
      </AppBackground>
    );
  }

  // 5. Email para prefillear el checkout. Sale de Clerk EN SERVER, no del
  //    cliente: el payload de Whop no trae email y no queremos que el comprador
  //    lo tenga que tipear de nuevo. Es solo comodidad — si no lo tenemos, el
  //    checkout se lo pide.
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;

  return (
    <AppBackground>
      <PagarClient
        sessionId={sessionId}
        product={{
          id: product.id,
          name: product.name,
          kind: product.kind,
          priceUsd: product.priceUsd,
          credits: product.credits,
          // El catálogo lo tiene opcional (hoy solo el Pase Fundador da
          // análisis). El contrato de props lo pide siempre presente.
          analysisCredits: product.analysisCredits ?? 0,
        }}
        email={email}
      />
    </AppBackground>
  );
}
