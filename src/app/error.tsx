"use client";

import { useEffect } from "react";
import { btn } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-8">
      <h1 className="text-4xl font-bold tracking-tight">Algo deu errado</h1>
      <p className="mt-3 max-w-prose">Não foi possível concluir esta ação. Tente de novo. Se o problema continuar, fale com a secretaria{error.digest ? ` e informe o código ${error.digest}` : ""}.</p>
      <p className="mt-6"><button type="button" onClick={reset} className={btn()}>Tentar de novo</button></p>
    </main>
  );
}
