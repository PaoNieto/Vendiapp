"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { recheckAiAction, resolveAlertAction, type RecheckAiState } from "./actions";

/** [Ya recargué]: prueba la IA en el momento y muestra el resultado. */
export function RecheckAiButton() {
  const [state, action, pending] = useActionState<RecheckAiState, FormData>(recheckAiAction, {
    status: "idle",
  });
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-primary px-4 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RotateCw className="h-4 w-4" aria-hidden />}
          Ya recargué
        </button>
        <span className="font-mono text-[11px] tracking-wide text-mute">Prueba la IA en el momento</span>
      </div>
      {state.status !== "idle" ? (
        <p
          role="status"
          className={cn(
            "text-[12.5px] leading-snug",
            state.status === "up" ? "text-success" : state.status === "down" ? "text-clay" : "text-mute",
          )}
        >
          {state.text}
        </p>
      ) : null}
    </form>
  );
}

function ResolveSubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-[12px] font-semibold text-foreground transition-colors hover:bg-foreground/5 disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
      Marcar resuelta
    </button>
  );
}

/** [Marcar resuelta] de una alerta abierta. */
export function ResolveAlertButton({ dedupeKey }: { dedupeKey: string }) {
  return (
    <form action={resolveAlertAction}>
      <input type="hidden" name="dedupeKey" value={dedupeKey} />
      <ResolveSubmit />
    </form>
  );
}
