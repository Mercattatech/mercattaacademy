"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "sans-serif", maxWidth: 560, margin: "3rem auto", padding: "0 1rem", color: "#1b2430" }}>
        <h1>Algo deu errado</h1>
        <p>A plataforma encontrou um problema inesperado. Tente de novo em instantes.</p>
        <button type="button" onClick={reset} style={{ minHeight: 44, padding: "0 16px", fontWeight: 700 }}>Tentar de novo</button>
      </body>
    </html>
  );
}
