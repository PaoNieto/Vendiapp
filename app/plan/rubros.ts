/**
 * Los 33 rubros de la "lluvia" de /plan — la prueba visual del paywall.
 *
 * Es el MISMO set de fotos que la galería de la landing (`/catalogo/*.jpg`), con
 * los mismos nombres en castellano: el que hace click en "Quiero mi Lifetime
 * Pass" y aterriza acá tiene que reconocer que es la misma tienda.
 *
 * `slug` es literalmente el nombre del archivo en `public/catalogo/<slug>.jpg`.
 * Las 33 fotos son fijas y no cambian nunca → se sirven como `<img>` plano
 * (ver el comentario en `plan-client.tsx` sobre por qué NO se usa next/image).
 *
 * El reparto en DOS filas es deliberado, no estético: juntas arriba de la card
 * empujan el precio y el CTA fuera del fold en un iPhone SE (375×667). La fila A
 * va entre el subtítulo y la card (chica y callada, ambiente); la fila B va
 * después de la card, donde ya no le compite a nada.
 */

export type Rubro = {
  /** Nombre del archivo en /public/catalogo, sin extensión. */
  slug: string;
  /** Etiqueta legible en castellano. Va en el tag y en el alt de la foto. */
  label: string;
};

/** Fila A — 17 rubros, se desplaza hacia la IZQUIERDA. Va ARRIBA de la card. */
export const RUBROS_FILA_A: readonly Rubro[] = [
  { slug: "fragancias", label: "Fragancias" },
  { slug: "bolsos", label: "Bolsos" },
  { slug: "cafe-y-te", label: "Café y té" },
  { slug: "maquillaje", label: "Maquillaje" },
  { slug: "relojes", label: "Relojes" },
  { slug: "ropa-de-mujer", label: "Ropa de mujer" },
  { slug: "alimento-mascotas", label: "Alimento mascotas" },
  { slug: "gafas-de-sol", label: "Gafas de sol" },
  { slug: "snacks", label: "Snacks" },
  { slug: "ropa-de-bebe", label: "Ropa de bebé" },
  { slug: "organicos", label: "Orgánicos" },
  { slug: "joyeria", label: "Joyería" },
  { slug: "camas-mascotas", label: "Camas para mascotas" },
  { slug: "skincare", label: "Skincare" },
  { slug: "gorras", label: "Gorras" },
  { slug: "ropa-deportiva", label: "Ropa deportiva" },
  { slug: "juguetes-bebe", label: "Juguetes bebé" },
] as const;

/** Fila B — 16 rubros, se desplaza hacia la DERECHA. Va DEBAJO de la card. */
export const RUBROS_FILA_B: readonly Rubro[] = [
  { slug: "calzado", label: "Calzado" },
  { slug: "bebidas", label: "Bebidas" },
  { slug: "comida-gourmet", label: "Comida gourmet" },
  { slug: "cuidado-del-cabello", label: "Cuidado del cabello" },
  { slug: "mochilas", label: "Mochilas" },
  { slug: "maternidad", label: "Maternidad" },
  { slug: "higiene-mascotas", label: "Higiene mascotas" },
  { slug: "ropa-de-hombre", label: "Ropa de hombre" },
  { slug: "unas", label: "Uñas" },
  { slug: "cajas-de-suscripcion", label: "Cajas de suscripción" },
  { slug: "trajes-de-bano", label: "Trajes de baño" },
  { slug: "ropa-de-ninos", label: "Ropa de niños" },
  { slug: "accesorios-y-juguetes-mascotas", label: "Accesorios mascotas" },
  { slug: "ropa-interior", label: "Ropa interior" },
  { slug: "salud-mascotas", label: "Salud mascotas" },
  { slug: "higiene-bebe", label: "Higiene bebé" },
] as const;
