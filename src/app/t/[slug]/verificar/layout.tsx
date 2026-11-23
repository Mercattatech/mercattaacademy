import { notFound } from "next/navigation";
import { resolveTenant } from "@/lib/tenant";
import { TenantLogo } from "../_shell/shells";

/** Conferência pública de certificado (protótipo): cabeçalho só com o logo e o endereço, fundo cinza. */
export default async function VerifyLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await resolveTenant(slug);
  if (!tenant) notFound();
  const host = `${slug}.${process.env.ROOT_DOMAIN ?? "localhost:3000"}`;
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-[72px] max-w-[720px] items-center justify-between gap-4 px-5 sm:px-8">
          <a href={`/t/${slug}`} aria-label={`${tenant.name}, início`} className="flex shrink-0 items-center no-underline">
            <TenantLogo tenant={tenant} className="h-11" />
          </a>
          <span className="truncate text-[13px] text-ink-subtle">{host}</span>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-7 px-5 pt-8 pb-14 sm:px-8 sm:pt-14">{children}</main>
    </div>
  );
}
