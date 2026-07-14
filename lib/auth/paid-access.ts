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
 * registrada. Lo consultan el gate de `app/(app)/layout.tsx` (cada hard load de
 * la sección app), `/comprar`, `/fundador` y las 3 APIs de acción
 * (generations / regenerate / analyze) para el candado 403.
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
 *
 * Con el modelo FAIL-CLOSED (ver `userHasPaidAccess`), un `null` deja al usuario
 * AFUERA. Para no rebotar de más a un pagador por un hipo transitorio, acá
 * reintentamos una vez y ponemos un timeout corto (un fetch colgado bloquearía
 * la navegación). El `null` recién sale tras agotar el reintento.
 */
async function rowsExist(query: string): Promise<boolean | null> {
  if (!SUPABASE_URL || !SERVICE_KEY) return null;
  for (let intento = 0; intento < 2; intento++) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
        // El acceso es por-usuario: el proxy no debe cachear esta respuesta.
        cache: "no-store",
        // Timeout defensivo: un fetch colgado trabaría la navegación. Si el
        // runtime no soporta AbortSignal.timeout, el throw cae en el catch y se
        // trata como error de red (→ null → fail-closed).
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as unknown[];
      return Array.isArray(data) && data.length > 0;
    } catch {
      // Reintenta UNA vez ante error de red/timeout. Si el segundo intento
      // también falla, devuelve null → el caller cierra la puerta (fail-closed).
      if (intento === 1) return null;
    }
  }
  return null;
}

export async function userHasPaidAccess(userId: string): Promise<boolean> {
  const id = encodeURIComponent(userId);
  const [paid, unlimited] = await Promise.all([
    rowsExist(`credit_ledger?user_id=eq.${id}&reason=eq.purchase&select=id&limit=1`),
    rowsExist(`unlimited_users?user_id=eq.${id}&select=user_id&limit=1`),
  ]);

  // FAIL-CLOSED (regla dura de Paolo: "el que no paga NO entra"). Damos acceso
  // SOLO si confirmamos POSITIVAMENTE que pagó (compra en `credit_ledger`) o que
  // es cortesía (`unlimited_users`). Todo lo demás es NO:
  //   - `false` en ambas       → no pagó.
  //   - `null` (no se pudo      → NO SABEMOS si pagó ⇒ ante la duda, AFUERA.
  //      confirmar: falta de env,    Antes acá había fail-open (`return true`) y
  //      red caída, timeout)         ESE era el agujero: cualquier hipo del
  //                                  chequeo colaba a un no-pagador. Preferimos
  //                                  rebotar a un pagador ante un error raro
  //                                  (reintenta) antes que dejar entrar gratis.
  return paid === true || unlimited === true;
}
