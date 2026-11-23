import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { getLabels, getRoles, resolveTenant } from "@/lib/tenant";
import { SiteShell } from "../_shell/shells";

/** Páginas públicas (vitrine, inscrição, verificação, privacidade). */
export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await resolveTenant(slug);
  if (!tenant) notFound();
  const session = await getSession();
  const [labels, roles] = await Promise.all([getLabels(tenant.id), session ? getRoles(tenant.id, session.user.id) : Promise.resolve([])]);
  return (
    <SiteShell slug={slug} tenant={tenant} signedIn={!!session} member={roles.length > 0} programsLabel={labels.program.plural}>
      {children}
    </SiteShell>
  );
}
