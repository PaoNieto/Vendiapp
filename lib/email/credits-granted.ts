import "server-only";
import { getAppUrl, getMailFrom, getTransporter } from "./transport";

/**
 * EL MAIL DE "TUS CRÉDITOS YA ESTÁN" — el único correo que Vendí le manda al
 * comprador cuando el pago se acredita.
 *
 * Por qué existe: la pantalla de pago (`app/pagar/[productId]/pagar-client.tsx`)
 * YA le promete al comprador "te mandamos el recibo y el aviso de que tus
 * créditos ya entraron". Hasta ahora el único mail que llegaba era el recibo
 * automático de Whop, que dice "Whop" y no menciona a Vendí.
 *
 * ⚠️ TRES REGLAS DURAS (no negociables):
 *  1. **NUNCA rompe la acreditación.** Esta función NO TIRA NUNCA: devuelve un
 *     estado y loguea. El comprador ya tiene sus créditos; el mail es extra.
 *  2. **UN SOLO MAIL POR COMPRA.** La idempotencia NO vive acá: vive en el
 *     webhook, que solo llama a esta función cuando `process_whop_payment`
 *     devolvió `'granted'` (la primera vez). Si Whop reintenta 12 veces, la RPC
 *     devuelve `'duplicate'` y este mail no se manda de nuevo.
 *  3. **Nada que no sea verdad.** Sin número de orden, sin datos de factura, sin
 *     testimonios, sin plazos de soporte que nadie prometió.
 *
 * Diseño del HTML: tabla simple, ancho máximo 600px, estilos INLINE, cero
 * imágenes externas y cero CSS moderno. Los clientes de correo (Outlook y
 * Gmail sobre todo) rompen flexbox, grid, `<style>` y todo lo que sea lindo.
 * Siempre va acompañado de una versión en texto plano.
 */

/** Datos del mail. Todos salen del catálogo server-side, nunca del payload. */
export type CreditsGrantedEmailInput = {
  /** Email del comprador (sale de Clerk, el payload de Whop no trae email). */
  to: string;
  /** Nombre del producto comprado, ej. "Pase Fundador" o "Pack Pro". */
  productName: string;
  /** Créditos de GENERACIÓN acreditados por esta compra. */
  credits: number;
  /** Créditos de ANÁLISIS acreditados (bolsa aparte; hoy solo el Pase da). */
  analysisCredits?: number;
  /** true si es el Pase Fundador (el ticket de entrada a la app). */
  isLifetime?: boolean;
};

/**
 * Resultado del envío. Sirve para loguear con precisión sin tirar excepciones:
 *  - "sent"    → SMTP lo aceptó.
 *  - "skipped" → correo no configurado (faltan env vars) o destinatario vacío.
 *  - "failed"  → se intentó y falló (ya quedó logueado acá adentro).
 */
export type SendResult = "sent" | "skipped" | "failed";

/** Asunto: directo, sin corporativismo, y dice exactamente qué pasó. */
const SUBJECT = "Tus créditos ya están en Vendí";

/**
 * Manda el mail de créditos acreditados. NUNCA tira: devuelve el estado.
 */
