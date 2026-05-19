import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type StationShellProps = {
  number: string;
  title: string;
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
};

export function StationShell({
  number,
  title,
  description,
  children,
  prevHref,
  prevLabel,
  nextHref,
  nextLabel,
  nextDisabled = false,
  nextDisabledHint,
}: StationShellProps) {
  return (
    <div className="px-5 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-sm font-semibold text-primary">
            {number}
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {title}
          </h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>

        <div className="mt-8">{children}</div>

        {(prevHref || nextHref) && (
          <div className="mt-8 flex items-center justify-between gap-3">
            {prevHref ? (
              <Link
                href={prevHref}
                className={cn(
                  buttonVariants({ variant: "ghost", size: "lg" }),
                  "h-12 rounded-xl",
                )}
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
                  <button
                    type="button"
                    disabled
                    aria-disabled
                    className={cn(
                      buttonVariants({ size: "lg" }),
                      "h-12 cursor-not-allowed rounded-xl opacity-50",
                    )}
                  >
                    {nextLabel ?? "Continuar"}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  {nextDisabledHint && (
                    <span className="text-[11px] text-muted-foreground">
                      {nextDisabledHint}
                    </span>
                  )}
                </div>
              ) : (
                <Link
                  href={nextHref}
                  className={cn(
                    buttonVariants({ size: "lg" }),
                    "h-12 rounded-xl",
                  )}
                >
                  {nextLabel ?? "Continuar"}
                  <ArrowRight className="h-4 w-4" />
                </Link>
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
