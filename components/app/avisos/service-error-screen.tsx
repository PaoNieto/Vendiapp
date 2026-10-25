import { ShieldAlert } from "lucide-react";
import { AppBackground } from "@/components/dashboard";
import { RetryButton } from "./retry-button";

/**
 * Pantalla de error del shell autenticado (Server Component).
 *
 * Se usa cuando el layout NO puede verificar la cuenta (chequeo de acceso o
 * base caída). Regla dura: nunca mandar a /comprar ni /plan a alguien que tal
 * vez ya pagó, y tampoco dejarlo entrar sin verificar. Solo esta pantalla.
 */
export function ServiceErrorScreen({ message }: { message: string }) {
  return (
    <AppBackground>
      <main className="flex min-h-dvh flex-1 items-center justify-center px-4 py-10">
        <div className="glass-card flex w-full max-w-md flex-col items-center gap-5 p-7 text-center sm:p-9">
          <span
            aria-hidden
            className="grid h-12 w-12 place-items-center rounded-full bg-butter/15 text-butter"
          >
            <ShieldAlert className="h-6 w-6" />
          </span>
          <p role="alert" className="text-[15px] leading-relaxed text-foreground">
            {message}
          </p>
          <RetryButton />
        </div>
      </main>
    </AppBackground>
  );
}
