import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Vendí — Tu producto, en cualquier escenario",
  description:
    "Generá imágenes profesionales de tu producto sin sesión de fotos. Subí fotos simples + referencias visuales y obtené variaciones listas para Meta Ads, Shopify, Temu y catálogos.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#C8E6D5",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${inter.variable} h-full`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
