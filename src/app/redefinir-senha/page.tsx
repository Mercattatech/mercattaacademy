import Link from "next/link";
import { AuthBadge, AuthShell, AuthTitle, authCta } from "@/components/auth-shell";
import { getAuthTenant } from "@/lib/auth-tenant";
import { ResetForm } from "./reset-form";

export const metadata = { title: "Nova senha" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  const tenant = await getAuthTenant(null);
  if (!token || error) {
    return (
      <AuthShell tenant={tenant}>
        <AuthBadge icon="error" tone="brand" />
        <AuthTitle title="Link inválido" subtitle="Este link venceu ou já foi usado. Peça um novo para criar a senha." />
        <Link href="/esqueci-senha" className={authCta}>
          Pedir novo link
        </Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell tenant={tenant}>
      <ResetForm token={token} />
    </AuthShell>
  );
}
