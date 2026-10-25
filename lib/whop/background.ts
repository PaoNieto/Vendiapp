import "server-only";
import { after } from "next/server";

/**
 * Corre `task` DESPUÉS de responder (`after()` de next/server). Es lo que deja
 * al webhook contestarle a Whop en menos de 5 s aunque después haya que avisar,
 * alertar o consultar Clerk/Whop.
 *
 * Nunca tira, ni acá ni adentro de la tarea. Fuera de un request (script), la
 * lanza ya sin esperarla. `after` se puede anidar (docs de Next 16), así que
 * los helpers de lib/avisos que usan su propio after() adentro funcionan igual.
 */
export function inBackground(label: string, task: () => Promise<unknown>): void {
  const safe = async () => {
    try {
      await task();
    } catch (err) {
      console.error(
        `[whop] Falló una tarea en segundo plano (${label}):`,
        err instanceof Error ? err.message : err,
      );
    }
  };
  try {
    after(safe);
  } catch {
    void safe();
  }
}
