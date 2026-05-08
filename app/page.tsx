import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function LandingPage() {
  return (
    <main className="flex min-h-dvh flex-col">
      {/* Nav */}
      <nav className="sticky top-0 z-50 w-full">
        <div className="glass mx-auto mt-3 flex w-[calc(100%-1.5rem)] max-w-6xl items-center justify-between rounded-2xl px-5 py-3 sm:mt-4">
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight text-foreground"
          >
            Vendí
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:inline-flex"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/signup"
              className={cn(
                buttonVariants({ size: "sm" }),
                "h-9 rounded-xl px-4"
              )}
            >
              Empezar gratis
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex flex-1 items-center px-5 py-12 sm:py-20">
        <div className="mx-auto w-full max-w-3xl text-center">
          <span className="glass inline-flex items-center rounded-full px-4 py-1.5 text-xs font-medium text-foreground/80">
            Generación de imágenes con IA
          </span>

          <h1 className="mt-6 text-balance text-4xl font-semibold leading-[1.1] tracking-tight text-foreground sm:text-5xl md:text-6xl">
            Tu producto, en cualquier escenario,{" "}
            <span className="text-primary">sin sesión de fotos.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
            Subí fotos simples de tu producto + referencias visuales y obtené
            variaciones listas para Meta Ads, Shopify, Temu y catálogos. En
            menos de un minuto.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-12 w-full rounded-xl px-8 text-base sm:w-auto"
              )}
            >
              Empezar gratis
            </Link>
            <Link
              href="#como-funciona"
              className={cn(
                buttonVariants({ size: "lg", variant: "ghost" }),
                "h-12 w-full rounded-xl px-8 text-base sm:w-auto"
              )}
            >
              Ver cómo funciona
            </Link>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            10 generaciones gratis · Sin tarjeta de crédito
          </p>
        </div>
      </section>

      {/* Cómo funciona — 3 pasos */}
      <section id="como-funciona" className="px-5 pb-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Tres pasos. Cero sesión de fotos.
          </h2>

          <div className="mt-10 grid gap-4 sm:grid-cols-3 sm:gap-6">
            {[
              {
                step: "01",
                title: "Subí tu producto",
                desc: "1–5 fotos del producto desde distintos ángulos. No importa la calidad: nosotros la mejoramos.",
              },
              {
                step: "02",
                title: "Mostranos la estética",
                desc: "Subí referencias visuales o elegí de nuestra galería curada. Definí el ratio de salida.",
              },
              {
                step: "03",
                title: "Recibí variaciones",
                desc: "5–10 imágenes listas para usar en Meta Ads, Shopify, Temu y catálogos. Descarga directa.",
              },
            ].map((item) => (
              <div key={item.step} className="glass rounded-3xl p-6 sm:p-7">
                <span className="font-mono text-xs font-medium text-primary">
                  {item.step}
                </span>
                <h3 className="mt-2 text-lg font-semibold tracking-tight text-foreground">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Para quién */}
      <section className="px-5 pb-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Hecho para quien necesita imágenes que vendan.
          </h2>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: "Dropshippers",
                desc: "Generá visuales únicos sin tocar el producto.",
              },
              {
                title: "Marcas DTC",
                desc: "Sesiones virtuales por una fracción del costo.",
              },
              {
                title: "Agencias chicas",
                desc: "Volumen de creatividades para A/B testing en minutos.",
              },
              {
                title: "Creators",
                desc: "Trabajá con productos que ni siquiera tenés físicamente.",
              },
            ].map((item) => (
              <div key={item.title} className="glass rounded-2xl p-5">
                <h3 className="text-base font-semibold tracking-tight text-foreground">
                  {item.title}
                </h3>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="px-5 pb-20">
        <div className="glass-strong mx-auto max-w-3xl rounded-3xl p-8 text-center sm:p-12">
          <h2 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Vendí más con imágenes que vendan.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground sm:text-base">
            Empezá gratis con 10 generaciones. Sin tarjeta. Sin compromiso.
          </p>
          <Link
            href="/signup"
            className={cn(
              buttonVariants({ size: "lg" }),
              "mt-6 inline-flex h-12 rounded-xl px-8 text-base"
            )}
          >
            Empezar gratis
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-5 pb-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 text-xs text-muted-foreground sm:flex-row">
          <span>© {new Date().getFullYear()} Vendí</span>
          <div className="flex gap-4">
            <Link href="/privacidad" className="hover:text-foreground">
              Privacidad
            </Link>
            <Link href="/terminos" className="hover:text-foreground">
              Términos
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
