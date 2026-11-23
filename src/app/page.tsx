import Link from "next/link";
import { Page } from "@/components/ui";

export default function PlatformHome() {
  return (
    <Page>
      <h1 className="text-4xl font-semibold">pos-saas</h1>
      <p className="mt-3 max-w-prose text-ink-muted">
        Plataforma de pós-graduação e cursos. Cada instituição tem o próprio endereço, como
        bressane.seudominio.com.br.
      </p>
      <ul className="mt-8 flex flex-col gap-3">
        <li>
          <Link className="font-bold text-brand underline" href="/master">
            Abrir o painel master
          </Link>
        </li>
        <li>
          <Link className="font-bold text-brand underline" href="/t/bressane">
            Ver a instituição de exemplo (Bressane)
          </Link>
        </li>
      </ul>
    </Page>
  );
}
