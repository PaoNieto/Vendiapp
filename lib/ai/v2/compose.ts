/**
 * Composición PURA del pipeline v2: de notas (+ plan crudo opcional) a prompts
 * finales. Sin red, sin base, sin sharp, sin reloj.
 *
 * Vive aparte de generate-v2.ts (que hace I/O) para que un dry-run del A/B pueda
 * importar solo esto: con notas guardadas y un JSON de Director de mentira se
 * obtiene el prompt EXACTO que vería el modelo de imagen, sin gastar un centavo.
 * La orquestación real usa estas mismas funciones: no hay dos caminos que puedan
 * divergir.
 */

import type { OutputRatio } from "@/lib/constants";
import type { BrandContext } from "@/lib/validations/generations";
import { assembleBatch, type AssembledBatch } from "@/lib/ai/v2/assemble";
import { STYLE_LOCK_OVER_REFERENCE } from "@/lib/ai/v2/constants";
import { buildDirectorMessage, type Plan } from "@/lib/ai/v2/director";
import { buildFallbackPlan } from "@/lib/ai/v2/fallback";
import type { ProductBrief } from "@/lib/ai/v2/product-brief";
import type { ReferenceBrief } from "@/lib/ai/v2/reference-brief";
import { clean, LIMITS } from "@/lib/ai/v2/sanitize";
import { lockKindOf, type LockKind, type ResolvedStyle } from "@/lib/ai/v2/style-parts";
import type { CaseKind, PlanSource } from "@/lib/ai/v2/types";
import { validatePlan, type PlanValidation, type PlanValidationContext } from "@/lib/ai/v2/validate-plan";

export type ComposeContext = {
  productBrief: ProductBrief | null;
  /** Fotos de producto disponibles (las que vio la nota, en orden, máx 8). */
  availablePhotoCount: number;
  /** Solo las referencias USABLES, en el orden de la versión (n = índice + 1). */
  usableRefs: ReferenceBrief[];
  /**
   * G2 (v2.2): no hay ninguna referencia con nota, pero la imagen de la primera
   * bajó bien y su nota falló por un error transitorio. La referencia viaja igual
   * (Image P+1) con un rol genérico escrito por el código, y el plan sale del
   * fallback (el Director necesita la nota). Se ignora si hay `usableRefs`.
   */
  genericRef?: boolean;
  style: ResolvedStyle;
  ratio: OutputRatio;
  variations: number;
  /** Crudo; se sanea acá. */
  userPrompt: string;
  productName: string;
  brand?: BrandContext;
};

export type ComposeFrame = {
  caseKind: CaseKind;
  hasRef: boolean;
  hasStyle: boolean;
  effectiveLock: string | null;
  lockKind: LockKind | null;
  /** user_prompt saneado (tope 1000). */
  userPrompt: string;
  /** La referencia viaja sin nota, con rol genérico (G2). */
  genericRef: boolean;
  /** null cuando falta la nota del producto o la referencia no tiene nota: no se llama al Director. */
  directorMessage: string | null;
  validationCtx: PlanValidationContext | null;
};

/** El caso lo decide el CÓDIGO, nunca el modelo. */
export function decideCase(hasRef: boolean, hasStyle: boolean): CaseKind {
  if (hasRef && hasStyle) return "ref_and_style";
  if (hasRef) return "ref_only";
  if (hasStyle) return "style_only";
  return "none";
}

