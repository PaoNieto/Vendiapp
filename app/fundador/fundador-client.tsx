"use client";

import { useState } from "react";
import { useClerk } from "@clerk/nextjs";

/**
 * Único control extra del paywall: cerrar sesión. NADA de navegación a otras
 * pantallas de la app — el usuario sin pagar queda ENCERRADO acá: o paga el
 * Lifetime Pass, o se va. `signOut` lo manda a /login.
 */
export function SignOutLink() {
  const { signOut } = useClerk();
  return (
    <button
      type="button"
      className="fundador-signout"
      onClick={() => signOut({ redirectUrl: "/login" })}
    >
      Cerrar sesión
    </button>
  );
}

/**
 * CTA del Lifetime Pass. Dispara POST /api/checkout con productId="lifetime-pass"
 * y redirige al init_point de Mercado Pago (mismo patrón que upgrade-store.tsx).
 * El precio/créditos los resuelve el server desde el catálogo — acá NO viaja
 * ningún monto. La acreditación la confirma el webhook, nunca el cliente.
 */
export function LifetimePassButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleBuy() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: "lifetime-pass" }),
      });
      const data = (await res.json().catch(() => null)) as
        | { initPoint?: string; error?: string }
        | null;
      if (!res.ok || !data?.initPoint) {
        throw new Error(data?.error ?? "No se pudo iniciar el pago");
      }
      // Redirige a la página segura de Mercado Pago. Dejamos `loading` en true:
      // ya nos vamos de esta página, no hay a qué volver.
      window.location.href = data.initPoint;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar el pago");
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="pill lg fundador-cta"
        onClick={handleBuy}
        disabled={loading}
        aria-busy={loading}
      >
        {loading ? (
          <>
            <span className="fundador-spin" aria-hidden="true" />
            Redirigiendo…
          </>
        ) : (
          <>
            Quiero mi Lifetime Pass
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M5 12h14M13 6l6 6-6 6"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </>
        )}
      </button>
      {error ? (
        <p className="fundador-error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
