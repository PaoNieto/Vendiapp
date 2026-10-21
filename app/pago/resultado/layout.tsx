import { MetaPurchase } from "./meta-purchase";

/**
 * Layout de /pago/resultado: solo suma el Purchase del pixel de Meta (no pinta
 * nada). Va acá y no en page.tsx para que la pantalla de resultado se pueda
 * cambiar sin perder la señal de compra de los anuncios.
 */
export default function ResultadoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <MetaPurchase />
      {children}
    </>
  );
}
