"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, Check } from "lucide-react";
import { z } from "zod";
import { PillButton } from "@/components/dashboard/pill-button";
import {
  INDUSTRIES,
  OTHER_INDUSTRY,
  descriptionPlaceholderFor,
} from "@/lib/industries";
import { cn } from "@/lib/utils";

/**
 * Wizard de 3 pasos PRE-PAGO. Termina SIEMPRE en el paywall (`/plan`).
 *
 * Contrato de datos (no lo cambies sin mirar lib/negocio/store.tsx): las 3
 * respuestas se escriben en localStorage bajo `vendi:negocio` con la forma
 * EXACTA {brandName, industry, description}. Es la misma clave y la misma forma
 * que ya lee el NegocioProvider dentro de (app), y esos 3 campos viajan al
 * Director (Gemini) y personalizan las imagenes -> la respuesta tiene un uso
 * real en el producto, no es telemetria.
 *
 * LANDMINE: NO se usa el hook `useNegocio()` aca. El NegocioProvider se monta
 * dentro de AppProviders, que vive en `app/(app)/layout.tsx` -> NO esta montado
 * en /onboarding y llamar al hook LANZA una excepcion. Se escribe localStorage
 * a mano, con la misma clave y la misma forma.
 *
 * FAIL-OPEN a proposito (lo OPUESTO al paywall, que es fail-closed): si el write
 * falla (modo privado, storage lleno, cuota), el usuario AVANZA IGUAL al
 * paywall. Ninguna preferencia cosmetica puede impedir que alguien llegue a la
 * pantalla donde paga.
 *
 * NO es salteable: no hay link de "saltar". En un onboarding de 3 pasos pre-pago
 * cada respuesta es un micro-compromiso; el escape es por CONTENIDO (la opcion
 * "Otro" con texto libre), no por salteo.
 *
 * Esta pantalla NO llama a ninguna API de accion (/api/generations, regenerate,
 * analyze): devuelven 403 al no-pagador a proposito. Tampoco escribe ninguna
 * flag de acceso: las unicas senales validas son credit_ledger.reason='purchase'
 * y unlimited_users, ambas server-side.
 */

/** Clave del store de negocio. Compartida con lib/negocio/store.tsx — no cambiar. */
const NEGOCIO_KEY = "vendi:negocio";
/** Borrador del wizard: sobrevive un F5 accidental, muere al cerrar la pestana. */
const DRAFT_KEY = "vendi-onboarding-v1";

const TOTAL_STEPS = 3;

/** Easing y duraciones de Davinci. Solo transform + opacity, nada de layout. */
const EASE = [0.16, 1, 0.3, 1] as const;
const ENTER_S = 0.22;
const EXIT_S = 0.16;
const SHIFT_PX = 16;

/**
 * Validacion de los 3 campos antes de persistir. `description` pide MINIMO 3
 * caracteres y nada mas: trabar este campo con reglas mata la conversion.
 */
const negocioSchema = z.object({
  brandName: z.string().trim().min(1),
  industry: z.string().trim().min(1),
  description: z.string().trim().min(3),
});

type Draft = {
  step: number;
  brandName: string;
  industry: string;
  otherIndustry: string;
  description: string;
};

const EMPTY_DRAFT: Draft = {
  step: 1,
  brandName: "",
  industry: "",
  otherIndustry: "",
  description: "",
};

