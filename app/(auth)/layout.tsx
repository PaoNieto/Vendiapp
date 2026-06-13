import Link from "next/link";
import { AppBackground } from "@/components/dashboard";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppBackground>
      <div className="flex min-h-dvh flex-1 flex-col">
        <header className="px-5 py-5 sm:py-6">
          <Link
            href="/"
            className="text-lg font-medium tracking-tight text-foreground"
          >
            Vendí
          </Link>
        </header>
        <main className="flex flex-1 items-center justify-center px-5 py-8">
          {/*
            La card glass la pone ESTE layout (no Clerk): en el appearance le
            sacamos a <SignIn/>/<SignUp/> su card/sombra propias para que se
            apoyen sobre este shell glass-strong y se vean premium (Cuaderno
            v2), sin doble marco. Centramos el form de Clerk adentro.
          */}
          <div className="glass-strong w-full max-w-md rounded-3xl border-0 p-7 shadow-xl [&_.cl-rootBox]:mx-auto [&_.cl-rootBox]:flex [&_.cl-rootBox]:justify-center">
            {children}
          </div>
        </main>
      </div>
    </AppBackground>
  );
}
