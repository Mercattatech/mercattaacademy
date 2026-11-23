import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar } from "@/components/student-ui";
import type { PublicTenant } from "@/lib/tenant";
import type { StudentContext } from "./student-context";
import { BottomNav, SideNav, SignOut } from "./student-nav";
import { btn } from "@/components/ui";

export function TenantLogo({ tenant, className = "h-10" }: { tenant: PublicTenant; className?: string }) {
  return tenant.brand.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={tenant.brand.logoUrl} alt={tenant.name} className={`w-auto ${className}`} />
  ) : (
    <span className="font-display text-xl font-semibold text-ink">{tenant.name}</span>
  );
}

/**
 * Casca da área do aluno.
 * Celular: conteúdo em coluna e abas fixas no rodapé (protótipo, aba Área do aluno).
 * Computador: as mesmas abas numa barra lateral e o conteúdo numa coluna de leitura.
 */
export function StudentShell({ slug, ctx, children }: { slug: string; ctx: StudentContext; children: ReactNode }) {
  return (
    <div className="min-h-dvh md:flex">
      <aside className="sticky top-0 hidden h-dvh w-[264px] shrink-0 flex-col gap-8 overflow-y-auto border-r border-line bg-surface px-4 py-6 md:flex">
        <Link href={`/t/${slug}`} aria-label={`${ctx.tenant.name}, início`} className="px-3 no-underline">
          <TenantLogo tenant={ctx.tenant} />
        </Link>
        <SideNav slug={slug} primary={ctx.nav.primary} more={ctx.nav.more} adminHref={ctx.staff ? `/t/${slug}/admin` : undefined} />
        <div className="mt-auto flex flex-col gap-2 border-t border-line pt-4">
          <div className="flex items-center gap-3 px-3">
            <Avatar name={ctx.userName} brand />
            <div className="min-w-0">
              <p className="m-0 truncate text-sm font-semibold">{ctx.userName}</p>
              {ctx.course && <p className="m-0 truncate text-xs text-ink-subtle">{ctx.course.cohort}</p>}
            </div>
          </div>
          <SignOut compact />
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <main className="mx-auto w-full max-w-[720px] pt-2 pb-[calc(96px+env(safe-area-inset-bottom))] md:px-10 md:pt-10 md:pb-16">{children}</main>
      </div>
      <BottomNav slug={slug} items={ctx.nav.primary} />
    </div>
  );
}

/**
 * Casca das páginas públicas (protótipo, aba Vitrine pública):
 * cabeçalho branco de 72px com logo, menu e "Entrar"; rodapé cinza com logo e links.
 */
export function SiteShell({
  slug,
  tenant,
  signedIn,
  programsLabel = "Cursos",
  member = false,
  children,
}: {
  slug: string;
  tenant: PublicTenant;
  signedIn: boolean;
  programsLabel?: string;
  /** Tem vínculo com a instituição: o botão do topo leva à área dele em vez de "Entrar". */
  member?: boolean;
  children: ReactNode;
}) {
  const links = [
    tenant.links.site ? { href: tenant.links.site, label: "Site" } : null,
    tenant.links.instagram ? { href: tenant.links.instagram, label: "Instagram" } : null,
    tenant.links.whatsapp ? { href: tenant.links.whatsapp, label: "WhatsApp" } : null,
  ].filter((l): l is { href: string; label: string } => !!l);
  const navCls = "inline-flex h-11 items-center rounded-[10px] px-3 text-[15px] no-underline hover:bg-sunken";
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="sticky top-0 z-20 border-b border-line bg-surface">
        <div className="mx-auto flex h-[72px] max-w-[1120px] items-center gap-6 px-4 sm:px-8">
          <a href={`/t/${slug}`} aria-label={`${tenant.name}, início`} className="flex shrink-0 items-center no-underline">
            <TenantLogo tenant={tenant} className="h-11" />
          </a>
          <nav aria-label="Principal" className="ml-4 hidden gap-1 md:flex">
            <a href={`/t/${slug}`} className={`${navCls} font-semibold text-ink hover:text-ink`}>{programsLabel}</a>
            {tenant.links.site && (
              <a href={tenant.links.site} target="_blank" rel="noopener noreferrer" className={`${navCls} font-medium text-ink-muted hover:text-ink`}>
                Site da instituição
              </a>
            )}
          </nav>
          {(member || !signedIn) && (
            <a
              href={member ? `/t/${slug}` : `/login?voltar=/t/${slug}`}
              className={btn("secondary", "md", "ml-auto")}
            >
              {member ? "Minha área" : "Entrar"}
            </a>
          )}
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-line bg-canvas">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-start justify-between gap-x-10 gap-y-5 px-4 pt-8 pb-10 sm:px-8">
          <div className="flex flex-col gap-2">
            <TenantLogo tenant={tenant} className="h-10 self-start" />
          </div>
          <nav aria-label="Links" className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {links.map((l) => (
              <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center">{l.label}</a>
            ))}
            {member && <a href={`/t/${slug}/meus-dados`} className="inline-flex min-h-11 items-center">Meus dados</a>}
            <a href={`/t/${slug}/privacidade`} className="inline-flex min-h-11 items-center">Privacidade</a>
          </nav>
          <span className="w-full text-[13px] text-ink-subtle">Plataforma de Cursos</span>
        </div>
      </footer>
    </div>
  );
}
