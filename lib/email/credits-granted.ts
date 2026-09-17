import "server-only";
import { getAppUrl, getMailFrom, getTransporter } from "./transport";

/**
 * EL MAIL DE "TUS CRÉDITOS YA ESTÁN" — el único correo que Vendí le manda al
 * comprador cuando el pago se acredita.
 *
 * Por qué existe: la pantalla de pago (`app/pagar/[productId]/pagar-client.tsx`)
 * YA le promete al comprador "te mandamos el recibo y el aviso de que tus
 * créditos ya entraron". El recibo automático de Whop dice "Whop" y no menciona
 * a Vendí, así que este es el único correo con nuestra cara.
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
 * ─────────────────────────────────────────────────────────────────────────────
 * DISEÑO "NUBE BAJA" (aprobado por Paolo, opción C del mockup)
 *
 * Es la ARQUITECTURA del correo post-pago de 100ads en la paleta de Vendí:
 * barra de marca → tarjeta HERO (radio 28px, la "nube baja" = radial dorado
 * arriba a la derecha + radial verde abajo a la izquierda sobre #16241a) →
 * tarjeta de ACCIÓN aparte con el botón pill dorado → etiqueta de sección →
 * 3 tarjetas de paso con el número en círculo → ayuda → pie con filete.
 *
 * 🔴 REGLA DE OUTLOOK (la que rompe todo si se olvida): Outlook usa el motor de
 * Word e IGNORA `border-radius` Y los degradados. Por eso **todo bloque con
 * degradado lleva PRIMERO un color sólido de base**: atributo `bgcolor` en la
 * tabla Y `background-color` en el style, y recién después el `background-image`.
 * Que en Outlook se vea sin esquinas redondeadas es aceptable; que se vea sin
 * fondo (texto claro sobre blanco = ilegible) no lo es. Idem el botón: sólido
 * `#c9a640` debajo del degradado, así nunca queda un botón invisible.
 *
 * Los sólidos de base de las tarjetas semitransparentes están PRE-COMPUESTOS
 * contra el canvas #070707 (ver ACTION_BG / STEP_BG), así el cliente que no
 * soporta rgba ve exactamente el mismo color que el que sí.
 *
 * Todo lo demás: tablas anidadas con role="presentation", estilos inline, 600px
 * de ancho máximo, cero imágenes externas. Las fuentes de marca (Fraunces +
 * Hanken Grotesk) se piden por <link> a Google Fonts: el cliente que las bloquea
 * (Gmail, casi siempre) cae a Georgia y Arial, que están en la stack de cada
 * declaración. Nunca hay una fuente sin fallback real.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Datos del mail. Todos salen del catálogo server-side, nunca del payload. */
