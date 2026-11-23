"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Icon, type IconName } from "./icon";

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  badge?: number;
  /** Badge vermelho (alertas) em vez do cinza (pendências). */
  urgent?: boolean;
  /** Outros caminhos (prefixos, relativos à base) que também acendem este item. */
  also?: string[];
  /** Acende quando nenhum outro item casa e a página não é a base (ex.: detalhe de instituição). */
  fallback?: boolean;
};
export type NavGroup = { title: string; items: NavItem[] };

/**
 * Casca dos painéis (protótipo, abas "Painel da instituição" e "Painel master"):
 * barra lateral branca de 248px (72px recolhida) com marca e menu por grupos,
 * barra superior de 64px com busca e quem está usando, e conteúdo com até 1120px.
 * No celular, o menu abre como gaveta.
 */
export function PanelShell({
  base,
  storageKey,
  groups,
  brand,
  brandShort,
  footerLinks = [],
  search,
  topExtra,
  userName,
  initials,
  roleLabel,
  maxWidth = "max-w-[1120px]",
  children,
}: {
  base: string;
  storageKey: string;
  groups: NavGroup[];
  brand: React.ReactNode;
  brandShort: React.ReactNode;
  footerLinks?: { href: string; label: string; icon: IconName }[];
  search?: { action: string; name: string; label: string; placeholder: string };
  topExtra?: React.ReactNode;
  userName: string;
  initials: string;
  roleLabel: string;
  maxWidth?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(storageKey) === "1");
    } catch {}
  }, [storageKey]);

  useEffect(() => setDrawer(false), [pathname]);

  function toggle() {
    if (window.matchMedia("(max-width: 767px)").matches) {
      setDrawer((d) => !d);
      return;
    }
    setCollapsed((c) => {
      try {
        localStorage.setItem(storageKey, c ? "0" : "1");
      } catch {}
      return !c;
    });
  }

  const under = (href: string) => {
    const full = `${base}${href}`;
    return pathname === full || pathname.startsWith(`${full}/`);
  };
  const matches = (i: NavItem) => (i.href === "" ? pathname === base : under(i.href) || (i.also ?? []).some(under));
  const all = groups.flatMap((g) => g.items);
  const anyMatch = all.some(matches);
  const isActive = (i: NavItem) => matches(i) || (!!i.fallback && !anyMatch && pathname !== base);

  const narrow = collapsed && !drawer;
  const rowCls = `flex h-11 items-center gap-2.5 rounded-[10px] px-2.5 text-sm font-medium text-ink-muted no-underline hover:bg-sunken hover:text-ink ${narrow ? "md:justify-center" : ""}`;

  return (
    <div className="flex min-h-dvh bg-canvas">
      {drawer && <button type="button" aria-label="Fechar menu" onClick={() => setDrawer(false)} className="fixed inset-0 z-30 bg-ink/30 md:hidden" />}
      <aside
        aria-label="Menu do painel"
        className={`fixed inset-y-0 left-0 z-40 flex w-[264px] flex-col gap-2 overflow-y-auto border-r border-line bg-surface px-3 py-4 transition-transform md:sticky md:top-0 md:z-auto md:h-dvh md:translate-x-0 md:transition-none ${
          drawer ? "translate-x-0 shadow-[var(--shadow-overlay)]" : "-translate-x-full"
        } ${narrow ? "md:w-[72px]" : "md:w-[248px]"}`}
      >
        <div className="mb-1.5 flex h-[52px] items-center px-1.5">
          <Link href={base} className="text-ink no-underline hover:text-ink" aria-label="Visão geral">
            {narrow ? <span className="hidden md:flex">{brandShort}</span> : null}
            <span className={narrow ? "md:hidden" : ""}>{brand}</span>
          </Link>
        </div>
        <nav className="flex flex-col gap-0.5">
          {groups.map((g) => (
            <div key={g.title || "root"} className="flex flex-col gap-0.5">
              {g.title && (narrow ? <span className="mx-3 my-2 h-px bg-line" /> : <span className="px-2.5 pt-3.5 pb-1 text-xs font-semibold tracking-[.03em] text-ink-subtle uppercase">{g.title}</span>)}
              {g.items.map((i) => {
                const active = isActive(i);
                return (
                  <Link
                    key={i.href}
                    href={`${base}${i.href}`}
                    aria-current={active ? "page" : undefined}
                    title={narrow ? i.label : undefined}
                    className={`relative flex h-11 items-center gap-2.5 rounded-[10px] px-2.5 text-sm no-underline ${narrow ? "md:justify-center" : ""} ${
                      active ? "bg-brand-soft font-semibold text-brand-ink hover:text-brand-ink" : "font-medium text-ink-muted hover:bg-sunken hover:text-ink"
                    }`}
                  >
                    <Icon name={i.icon} size={20} strong={active} />
                    <span className={`flex-1 truncate ${narrow ? "md:sr-only" : ""}`}>{i.label}</span>
                    {i.badge ? (
                      narrow ? (
                        <span aria-label={`${i.badge} ${i.urgent ? "alertas" : "pendentes"}`} className={`absolute top-2 right-3 size-2 rounded-full max-md:hidden ${i.urgent ? "bg-danger" : "bg-brand"}`} />
                      ) : (
                        <span
                          aria-label={`${i.badge} ${i.urgent ? "alertas" : "pendentes"}`}
                          className={`rounded-md px-[7px] py-px text-xs ${i.urgent ? "bg-danger font-bold text-white" : "bg-sunken font-semibold text-ink"}`}
                        >
                          {i.badge}
                        </span>
                      )
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-0.5 border-t border-line pt-2">
          {footerLinks.map((l) => (
            <Link key={l.href} href={l.href} title={narrow ? l.label : undefined} className={rowCls}>
              <Icon name={l.icon} size={20} />
              <span className={narrow ? "md:sr-only" : ""}>{l.label}</span>
            </Link>
          ))}
          <button
            type="button"
            title={narrow ? "Sair" : undefined}
            onClick={async () => {
              await authClient.signOut();
              router.push("/login");
              router.refresh();
            }}
            className={`${rowCls} text-left`}
          >
            <Icon name="logout" size={20} />
            <span className={narrow ? "md:sr-only" : ""}>Sair</span>
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface pr-4 pl-3 md:pr-5">
          <button
            type="button"
            onClick={toggle}
            aria-label={drawer ? "Fechar menu" : collapsed ? "Abrir menu" : "Recolher menu"}
            aria-expanded={drawer || !collapsed}
            className="flex size-11 shrink-0 items-center justify-center rounded-[10px] text-ink-muted hover:bg-sunken"
          >
            <Icon name="sidebar" />
          </button>
          {topExtra}
          {search && (
            <form action={search.action} method="get" role="search" className="flex h-11 max-w-[420px] min-w-0 flex-1 items-center gap-2 rounded-[10px] bg-sunken px-3">
              <Icon name="search" size={20} className="text-ink-subtle" />
              <input
                name={search.name}
                type="search"
                aria-label={search.label}
                placeholder={search.placeholder}
                className="min-w-0 flex-1 border-0 bg-transparent text-[15px] text-ink outline-offset-[6px] placeholder:text-ink-subtle"
              />
            </form>
          )}
          <div className="ml-auto flex items-center gap-2.5">
            <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand-ink">{initials}</span>
            <span className="hidden flex-col leading-tight lg:flex">
              <span className="text-sm font-semibold">{userName}</span>
              <span className="text-[13px] text-ink-subtle">{roleLabel}</span>
            </span>
          </div>
        </header>
        <main className="flex-1">
          <div className={`mx-auto w-full ${maxWidth} px-4 pt-6 pb-16 sm:px-6 lg:px-10 lg:pt-8 lg:pb-[72px]`}>{children}</div>
        </main>
      </div>
    </div>
  );
}
