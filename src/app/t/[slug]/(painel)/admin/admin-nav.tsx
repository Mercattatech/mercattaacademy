"use client";

import { Icon } from "@/components/icon";
import { PanelShell, type NavGroup } from "@/components/panel-shell";

export type { NavGroup, NavItem } from "@/components/panel-shell";

/** Casca do painel da instituição (protótipo, aba Painel da instituição). */
export function AdminShell({
  slug,
  groups,
  logo,
  logoShort,
  userName,
  initials,
  roleLabel,
  canSearch,
  support,
  supportExit,
  children,
}: {
  slug: string;
  groups: NavGroup[];
  logo: React.ReactNode;
  logoShort: string;
  userName: string;
  initials: string;
  roleLabel: string;
  canSearch: boolean;
  support: boolean;
  /** Endereço do painel master (domínio raiz), para sair do modo suporte. */
  supportExit: string;
  children: React.ReactNode;
}) {
  const base = `/t/${slug}/admin`;
  return (
    <PanelShell
      base={base}
      storageKey="admin-nav-collapsed"
      groups={groups.map((g) => ({ ...g, items: g.items.map((i) => (i.href === "/cursos" ? { ...i, also: ["/turmas"] } : i)) }))}
      brand={logo}
      brandShort={<span className="flex size-11 items-center justify-center rounded-[12px] bg-brand-soft font-display text-base font-bold text-brand-ink">{logoShort}</span>}
      footerLinks={[{ href: `/t/${slug}`, label: "Ver como aluno", icon: "external" }]}
      search={canSearch ? { action: `${base}/inscricoes`, name: "busca", label: "Buscar aluno", placeholder: "Buscar aluno por nome ou e-mail" } : undefined}
      topExtra={
        support ? (
          <span className="hidden h-9 items-center gap-1.5 rounded-full bg-warning-soft pr-1 pl-3 text-[13px] font-bold whitespace-nowrap text-warning sm:flex" title="Este acesso fica registrado na auditoria.">
            <Icon name="support" size={18} />
            Suporte da plataforma
            <a href={supportExit} className="ml-1 inline-flex h-7 items-center rounded-full bg-surface px-2.5 font-semibold text-ink no-underline hover:text-ink">
              Sair do suporte
            </a>
          </span>
        ) : undefined
      }
      userName={userName}
      initials={initials}
      roleLabel={roleLabel}
    >
      {children}
    </PanelShell>
  );
}
