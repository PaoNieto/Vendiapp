import "server-only";
import { headers } from "next/headers";

/**
 * ¿La página se abrió dentro del navegador de una app (Instagram, Facebook,
 * TikTok…)? Los anuncios de Meta abren la landing y el registro ahí, y Google
 * bloquea su login en esos navegadores (error `disallowed_useragent`): el botón
 * "Continuar con Google" de Clerk le tira error justo a la gente que viene del
 * anuncio. En ese caso login y signup muestran solo el mail.
 *
 * Se mira el user-agent del request en el server, así el botón ni se pinta.
 * Eso vuelve la página dinámica, que en login y signup da igual.
 * `; wv)` es el WebView genérico de Android, donde Google también bloquea.
 */
const IN_APP_UA =
  /Instagram|FBAN|FBAV|FB_IAB|FBIOS|Messenger|musical_ly|Bytedance|TikTok|; wv\)/i;

export async function isInAppBrowser(): Promise<boolean> {
  const ua = (await headers()).get("user-agent") ?? "";
  return IN_APP_UA.test(ua);
}

/** Esconde los botones sociales y el "o" que los separa del formulario de mail. */
export const soloMailAppearance = {
  elements: {
    socialButtonsRoot: { display: "none" },
    dividerRow: { display: "none" },
  },
};
