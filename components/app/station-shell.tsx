import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { PillButton } from "@/components/dashboard";

type StationShellProps = {
  number: string;
  title: string;
  /**
   * Palabra "clave" opcional que se pinta después del título en dorado glossy
   * (`.text-gold-glossy`) para el two-tone estilo "Estilo Visual". Aditivo /
   * no-breaking. El dorado sólo aplica en dark (regla de marca).
   */
  titleAccent?: string;
  description: string;
  children: React.ReactNode;
  prevHref?: string;
  prevLabel?: string;
  nextHref?: string;
  nextLabel?: string;
  /** When true, renders the "next" CTA as a disabled button (no navigation). */
  nextDisabled?: boolean;
  /** Optional hint shown next to the disabled next CTA (e.g. "Falta subir una foto"). */
  nextDisabledHint?: string;
  /**
   * Ensancha el contenedor a `max-w-5xl` (default `max-w-3xl`). Lo usa la
   * estación de estilo fusionada, que necesita 2 columnas (grilla + panel).
   */
  wide?: boolean;
};

export function StationShell({
  number,
  title,
  titleAccent,
  description,
  children,
  prevHref,
  prevLabel,
  nextHref,
  nextLabel,
  nextDisabled = false,
  nextDisabledHint,
  wide = false,
}: StationShellProps) {
  return (
    <div className="px-5 py-6 sm:px-8 sm:py-8">
      <div className={wide ? "mx-auto max-w-5xl" : "mx-auto max-w-3xl"}>
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-sm font-semibold text-primary">
            {number}
          </span>
          <h1 className="text-2xl font-medium tracking-tight text-foreground sm:text-3xl">
            {title}
            {titleAccent ? (
              <>
                {" "}
                <span className="text-gold-glossy">{titleAccent}</span>
              </>
            ) : null}
          </h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>

        <div className="mt-8">{children}</div>

        {(prevHref || nextHref) && (
          <div className="mt-8 flex items-center justify-between gap-3">
            {prevHref ? (
              <Link
                href={prevHref}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 py-2 text-sm text-green-text hover:text-green-dark"
              >
                <ArrowLeft className="h-4 w-4" />
                {prevLabel ?? "Volver"}
              </Link>
            ) : (
              <div />
            )}
            {nextHref ? (
              nextDisabled ? (
                <div className="flex flex-col items-end gap-1">
                  <PillButton size="md" disabled aria-disabled>
                    {nextLabel ?? "Continuar"}
                    <ArrowRight className="h-4 w-4" />
                  </PillButton>
                  {nextDisabledHint && (
                    <span className="text-[11px] text-muted-foreground">
                      {nextDisabledHint}
                    </span>
                  )}
                </div>
              ) : (
                <PillButton size="md" asChild>
                  <Link href={nextHref}>
                    {nextLabel ?? "Continuar"}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </PillButton>
              )
            ) : (
              <div />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
