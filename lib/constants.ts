export const APP_NAME = "Vendí";
export const APP_TAGLINE = "Tu producto, en cualquier escenario, sin sesión de fotos.";

/** Créditos de GENERACIÓN de regalo al registrarse (1 crédito = 1 imagen). */
export const FREE_PLAN_CREDITS = 60;

/** Créditos de ANÁLISIS con IA de regalo al registrarse — bolsa SEPARADA de
 * los de generación. 1 crédito = 1 análisis. */
export const FREE_ANALYSIS_CREDITS = 10;

export const OUTPUT_RATIOS = [
  { value: "1:1", label: "Cuadrado", description: "Ideal para Instagram, Shopify, Temu" },
  { value: "4:5", label: "Vertical retrato", description: "Ideal para Meta Ads feed" },
  { value: "9:16", label: "Vertical historia", description: "Ideal para Stories, Reels, TikTok" },
  { value: "16:9", label: "Horizontal", description: "Ideal para banners, hero, web" },
] as const;

export type OutputRatio = (typeof OUTPUT_RATIOS)[number]["value"];

export const MAX_PRODUCT_IMAGES = 5;
export const MAX_REFERENCE_IMAGES = 5;
export const DEFAULT_VARIATIONS = 5;
export const MAX_VARIATIONS = 10;

export const PLANS = {
  free: { name: "Free", monthlyCredits: 60, price: 0 },
  pro: { name: "Pro", monthlyCredits: 200, price: 19 },
  business: { name: "Business", monthlyCredits: 1000, price: 79 },
} as const;
