import { redirect } from "next/navigation";

/**
 * `/formato` se fusionó con `/estilo` en una sola estación
 * ("¿Cómo querés que se vea?"): inspiración, formato y estilo son una misma
 * decisión estética y pedían dos pantallas para lo mismo.
 *
 * Esta ruta queda como redirect —igual que `/referencias`— para no romper
 * deep-links, historial de navegación ni código que todavía apunte acá.
 *
 * El control de ratio (`RatioSelector`) y el de variaciones (`NumberStepper`),
 * junto con el guardado debounceado del stepper, viven ahora en
 * `app/(app)/estilo/page.tsx`.
 */
export default function FormatoPage() {
  redirect("/estilo");
}
