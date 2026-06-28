/**
 * NOTA: este módulo lo importa el proxy (middleware), que NO corre en la capa
 * "react-server". Por eso NO usa `import "server-only"` (afuera de esa capa el
 * paquete LANZA al importarse y rompería el proxy). Igual es server-only de
 * hecho: depende de `SUPABASE_SERVICE_ROLE_KEY` (env sin prefijo NEXT_PUBLIC),
 * que no existe en el browser → en cliente nunca tendría con qué consultar.
 *
 * ¿El usuario YA pagó (o está en la allowlist de acceso libre)?
 *
 * Es el "guardia en la puerta" del modelo PAGA-PRIMERO: una cuenta nueva puede
 * registrarse y loguearse, pero NO entra a la app hasta que tenga una compra
 * registrada. Lo consulta el proxy (middleware) en cada navegación de página.
 *
 *  - "Pagó"        = al menos un movimiento con reason 'purchase' en
 *                    `credit_ledger`. Lo escribe `grant_credits` desde el webhook
 *                    de Mercado Pago y el de Shopify → cubre los dos rieles.
 *  - "Acceso libre"= está en `unlimited_users` (cuentas comp de Paolo / admin).
 *
 * Se consulta por fetch directo a PostgREST con la service key (no supabase-js)
 * para que sea liviano y corra en el runtime del proxy. service_role bypassa RLS.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Devuelve `true`/`false` si la consulta corrió, o `null` si no se pudo resolver
 * (falta config o error de red). El caller distingue "no pagó" de "no sé".
 */
async function rowsExist(query: string): Promise<boolean | null> {
  if (!SUPABASE_URL || !SERVICE_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      // El acceso es por-usuario: el proxy no debe cachear esta respuesta.
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown[];
    return Array.isArray(data) && data.length > 0;
  } catch {
    return null;
  }
}

export async function userHasPaidAccess(userId: string): Promise<boolean> {
  const id = encodeURIComponent(userId);
  const [paid, unlimited] = await Promise.all([
    rowsExist(`credit_ledger?user_id=eq.${id}&reason=eq.purchase&select=id&limit=1`),
    rowsExist(`unlimited_users?user_id=eq.${id}&select=user_id&limit=1`),
  ]);

  // Señal positiva de cualquiera de las dos → tiene acceso.
  if (paid === true || unlimited === true) return true;

  // Si alguna consulta falló (null = error de infra), NO bloqueamos: fail-open
  // para no dejar afuera a un cliente que pagó por un hipo transitorio de
  // Supabase. En una caída total la app igual no genera (también necesita la DB).
  if (paid === null || unlimited === null) return true;

  // Ambas consultas OK y sin filas → no pagó.
  return false;
}
