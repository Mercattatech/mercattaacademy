import { AuthShell, AuthTitle } from "@/components/auth-shell";
import { getAuthTenant } from "@/lib/auth-tenant";
import { getLabels } from "@/lib/tenant";
import { SignupForm } from "./signup-form";

export const metadata = { title: "Criar conta" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ voltar?: string }> }) {
  const { voltar } = await searchParams;
  const next = voltar?.startsWith("/") && !voltar.startsWith("//") ? voltar : "/escolher";
  const tenant = await getAuthTenant(next);
  const programs = tenant ? (await getLabels(tenant.id)).program.plural : null;
  return (
    <AuthShell tenant={tenant}>
      <AuthTitle title="Criar conta" subtitle="Com a conta você se inscreve nas turmas e acompanha sua matrícula." />
      <SignupForm
        redirectTo={next}
        privacyHref={tenant ? `/t/${tenant.slug}/privacidade` : null}
        showcase={tenant && programs ? { href: `/t/${tenant.slug}`, label: `Ver ${programs.toLowerCase()}` } : null}
      />
    </AuthShell>
  );
}
