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
          <div className="w-full max-w-md">{children}</div>
        </main>
      </div>
    </AppBackground>
  );
}