export async function sendCreditsGrantedEmail(
  input: CreditsGrantedEmailInput,
): Promise<SendResult> {
  const to = input.to?.trim();
  if (!to) {
    console.warn("[email] Mail de créditos sin destinatario, no se manda nada.");
    return "skipped";
  }

  const transporter = getTransporter();
  const from = getMailFrom();
  if (!transporter || !from) {
    // Falta SMTP_USER / SMTP_PASSWORD / MAIL_FROM. No es un error fatal: el
    // comprador ya tiene sus créditos, solo no se entera por correo.
    console.warn(
      "[email] Correo sin configurar (faltan SMTP_USER/SMTP_PASSWORD/MAIL_FROM); no se manda el aviso de créditos.",
    );
    return "skipped";
  }

  const analysisCredits = input.analysisCredits ?? 0;
  const fabricaUrl = `${getAppUrl()}/fabrica`;

  try {
    await transporter.sendMail({
      from,
      to,
      subject: SUBJECT,
      text: buildText({ ...input, analysisCredits, fabricaUrl }),
      html: buildHtml({ ...input, analysisCredits, fabricaUrl }),
    });
    return "sent";
  } catch (err) {
    // Se loguea y se sigue. El mail es un extra, la acreditación ya pasó.
    console.error("[email] Falló el envío del mail de créditos:", err);
    return "failed";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Armado del contenido
// ─────────────────────────────────────────────────────────────────────────────

type Content = CreditsGrantedEmailInput & {
  analysisCredits: number;
  fabricaUrl: string;
};

/** "30 créditos de fotos" / "1 crédito de fotos". */
function creditsLabel(n: number): string {
  return n === 1 ? "1 crédito de fotos" : `${n} créditos de fotos`;
}

/** "10 análisis con IA" / "1 análisis con IA". */
function analysisLabel(n: number): string {
  return n === 1 ? "1 análisis con IA" : `${n} análisis con IA`;
}

/** Lo que se acreditó, en una línea. */
function grantedLine(credits: number, analysisCredits: number): string {
  if (analysisCredits > 0) {
    return `${creditsLabel(credits)} y ${analysisLabel(analysisCredits)}`;
  }
  return creditsLabel(credits);
}

/** Versión texto plano. Es la que ven los lectores que bloquean HTML. */
function buildText(c: Content): string {
  const lines = [
    "Listo: tu pago entró y tus créditos ya están en tu cuenta.",
    "",
    `Compraste: ${c.productName}`,
    `Te sumamos: ${grantedLine(c.credits, c.analysisCredits)}`,
    "",
    "1 crédito = 1 foto generada. Los créditos no vencen: los usás cuando quieras.",
    "",
  ];

  if (c.isLifetime) {
    lines.push("Con el Pase Fundador ya tenés la app abierta.", "");
  }

  lines.push(
    "Entrá a la Fábrica y armá tus fotos:",
    c.fabricaUrl,
    "",
    "¿Algo no cuadra? Respondé este correo y lo vemos.",
    "",
    "— Vendí",
  );

  return lines.join("\n");
}

/** Escapa texto para meterlo en HTML sin romper nada. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Versión HTML: tabla, 600px, inline styles, sin imágenes externas.
 * Paleta sobria alineada a la marca (cream / forest / sage).
 */
function buildHtml(c: Content): string {
  const productName = escapeHtml(c.productName);
  const granted = escapeHtml(grantedLine(c.credits, c.analysisCredits));
  const fabricaUrl = escapeHtml(c.fabricaUrl);

  const lifetimeRow = c.isLifetime
    ? `
              <tr>
                <td style="padding: 0 0 18px 0; font-size: 15px; line-height: 24px; color: #4b5a51;">
                  Con el Pase Fundador ya tenés la app abierta.
                </td>
              </tr>`
    : "";

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(SUBJECT)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f1e8;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f5f1e8;">
    <tr>
      <td align="center" style="padding: 32px 16px;">

        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 600px;">

          <!-- Marca -->
          <tr>
            <td style="padding: 0 0 20px 0; font-family: Georgia, 'Times New Roman', serif; font-size: 22px; color: #2e4a3a;">
              Vendí
            </td>
          </tr>

          <!-- Tarjeta -->
          <tr>
            <td style="background-color: #ffffff; border: 1px solid #e3ddcf; border-radius: 12px; padding: 32px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, Helvetica, sans-serif;">

                <tr>
                  <td style="padding: 0 0 16px 0; font-family: Georgia, 'Times New Roman', serif; font-size: 24px; line-height: 32px; color: #1f2a24;">
                    Listo: tus créditos ya entraron
                  </td>
                </tr>

                <tr>
                  <td style="padding: 0 0 22px 0; font-size: 15px; line-height: 24px; color: #4b5a51;">
                    Tu pago entró y los créditos ya están en tu cuenta de Vendí.
                  </td>
                </tr>

                <!-- Detalle -->
                <tr>
                  <td style="padding: 0 0 22px 0;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f7f4ec; border-radius: 10px;">
                      <tr>
                        <td style="padding: 16px 18px; font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 22px; color: #1f2a24;">
                          <strong style="color: #6b7a70; font-weight: normal;">Compraste:</strong> ${productName}<br>
                          <strong style="color: #6b7a70; font-weight: normal;">Te sumamos:</strong> ${granted}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
${lifetimeRow}
                <tr>
                  <td style="padding: 0 0 26px 0; font-size: 15px; line-height: 24px; color: #4b5a51;">
                    1 crédito = 1 foto generada. <strong style="color: #1f2a24;">Los créditos no vencen</strong>: los usás cuando quieras.
                  </td>
                </tr>

                <!-- Botón -->
                <tr>
                  <td style="padding: 0 0 8px 0;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="background-color: #2e4a3a; border-radius: 10px;">
                          <a href="${fabricaUrl}" style="display: inline-block; padding: 14px 28px; font-family: Arial, Helvetica, sans-serif; font-size: 15px; font-weight: bold; color: #f5f1e8; text-decoration: none;">
                            Entrar a la Fábrica
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding: 0 0 0 0; font-size: 13px; line-height: 20px; color: #6b7a70;">
                    O copiá este link: <a href="${fabricaUrl}" style="color: #2e4a3a;">${fabricaUrl}</a>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Pie -->
          <tr>
            <td style="padding: 20px 4px 0 4px; font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 20px; color: #6b7a70;">
              ¿Algo no cuadra? Respondé este correo y lo vemos.<br>
              — Vendí
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;
}