export function OnboardingClient() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [brandName, setBrandName] = useState("");
  const [industry, setIndustry] = useState("");
  const [otherIndustry, setOtherIndustry] = useState("");
  const [description, setDescription] = useState("");
  const [leaving, setLeaving] = useState(false);

  /** Timer del auto-avance del paso 2. Se limpia al desmontar. */
  const advanceTimer = useRef<number | null>(null);

  // Restauracion del borrador (post-mount: sessionStorage no existe en SSR).
  // El primer render es SIEMPRE el paso 1, igual que en el server -> sin
  // mismatch de hidratacion. Si habia borrador, salta al paso guardado en el
  // frame siguiente y AnimatePresence no lo anima (initial={false}).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const saved = { ...EMPTY_DRAFT, ...(JSON.parse(raw) as Partial<Draft>) };
      const restoredStep =
        Number.isInteger(saved.step) && saved.step >= 1 && saved.step <= TOTAL_STEPS
          ? saved.step
          : 1;
      /* eslint-disable react-hooks/set-state-in-effect -- restauracion desde sessionStorage post-mount; el SSR no tiene acceso. */
      setStep(restoredStep);
      setBrandName(saved.brandName);
      setIndustry(saved.industry);
      setOtherIndustry(saved.otherIndustry);
      setDescription(saved.description);
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      // Storage bloqueado o JSON corrupto: arrancamos limpio. Nunca bloquea.
    }
  }, []);

  // Persistencia del borrador. Todo try/catch: si falla, el wizard sigue igual.
  useEffect(() => {
    try {
      sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ step, brandName, industry, otherIndustry, description }),
      );
    } catch {
      // Modo privado / cuota llena: seguimos, es solo comodidad.
    }
  }, [step, brandName, industry, otherIndustry, description]);

  useEffect(() => {
    return () => {
      if (advanceTimer.current !== null) {
        window.clearTimeout(advanceTimer.current);
      }
    };
  }, []);

  /**
   * Cambia de paso y fija la direccion de la animacion (adelante / atras).
   * Se declara plano (sin useCallback): el updater de setState tiene que ser
   * PURO — meterle un setDirection adentro lo ejecutaria dos veces en
   * StrictMode. Todos los llamadores conocen `step` del render vigente.
   */
  function goTo(next: number) {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  }

  /** Rubro efectivo: si eligio "Otro", manda el texto libre que escribio. */
  const resolvedIndustry =
    industry === OTHER_INDUSTRY ? otherIndustry.trim() : industry;

  /**
   * Cierre del wizard. Escribe las 3 respuestas y va al PAYWALL.
   * El write es best-effort: pase lo que pase, el usuario llega a /plan.
   */
  function finish() {
    setLeaving(true);
    const parsed = negocioSchema.safeParse({
      brandName: brandName.trim(),
      industry: resolvedIndustry,
      description: description.trim(),
    });
    if (parsed.success) {
      try {
        // Forma EXACTA {brandName, industry, description}, sin campos extra:
        // esta clave la lee el store de la app, no se contamina.
        localStorage.setItem(NEGOCIO_KEY, JSON.stringify(parsed.data));
      } catch {
        // FAIL-OPEN: no poder guardar la preferencia NO frena el pago.
      }
    }
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      // idem: irrelevante para el embudo.
    }
    router.push("/plan");
  }

  function selectIndustry(value: string) {
    setIndustry(value);
    if (value === OTHER_INDUSTRY) return; // "Otro" pide confirmacion explicita.
    // Auto-avance de un solo toque: un beat corto para que se vea el check.
    if (advanceTimer.current !== null) window.clearTimeout(advanceTimer.current);
    advanceTimer.current = window.setTimeout(
      () => goTo(3),
      reduceMotion ? 0 : 170,
    );
  }

  const canContinueStep1 = brandName.trim().length > 0;
  const canContinueStep2 =
    industry !== "" &&
    (industry !== OTHER_INDUSTRY || otherIndustry.trim().length > 0);
  const canFinishStep3 = description.trim().length >= 3;

  // Solo los pasos 1 y 3 tienen CTA al pie. El paso 2 avanza de un toque, salvo
  // "Otro", que necesita confirmar el texto libre.
  const footerCta =
    step === 1
      ? { label: "Siguiente", enabled: canContinueStep1, onClick: () => goTo(2) }
      : step === 2 && industry === OTHER_INDUSTRY
        ? { label: "Siguiente", enabled: canContinueStep2, onClick: () => goTo(3) }
        : step === 3
          ? { label: "Listo", enabled: canFinishStep3 && !leaving, onClick: finish }
          : null;

  // La duracion asimetrica (entra 220ms / sale 160ms) va DENTRO de cada variant:
  // motion no acepta una sub-clave `exit` en el `transition` del componente.
  const stepVariants = reduceMotion
    ? {
        enter: { opacity: 1, x: 0 },
        center: { opacity: 1, x: 0, transition: { duration: 0 } },
        exit: { opacity: 1, x: 0, transition: { duration: 0 } },
      }
    : {
        enter: (dir: 1 | -1) => ({ opacity: 0, x: dir * SHIFT_PX }),
        center: {
          opacity: 1,
          x: 0,
          transition: { duration: ENTER_S, ease: EASE },
        },
        exit: (dir: 1 | -1) => ({
          opacity: 0,
          x: dir * -SHIFT_PX,
          transition: { duration: EXIT_S, ease: EASE },
        }),
      };

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      {/*
        Header. "Atras" vive ACA (44x44), nunca al lado del CTA: el pie en mobile
        es del pulgar y tiene UNA sola accion.
      */}
      <header className="flex items-center gap-1 px-4 pt-4 sm:px-6 sm:pt-6">
        {step > 1 ? (
          <button
            type="button"
            onClick={() => goTo(step - 1)}
            aria-label="Volver al paso anterior"
            className="-ml-2 inline-flex size-11 items-center justify-center rounded-full text-ink transition-colors duration-150 ease-out hover:bg-ink/10 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
        ) : (
          <span className="size-11" aria-hidden="true" />
        )}
        <span className="display-serif-italic text-lg text-ink">Vendí</span>
      </header>

      <div className="mx-auto flex w-full max-w-[560px] flex-1 flex-col px-5 pb-6 sm:px-6">
        {/*
          Progreso: barra segmentada. El fill se anima con scaleX (transform puro,
          GPU). Track ink/14, fill sage-strong.
        */}
        <div
          className="mt-6 flex gap-1.5"
          role="progressbar"
          aria-valuenow={step}
          aria-valuemin={1}
          aria-valuemax={TOTAL_STEPS}
          aria-label={`Paso ${step} de ${TOTAL_STEPS}`}
        >
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-ink/14">
              <motion.div
                className="h-full w-full origin-left rounded-full bg-sage-strong"
                initial={false}
                animate={{ scaleX: i < step ? 1 : 0 }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.3, ease: EASE }}
              />
            </div>
          ))}
        </div>

        {/* Solo el <main> se anima. Header, progreso y CTA quedan quietos. */}
        <main className="flex-1 pt-8">
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
            >
              {step === 1 ? (
                <StepBrandName value={brandName} onChange={setBrandName} />
              ) : null}
              {step === 2 ? (
                <StepIndustry
                  selected={industry}
                  onSelect={selectIndustry}
                  otherValue={otherIndustry}
                  onOtherChange={setOtherIndustry}
                />
              ) : null}
              {step === 3 ? (
                <StepDescription
                  value={description}
                  onChange={setDescription}
                  placeholder={descriptionPlaceholderFor(resolvedIndustry || industry)}
                />
              ) : null}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Pie: UNA sola accion + el micro-copy de progreso. */}
        <footer className="pt-8">
          {footerCta ? (
            <PillButton
              size="lg"
              className="w-full"
              disabled={!footerCta.enabled}
              onClick={footerCta.onClick}
            >
              {footerCta.label}
            </PillButton>
          ) : null}
          <p className="eyebrow eyebrow-on-bg mt-4 text-center">
            Paso {step} de {TOTAL_STEPS} · toma 30 segundos
          </p>
        </footer>
      </div>
    </div>
  );
}

