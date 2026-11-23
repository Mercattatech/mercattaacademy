import type { Metadata } from "next";
// Fontes empacotadas no projeto (sem depender do Google Fonts no build ou na VPS).
import "@fontsource-variable/bricolage-grotesque/index.css";
import "@fontsource-variable/instrument-sans/index.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "pos-saas",
  description: "Plataforma de pós-graduação e cursos",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
