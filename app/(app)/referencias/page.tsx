import { redirect } from "next/navigation";

/**
 * `/referencias` se fusionó con `/estilo` en una sola estación
 * ("¿Cómo querés que se vea?"). Esta ruta queda como redirect para no romper
 * deep-links ni historial de navegación viejos.
 *
 * Los helpers/tipos de estilos curados que vivían acá (`CURATED_STYLES`,
 * `CuratedStyleId`, `parseCuratedRef`, `curatedRefDataUrl`) se movieron a
 * `lib/curated-styles.ts`.
 */
export default function ReferenciasPage() {
  redirect("/estilo");
}