export function frameV2(ctx: ComposeContext): ComposeFrame {
  // G2: una referencia sin nota sigue siendo una referencia (el caso no cae a
  // style_only/none), pero solo cuando no hay ninguna con nota.
  const genericRef = !!ctx.genericRef && ctx.usableRefs.length === 0;
  const hasRef = ctx.usableRefs.length > 0 || genericRef;
  const hasStyle = !!ctx.style.styleId && !!ctx.style.parts;
  const caseKind = decideCase(hasRef, hasStyle);
  const lock = hasStyle ? (ctx.style.parts?.lock ?? null) : null;
  // Con referencia, el lock del estilo gana solo si STYLE_LOCK_OVER_REFERENCE.
  const effectiveLock = lock && (!hasRef || STYLE_LOCK_OVER_REFERENCE) ? lock : null;
  const lockKind = effectiveLock ? lockKindOf(ctx.style.styleId) : null;
  const userPrompt = clean(ctx.userPrompt, LIMITS.userPrompt);

  if (!ctx.productBrief || genericRef) {
    return { caseKind, hasRef, hasStyle, effectiveLock, lockKind, userPrompt, genericRef, directorMessage: null, validationCtx: null };
  }

  const directorMessage = buildDirectorMessage({
    caseKind,
    effectiveLock,
    ratio: ctx.ratio,
    productName: ctx.productName,
    brand: ctx.brand,
    productBrief: ctx.productBrief,
    usableRefs: ctx.usableRefs,
    style: hasStyle && ctx.style.styleId && ctx.style.parts ? { styleId: ctx.style.styleId, parts: ctx.style.parts } : null,
    userPrompt,
  });

  return {
    caseKind,
    hasRef,
    hasStyle,
    effectiveLock,
    lockKind,
    userPrompt,
    genericRef,
    directorMessage,
    validationCtx: {
      productBrief: ctx.productBrief,
      usableRefs: ctx.usableRefs,
      hasStyle,
      lockKind,
      userPrompt,
      productName: clean(ctx.productName, LIMITS.productName),
      brandName: clean(ctx.brand?.name, LIMITS.brandName),
    },
  };
}

export function fallbackPlanFor(ctx: ComposeContext, frame: ComposeFrame): Plan {
  return buildFallbackPlan({
    productBrief: ctx.productBrief,
    primaryRef: ctx.usableRefs[0] ?? null,
    caseKind: frame.caseKind,
    styleParts: frame.hasStyle ? ctx.style.parts : null,
    effectiveLock: frame.effectiveLock,
    lockKind: frame.lockKind,
    userPrompt: frame.userPrompt,
    genericRef: frame.genericRef,
    availablePhotoCount: ctx.availablePhotoCount,
  });
}

export function assembleV2(ctx: ComposeContext, frame: ComposeFrame, plan: Plan, planSource: PlanSource): AssembledBatch {
  return assembleBatch({
    plan,
    planSource,
    caseKind: frame.caseKind,
    productBrief: ctx.productBrief,
    availablePhotoCount: ctx.availablePhotoCount,
    refs: ctx.usableRefs,
    styleParts: frame.hasStyle ? ctx.style.parts : null,
    effectiveLock: frame.effectiveLock,
    lockKind: frame.lockKind,
    ratio: ctx.ratio,
    variations: ctx.variations,
    genericRef: frame.genericRef,
  });
}

/**
 * DRY-RUN sin red. Con `rawDirectorPlan` (el JSON tal cual lo devolvería el
 * Director) lo valida/repara igual que producción; si no pasa, o si no se pasa,
 * usa el fallback determinístico. Devuelve el mensaje que se le mandaría al
 * Director y los N prompts finales.
 */
export function composeV2(
  ctx: ComposeContext,
  rawDirectorPlan?: unknown,
): { frame: ComposeFrame; plan: Plan; planSource: PlanSource; validation: PlanValidation | null; batch: AssembledBatch } {
  const frame = frameV2(ctx);
  let validation: PlanValidation | null = null;
  let plan: Plan;
  let planSource: PlanSource;
  if (frame.validationCtx && rawDirectorPlan !== undefined) {
    validation = validatePlan(rawDirectorPlan, frame.validationCtx);
    if (validation.ok) {
      plan = validation.plan;
      planSource = "director";
    } else {
      plan = fallbackPlanFor(ctx, frame);
      planSource = "fallback";
    }
  } else {
    plan = fallbackPlanFor(ctx, frame);
    planSource = "fallback";
  }
  return { frame, plan, planSource, validation, batch: assembleV2(ctx, frame, plan, planSource) };
}
