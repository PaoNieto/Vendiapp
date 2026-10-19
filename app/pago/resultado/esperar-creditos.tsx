"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Clock, Loader2 } from "lucide-react";
import { messageText } from "@/lib/avisos/textos";

/**
 * Espera a que la compra se acredite, preguntando a `/api/pago/estado`.
 *
 *  - Primeros 90 s: cada 2 s, «Estamos confirmando tu pago».
 *  - Después: cada 10 s con `?tarde=1` (ahí la ruta mira si Whop ya cobró) y el
 *    texto de pago demorado: cobrado / sin confirmar. NO se rinde: el texto
 *    promete «te avisamos acá», así que sigue preguntando hasta que entren.
 *  - Pago estacionado a su nombre: «Recibimos tu pago y estamos terminando de
 *    acreditarlo…» y sigue preguntando (más espaciado) hasta que Paolo acredite.
 *  - Recién con `acreditado` dice «¡Listo!» y habilita el botón.
 *
 * Los textos son los exactos de la spec (lib/avisos/textos.ts). Nunca nombra
 * a Whop ni muestra errores crudos.
 */

const RAPIDO_MS = 2_000;
const TARDE_MS = 10_000;
const ESTACIONADO_MS = 30_000;
const UMBRAL_DEMORA_MS = 90_000;

type Estado = "acreditado" | "sin_acreditar" | "cobrado" | "confirmando" | "esperando";

type Respuesta = { estado?: Estado; message?: string };

export function EsperarCreditos({ desde }: { desde: string }) {
  const [estado, setEstado] = useState<Estado>("esperando");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [demorado, setDemorado] = useState(false);

  useEffect(() => {
    let cancelado = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const inicio = Date.now();

    async function preguntar() {
      const tarde = Date.now() - inicio >= UMBRAL_DEMORA_MS;
      let siguiente: Estado | null = null;
      try {
        const res = await fetch(
          `/api/pago/estado?desde=${encodeURIComponent(desde)}${tarde ? "&tarde=1" : ""}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const body = (await res.json()) as Respuesta;
          siguiente = body.estado ?? null;
          if (!cancelado && siguiente) {
            setEstado(siguiente);
            setMensaje(typeof body.message === "string" ? body.message : null);
          }
        }
      } catch {
        // Hipo de red: se reintenta en la próxima vuelta.
      }
      if (cancelado) return;
      if (tarde) setDemorado(true);
      if (siguiente === "acreditado") return;

      const espera =
        siguiente === "sin_acreditar" ? ESTACIONADO_MS : tarde ? TARDE_MS : RAPIDO_MS;
      timer = setTimeout(preguntar, espera);
    }

    preguntar();
    return () => {
      cancelado = true;
      if (timer) clearTimeout(timer);
    };
  }, [desde]);

  if (estado === "acreditado") {
    return (
      <div className="flex flex-col items-center" aria-live="polite">
        <CheckCircle2 className="h-12 w-12 text-sage-strong" />
        <h1 className="mt-5 font-display text-3xl italic text-foreground">¡Listo!</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {mensaje ?? "Entraron tus créditos."}
        </p>
        <Link
          href="/fabrica"
          className="mt-8 inline-flex min-h-[48px] items-center justify-center rounded-full bg-pill-bg px-5 py-3 text-sm font-semibold text-pill-fg transition-opacity hover:opacity-90"
        >
          Ir a la Fábrica
        </Link>
      </div>
    );
  }

  if (estado === "sin_acreditar") {
    return (
      <Esperando
        titulo="Recibimos tu pago"
        texto={mensaje ?? messageText("payment_unmatched", {})}
      />
    );
  }

  if (demorado || estado === "cobrado" || estado === "confirmando") {
    const texto =
      estado === "cobrado"
        ? messageText("payment_delayed_paid", {})
        : messageText("payment_delayed_unconfirmed", {});
    return <Esperando titulo="Tu pago está tardando" texto={texto} />;
  }

  return (
    <Esperando
      titulo="Estamos confirmando tu pago"
      texto="No cierres esta pantalla. Suele tardar menos de un minuto."
    />
  );
}

function Esperando({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="flex flex-col items-center" aria-live="polite">
      <Clock className="h-12 w-12 text-foreground" />
      <h1 className="mt-5 font-display text-3xl italic text-foreground">{titulo}</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{texto}</p>
      <div
        className="mt-8 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-pill-bg px-5 py-3 text-sm font-semibold text-pill-fg opacity-70"
      >
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Seguimos revisando…
      </div>
    </div>
  );
}