export type CreditsGrantedEmailInput = {
  /** Email del comprador (sale de Clerk, el payload de Whop no trae email). */
  to: string;
  /** Nombre del producto comprado, ej. "Pase Fundador" o "Pack Pro". */
  productName: string;
  /** Créditos de GENERACIÓN acreditados por esta compra. */
  credits: number;
  /** Precio pagado en USD. Es lo que vuelve al mail un recibo de verdad. */
  priceUsd: number;
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

// ─────────────────────────────────────────────────────────────────────────────
// Paleta y tipografías (del index.html vivo de la landing)
// ─────────────────────────────────────────────────────────────────────────────

const BG = "#070707"; // canvas
const CARD = "#16241a"; // base sólida del hero
const CREAM = "#f0f4e7";
const GOLD = "#c9a640";
const GOLD_HI = "#e0c161";
const GOLD_DEEP = "#a8842c";
const GOLD_FG = "#0c1610";
const SAGE_STRONG = "#aecb9f";

/** rgba(22,36,26,.85) pre-compuesto sobre #070707. Base sólida de la acción. */
const ACTION_BG = "#142017";
/** rgba(22,36,26,.70) pre-compuesto sobre #070707. Base sólida de los pasos. */
const STEP_BG = "#121b14";
/** Sólido de base del círculo del número (degradado #e0c161 → #7d5f18). */
const STEP_NUM_BG = "#a8842c";

const SERIF = "'Fraunces',Georgia,'Times New Roman',serif";
const SANS = "'Hanken Grotesk',Arial,Helvetica,sans-serif";

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

  const content = buildContent(input);

  try {
    await transporter.sendMail({
      from,
      to,
      subject: content.subject,
      text: buildText(content),
      html: buildHtml(content),
    });
    return "sent";
  } catch (err) {
    // Se loguea y se sigue. El mail es un extra, la acreditación ya pasó.
    console.error("[email] Falló el envío del mail de créditos:", err);
    return "failed";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Copy — dos variantes según qué compró
// ─────────────────────────────────────────────────────────────────────────────

/** Todo el texto ya resuelto, listo para volcar en HTML o en plano. */
type Content = {
  subject: string;
  /** Pastilla de estado de la barra de marca. */
  badge: string;
  eyebrow: string;
  /** Título, partido para poder poner la palabra acento en itálica dorada. */
  headlineBefore: string;
  headlineAccent: string;
  headlineAfter: string;
  /** Bajada del hero. */
  lead: string;
  /** Monto pagado, ya formateado (ej. "US$10 USD"). */
  amount: string;
  /** Lo que va después del monto en la línea del cargo. */
  chargeTail: string;
  ctaUrl: string;
  creditsUrl: string;
};

/** "US$10 USD" / "US$9.50 USD". */
function formatUsd(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const amount = Number.isInteger(safe) ? String(safe) : safe.toFixed(2);
  return `US$${amount} USD`;
}

/** "30 créditos de fotos" / "1 crédito de fotos". */
function creditsLabel(n: number): string {
  return n === 1 ? "1 crédito de fotos" : `${n} créditos de fotos`;
}

/** "10 análisis con IA" / "1 análisis con IA". */
function analysisLabel(n: number): string {
  return n === 1 ? "1 análisis con IA" : `${n} análisis con IA`;
}

function buildContent(input: CreditsGrantedEmailInput): Content {
  const analysisCredits = input.analysisCredits ?? 0;
  const appUrl = getAppUrl();
  const common = {
    amount: formatUsd(input.priceUsd),
    // 🔴 EL BOTÓN VA AL PASO 1, NO A LA FÁBRICA.
    // El propio correo dice "primeros pasos: 1. Configurá tu negocio", y eso se
    // hace en /mi-negocio. Apuntar a /fabrica contradecía al correo: lo tiraba
    // directo a generar, salteando el paso que le acabábamos de pedir — y
    // generar sin el negocio cargado da fotos genéricas, que es justo la mala
    // primera impresión que no queremos en el minuto uno del que recién pagó.
    ctaUrl: `${appUrl}/mi-negocio`,
    creditsUrl: `${appUrl}/ajustes`,
  };

  if (input.isLifetime) {
    // Pase Fundador. "Fundador" solo se dice acá: en un pack sería mentira.
    const tiene =
      analysisCredits > 0
        ? `Tenés ${creditsLabel(input.credits)} y ${analysisLabel(analysisCredits)}`
        : `Tenés ${creditsLabel(input.credits)}`;
    return {
      ...common,
      subject: "Gracias por ser Fundador — tu Lifetime Access está activo",
      badge: "Lifetime activo",
      eyebrow: "Tu acceso",
      headlineBefore: "Gracias por ser uno de los ",
      headlineAccent: "fundadores",
      headlineAfter: ".",
      lead: `Entraste cuando esto todavía era una promesa. ${tiene} — y no vencen nunca.`,
      chargeTail: "Lifetime Access · pago único",
    };
  }

  // Packs de recarga: NADA de "fundador".
  const sumamos =
    analysisCredits > 0
      ? `${creditsLabel(input.credits)} y ${analysisLabel(analysisCredits)}`
      : creditsLabel(input.credits);
  return {
    ...common,
    subject: "Tus créditos ya están en Vendí",
    badge: "Créditos acreditados",
    eyebrow: "Tu recarga",
    headlineBefore: "Tus ",
    headlineAccent: "créditos",
    headlineAfter: " ya están.",
    lead: `Tu pago entró y te sumamos ${sumamos} — y no vencen nunca.`,
    chargeTail: `${input.productName} · pago único`,
  };
}

/** Los 3 primeros pasos. Mismos en las dos variantes. */
const STEPS: { title: string; body: string }[] = [
  {
    title: "Configurá tu negocio",
    body: "Qué vendés, a quién y con qué tono. Es lo que hace que las fotos salgan tuyas.",
  },
  {
    title: "Cargá tus productos y referencias",
    body: "Fotos de celular sirven. Las referencias le enseñan la escena que querés.",
  },
  {
    title: "Empezá a generar",
    body: "Elegí estilo y formato. En un minuto tenés la tanda lista para publicar.",
  },
];

const ACTION_TITLE = "Cómo entrar · 1 paso";
// ⚠️ Este texto NO se copia de 100ads. Ellos dicen "creá tu cuenta con el MISMO
// email o no vas a ver tu acceso": en Vendí eso sería FALSO y dañino — el
// comprador paga YA logueado, su cuenta existe y los créditos caen por id de
// Clerk, no por email.
const ACTION_BODY_BEFORE = "Tocá el botón y entrá con ";
const ACTION_BODY_BOLD = "el mismo correo al que te llegó esto";
const ACTION_BODY_AFTER =
  ". Tu cuenta ya existe y los créditos ya están adentro — no tenés que registrarte de nuevo.";
const CTA_LABEL = "Entrar a Vendí";
const SECTION_LABEL = "Una vez adentro · primeros pasos (10 min)";
const HELP_BOLD = "¿No podés entrar?";
const HELP_REST = " Respondé este correo y lo resolvemos.";

// ─────────────────────────────────────────────────────────────────────────────
// Texto plano
// ─────────────────────────────────────────────────────────────────────────────

/** Versión texto plano. Es la que ven los lectores que bloquean HTML. */
function buildText(c: Content): string {
  const lines = [
    `VENDÍ — ${c.badge}`,
    "",
    c.eyebrow.toUpperCase(),
    "",
    `${c.headlineBefore}${c.headlineAccent}${c.headlineAfter}`,
    "",
    c.lead,
    "",
    `Pagaste: ${c.amount} · ${c.chargeTail}`,
    "",
    `--- ${ACTION_TITLE.toUpperCase()} ---`,
    "",
    `${ACTION_BODY_BEFORE}${ACTION_BODY_BOLD}${ACTION_BODY_AFTER}`,
    "",
    `${CTA_LABEL}: ${c.ctaUrl}`,
    "",
    `--- ${SECTION_LABEL.toUpperCase()} ---`,
    "",
  ];

  STEPS.forEach((step, i) => {
    lines.push(`${i + 1}. ${step.title}`, `   ${step.body}`);
  });

  lines.push(
    "",
    `${HELP_BOLD}${HELP_REST}`,
    "",
    "Gracias desde Vendí.",
    `Ver mis créditos: ${c.creditsUrl}`,
  );

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML
// ─────────────────────────────────────────────────────────────────────────────

/** Escapa texto para meterlo en HTML sin romper nada. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Una tarjeta de paso (número en círculo + título + bajada). */
function stepRow(index: number, title: string, body: string): string {
  return `
              <tr>
                <td style="padding: 0 0 10px 0;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${STEP_BG}" style="width: 100%; background-color: rgba(22,36,26,.7); border: 1px solid rgba(240,244,231,.12); border-radius: 20px;">
                    <tr>
                      <td valign="middle" width="34" style="padding: 14px 0 14px 16px;">
                        <!-- Círculo del número: sólido primero, degradado después (Outlook ve el sólido). -->
                        <table role="presentation" width="34" cellpadding="0" cellspacing="0" border="0" bgcolor="${STEP_NUM_BG}" style="width: 34px; background-color: ${STEP_NUM_BG}; background-image: linear-gradient(135deg, ${GOLD_HI}, #7d5f18); border-radius: 999px;">
                          <tr>
                            <td align="center" valign="middle" height="34" style="height: 34px; font-family: ${SANS}; font-size: 14px; font-weight: bold; color: ${GOLD_FG};">
                              ${index}
                            </td>
                          </tr>
                        </table>
                      </td>
                      <td valign="middle" style="padding: 14px 16px; font-family: ${SANS};">
                        <span style="display: block; color: ${CREAM}; font-weight: 600; font-size: 15px; line-height: 1.4; padding-bottom: 2px;">${escapeHtml(title)}</span>
                        <span style="display: block; color: rgba(240,244,231,.52); font-size: 13.5px; line-height: 1.5;">${escapeHtml(body)}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>`;
}

/**
 * Versión HTML "Nube baja". Tablas, inline styles, 600px, sin imágenes.
 * Cada bloque con degradado lleva su sólido de base (ver REGLA DE OUTLOOK).
 */
function buildHtml(c: Content): string {
  const ctaUrl = escapeHtml(c.ctaUrl);
  const creditsUrl = escapeHtml(c.creditsUrl);

  const steps = STEPS.map((s, i) => stepRow(i + 1, s.title, s.body)).join("");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>${escapeHtml(c.subject)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=Hanken+Grotesk:wght@400;500;600;700&display=swap">
</head>
<body bgcolor="${BG}" style="margin: 0; padding: 0; background-color: ${BG};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BG}" style="background-color: ${BG};">
    <tr>
      <td align="center" style="padding: 40px 14px 70px 14px;">

        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 600px;">

          <!-- ── BARRA DE MARCA ── -->
          <tr>
            <td style="padding: 0 6px 22px 6px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" style="font-family: ${SERIF}; font-size: 23px; font-weight: normal; letter-spacing: -0.02em; color: ${CREAM};">
                    Vend<span style="font-style: italic; color: ${GOLD};">í</span>
                  </td>
                  <td align="right" style="font-family: ${SANS}; font-size: 12px; font-weight: 600; color: ${SAGE_STRONG};">
                    <span style="color: ${SAGE_STRONG};">&#9679;</span>&nbsp;${escapeHtml(c.badge)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── HERO · "nube baja" ──
               Sólido #16241a primero (bgcolor + background-color) y los dos
               radiales encima. Outlook ve verde plano: legible, sin esquinas. -->
          <tr>
            <td style="padding: 0 0 16px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${CARD}" style="width: 100%; background-color: ${CARD}; background-image: radial-gradient(ellipse 65% 90% at 92% 4%, rgba(201,166,64,.30) 0%, rgba(22,36,26,0) 60%), radial-gradient(ellipse 100% 90% at 20% 100%, rgba(143,168,132,.26) 0%, rgba(22,36,26,0) 62%); border: 1px solid rgba(201,166,64,.24); border-radius: 28px;">
                <tr>
                  <td style="padding: 30px 26px;">

                    <p style="margin: 0 0 14px 0; font-family: ${SANS}; font-size: 12px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(240,244,231,.34);">
                      ${escapeHtml(c.eyebrow)}
                    </p>

                    <h1 style="margin: 0; font-family: ${SERIF}; font-weight: normal; font-size: 34px; line-height: 1.12; letter-spacing: -0.02em; color: ${CREAM};">
                      ${escapeHtml(c.headlineBefore)}<span style="font-style: italic; color: ${GOLD};">${escapeHtml(c.headlineAccent)}</span>${escapeHtml(c.headlineAfter)}
                    </h1>

                    <p style="margin: 14px 0 0 0; font-family: ${SANS}; font-size: 15.5px; line-height: 1.6; color: rgba(240,244,231,.72);">
                      ${escapeHtml(c.lead)}
                    </p>

                    <p style="margin: 16px 0 0 0; font-family: ${SANS}; font-size: 12.5px; line-height: 1.6; color: rgba(240,244,231,.34);">
                      Pagaste: <strong style="color: rgba(240,244,231,.72); font-weight: 600;">${escapeHtml(c.amount)}</strong> &middot; ${escapeHtml(c.chargeTail)}
                    </p>

                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── ACCIÓN ── -->
          <tr>
            <td style="padding: 0 0 16px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${ACTION_BG}" style="width: 100%; background-color: rgba(22,36,26,.85); border: 1px solid rgba(201,166,64,.30); border-radius: 24px;">
                <tr>
                  <td style="padding: 26px;">

                    <h2 style="margin: 0 0 8px 0; font-family: ${SANS}; font-size: 16px; font-weight: bold; line-height: 1.4; color: ${CREAM};">
                      ${escapeHtml(ACTION_TITLE)}
                    </h2>

                    <p style="margin: 0 0 20px 0; font-family: ${SANS}; font-size: 14px; line-height: 1.6; color: rgba(240,244,231,.72);">
                      ${escapeHtml(ACTION_BODY_BEFORE)}<strong style="color: ${CREAM}; font-weight: 600;">${escapeHtml(ACTION_BODY_BOLD)}</strong>${escapeHtml(ACTION_BODY_AFTER)}
                    </p>

                    <!-- Botón pill: sólido ${GOLD} primero. Sin esto, en Outlook
                         queda un botón invisible (texto oscuro sin fondo). -->
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" bgcolor="${GOLD}" style="background-color: ${GOLD}; background-image: linear-gradient(135deg, ${GOLD_HI}, ${GOLD_DEEP}); border-radius: 999px; box-shadow: 0 8px 24px -6px rgba(201,166,64,.45);">
                          <a href="${ctaUrl}" style="display: inline-block; padding: 16px 30px; font-family: ${SANS}; font-size: 15px; font-weight: bold; letter-spacing: -0.01em; color: ${GOLD_FG}; text-decoration: none;">
                            ${escapeHtml(CTA_LABEL)}
                          </a>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── ETIQUETA DE SECCIÓN ── -->
          <tr>
            <td style="padding: 4px 2px 12px 2px; font-family: ${SANS}; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(240,244,231,.34);">
              ${escapeHtml(SECTION_LABEL)}
            </td>
          </tr>

          <!-- ── TARJETAS DE PASO ── -->
          <tr>
            <td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${steps}
              </table>
            </td>
          </tr>

          <!-- ── AYUDA ── -->
          <tr>
            <td style="padding: 20px 2px 0 2px; font-family: ${SANS}; font-size: 13px; line-height: 1.7; color: rgba(240,244,231,.72);">
              <strong style="color: ${CREAM}; font-weight: 600;">${escapeHtml(HELP_BOLD)}</strong>${escapeHtml(HELP_REST)}
            </td>
          </tr>

          <!-- ── PIE CON FILETE ── -->
          <tr>
            <td style="padding: 32px 8px 0 8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-top: 1px solid rgba(240,244,231,.12); padding: 22px 0 0 0; font-family: ${SANS}; font-size: 12px; line-height: 1.7; color: rgba(240,244,231,.34);">
                    Gracias desde <span style="font-family: ${SERIF}; color: rgba(240,244,231,.72); font-weight: 600;">Vend<span style="font-style: italic; color: ${GOLD};">í</span></span>.<br>
                    <a href="${creditsUrl}" style="color: rgba(240,244,231,.52);">Ver mis créditos</a> &middot; ¿Dudas? Respondé este correo.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;
}