/* ─────────────────────────────── Pasos ─────────────────────────────── */

/**
 * Estilo compartido de los inputs. Sin CSS custom: tokens Cuaderno + focus ring
 * visible. min-h 52px para que el target tactil pase los 44px con aire.
 */
const inputClasses =
  "w-full min-h-[52px] rounded-2xl border border-ink/12 bg-card-cream/75 px-4 py-3 text-base text-ink placeholder:text-mute outline-none transition-colors duration-150 ease-out focus-visible:border-sage-strong focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent";

/**
 * Sin `font-display`, `italic` ni `tracking-*` a mano: el @layer base de
 * globals.css ya se los aplica a h1/h2/h3.
 */
function StepHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <>
      <h1 className="text-[28px] leading-tight text-ink sm:text-[32px]">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-mute-on-bg">{subtitle}</p>
    </>
  );
}

function StepBrandName({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <StepHeading
        title="¿Cómo se llama tu negocio?"
        subtitle="Lo usamos para que tus fotos tengan tu identidad. Lo podés cambiar cuando quieras."
      />
      <div className="mt-6">
        <label htmlFor="brandName" className="sr-only">
          Nombre de tu negocio
        </label>
        <input
          id="brandName"
          type="text"
          autoComplete="organization"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Dulce Ana, Boutique Lima, Ferretería El Sol"
          maxLength={80}
          className={inputClasses}
        />
      </div>
    </div>
  );
}

