/**
 * Formatea una fecha ISO 8601 en una etiqueta relativa en español.
 *
 * Ejemplos: "hace un momento", "hace 5 min", "hace 2 h", "ayer",
 * "hace 3 días", "hace 2 semanas".
 *
 * No usa librerías externas. Si el input no es parseable devuelve "—".
 */
export function formatRelativeTime(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";

  const now = Date.now();
  const diffMs = now - then;

  // Futuro o casi instantáneo
  if (diffMs < 60_000) return "hace un momento";

  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;

  if (diffMs < hour) {
    const mins = Math.floor(diffMs / minute);
    return `hace ${mins} min`;
  }

  if (diffMs < day) {
    const hours = Math.floor(diffMs / hour);
    return `hace ${hours} h`;
  }

  if (diffMs < 2 * day) return "ayer";

  if (diffMs < week) {
    const days = Math.floor(diffMs / day);
    return `hace ${days} días`;
  }

  const weeks = Math.floor(diffMs / week);
  return weeks === 1 ? "hace 1 semana" : `hace ${weeks} semanas`;
}
