import { AuthShell, AuthTitle } from "@/components/auth-shell";
import { getAuthTenant } from "@/lib/auth-tenant";
import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ voltar?: string }> }) {
  const { voltar } = await searchParams;
  const next = voltar?.startsWith("/") && !voltar.startsWith("//") ? voltar : "/escolher";
  const tenant = await getAuthTenant(next);
  return (
    <AuthShell tenant={tenant}>
      <AuthTitle title="Entrar" subtitle="Use o e-mail e a senha da sua conta." />
      <LoginForm redirectTo={next} />
    </AuthShell>
  );
}