function StepIndustry({
  selected,
  onSelect,
  otherValue,
  onOtherChange,
}: {
  selected: string;
  onSelect: (v: string) => void;
  otherValue: string;
  onOtherChange: (v: string) => void;
}) {
  return (
    <div>
      <StepHeading
        title="¿Qué tipo de negocio tenés?"
        subtitle="Tocá el que más se parezca. Con esto Vendí ya sabe qué escenas y qué colores te quedan bien."
      />

      <div
        role="radiogroup"
        aria-label="Tipo de negocio"
        className="mt-6 grid grid-cols-2 gap-2.5"
      >
        {INDUSTRIES.map((label) => {
          const isSelected = selected === label;
          return (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={isSelected}
              // ⚠️ El valor tiene que ser el STRING "true": Tailwind v4 compila
              // la variante `data-selected:` a `:where([data-selected=true])`,
              // asi que un `data-selected=""` NO matchea y el estado
              // seleccionado quedaria sin pintar.
              data-selected={isSelected ? "true" : undefined}
              onClick={() => onSelect(label)}
              className={cn(
                // Reposo: cream solido al 75%, CERO blur (presupuesto de blur del
                // onboarding = 0 capas).
                "flex min-h-[64px] items-center justify-between gap-2 rounded-2xl border px-3.5 py-3 text-left text-[13px] font-medium leading-snug",
                "transition-colors duration-150 ease-out active:translate-y-px",
                // Sin hover:scale-*: en Android el hover queda pegado tras el tap.
                // El feedback tactil es active:translate-y-px.
                "border-ink/10 bg-card-cream/75 text-ink hover:border-ink/20 hover:bg-card-cream/90",
                // Foco de teclado con ring-offset, para distinguirlo de la seleccion.
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
                // Seleccionada: borde sage + tinte. No mueve nada de layout.
                "data-selected:border-sage-strong data-selected:bg-sage/15",
              )}
            >
              <span>{label}</span>
              {isSelected ? (
                <Check size={16} aria-hidden="true" className="shrink-0 text-sage-strong" />
              ) : null}
            </button>
          );
        })}
      </div>

      {selected === OTHER_INDUSTRY ? (
        <div className="mt-6">
          <label htmlFor="otherIndustry" className="block text-sm font-semibold text-ink">
            Contanos en dos palabras
          </label>
          <input
            id="otherIndustry"
            type="text"
            value={otherValue}
            onChange={(e) => onOtherChange(e.target.value)}
            placeholder="velas artesanales"
            maxLength={60}
            className={cn(inputClasses, "mt-2")}
          />
        </div>
      ) : null}
    </div>
  );
}

function StepDescription({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Ejemplo concreto del rubro elegido en el paso 2: hace que el campo se conteste solo. */
  placeholder: string;
}) {
  return (
    <div>
      <StepHeading
        title="¿Qué vendés exactamente?"
        subtitle="Cuanto más preciso, mejores te salen las fotos. Con una línea alcanza."
      />
      <div className="mt-6">
        <label htmlFor="description" className="sr-only">
          Qué vendés
        </label>
        <textarea
          id="description"
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={300}
          className={cn(inputClasses, "resize-none leading-relaxed")}
        />
      </div>
    </div>
  );
}
