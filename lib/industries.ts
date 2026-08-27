/**
 * Vocabulario ÚNICO de rubros de Vendí.
 *
 * Lo consumen el onboarding pre-pago (`app/onboarding/onboarding-client.tsx`)
 * y el editor de perfil de marca (`app/(app)/mi-negocio/page.tsx`). Vive acá
 * para que el usuario NO vea dos vocabularios distintos: el rubro que elige en
 * el onboarding tiene que existir tal cual en el select de Mi Negocio, o al
 * editar su negocio vería el campo vacío.
 *
 * El valor que se guarda es el STRING tal cual — viaja directo al prompt de
 * Gemini como `- Rubro: {industry}` (ver lib/negocio/store.tsx → identidad de
 * marca). No hay ids ni enums: si cambiás una etiqueta, cambia el prompt.
 *
 * ⚠️ ORDEN: por frecuencia real del quiz de la landing, NO alfabético. No lo
 * reordenes sin dato nuevo — el orden es la decisión de producto.
 */

export const OTHER_INDUSTRY = "Otro";

export const INDUSTRIES = [
  "Belleza y cosmética",
  "Comida y bebida",
  "Moda y ropa",
  "Joyería y accesorios",
  "Hogar y deco",
  "Cafetería y restaurante",
  "Niños y bebés",
  "Mascotas",
  "Ferretería y herramientas",
  "Deporte y fitness",
  "Tecnología",
  OTHER_INDUSTRY,
] as const;

export type Industry = (typeof INDUSTRIES)[number];

/**
 * Placeholder del campo "¿qué vendés exactamente?" según el rubro elegido.
 *
 * No es cosmético: es lo que hace que el campo se conteste solo. Un ejemplo
 * concreto y creíble del propio rubro le muestra al usuario el NIVEL de detalle
 * que sirve (producto + material + contexto), que es justo lo que mejora la
 * imagen generada.
 */
const DESCRIPTION_PLACEHOLDERS: Record<string, string> = {
  "Belleza y cosmética": "cremas faciales y serums naturales, hechos en Lima",
  "Comida y bebida": "mermeladas artesanales de fruta, en frasco de vidrio",
  "Moda y ropa": "vestidos de verano de algodón, del S al XL",
  "Joyería y accesorios": "aretes y anillos de plata hechos a mano",
  "Hogar y deco": "velas de soya y difusores para el living",
  "Cafetería y restaurante": "café de especialidad y postres para llevar",
  "Niños y bebés": "ropa de algodón para bebés de 0 a 2 años",
  Mascotas: "camas y juguetes para perros medianos",
  "Ferretería y herramientas": "herramientas eléctricas y pinturas para el hogar",
  "Deporte y fitness": "mancuernas y bandas de resistencia",
  Tecnología: "fundas y cargadores para celular",
  [OTHER_INDUSTRY]: "velas artesanales con aroma a lavanda",
};

/** Placeholder para el rubro dado. Cae al genérico si el rubro no está mapeado. */
export function descriptionPlaceholderFor(industry: string): string {
  return (
    DESCRIPTION_PLACEHOLDERS[industry] ??
    DESCRIPTION_PLACEHOLDERS[OTHER_INDUSTRY]
  );
}
