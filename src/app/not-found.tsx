import Link from "next/link";
import { Page } from "@/components/ui";

export default function NotFound() {
  return (
    <Page>
      <h1 className="text-4xl font-bold tracking-tight">Página não encontrada</h1>
      <p className="mt-3 max-w-prose">O endereço pode ter mudado ou você não tem acesso a esta página. Confira o link ou volte ao início.</p>
      <p className="mt-6"><Link href="/" className="font-bold text-brand underline">Voltar ao início</Link></p>
    </Page>
  );
}
