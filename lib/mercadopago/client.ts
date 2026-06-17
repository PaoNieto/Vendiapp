import "server-only";
import { MercadoPagoConfig } from "mercadopago";

/**
 * Cliente de Mercado Pago configurado con el Access Token de Vendí.
 *
 * SOLO server-side ("server-only" hace fallar el build si se importa desde el
 * browser — el Access Token NO debe filtrarse nunca al cliente).
 *
 * Vendí es single-seller: cobra a sus clientes con SU PROPIA cuenta, así que
 * solo necesita su Access Token del panel (NO el OAuth /oauth/token, que es de
 * marketplaces que cobran por terceros). Empezar con el token de PRUEBA
 * (TEST-...); en prod va el de producción.
 *
 * Lo consumen /api/checkout (crear Preference) y el webhook (Payment.get).
 */
export function getMercadoPagoClient(): MercadoPagoConfig {
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("Falta MP_ACCESS_TOKEN en el entorno.");
  }
  // timeout defensivo: el webhook tiene que responder a MP en <22s o reintenta.
  return new MercadoPagoConfig({
    accessToken,
    options: { timeout: 8000 },
  });
}
