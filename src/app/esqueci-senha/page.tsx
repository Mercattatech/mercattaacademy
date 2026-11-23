import { AuthShell } from "@/components/auth-shell";
import { getAuthTenant } from "@/lib/auth-tenant";
import { ForgotForm } from "./forgot-form";

export const metadata = { title: "Esqueci minha senha" };

export default async function ForgotPage({ searchParams }: { searchParams: Promise<{ voltar?: string }> }) {
  const { voltar } = await searchParams;
  const safe = voltar?.startsWith("/") && !voltar.startsWith("//") ? voltar : null;
  const tenant = await getAuthTenant(safe);
  return (
    <AuthShell tenant={tenant}>
      <ForgotForm backHref={`/login${safe ? `?voltar=${encodeURIComponent(safe)}` : ""}`} />
    </AuthShell>
  );
}
