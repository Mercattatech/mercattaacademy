"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/icon";
import { authClient } from "@/lib/auth-client";
import type { NavLink } from "@/lib/menu";

/** Caminho sem o prefixo /t/<slug> (no subdomínio ele não aparece na barra de endereço). */
function useLocalPath(slug: string): string {
  const path = usePathname() ?? "/";
  const prefix = `/t/${slug}`;
  const local = path.startsWith(prefix) ? path.slice(prefix.length) : path;
  return local === "/" ? "" : local.replace(/\/$/, "");
}

function isActive(item: NavLink, path: string): boolean {
  if (item.href === "") return path === "";
  return (item.match ?? [item.href]).some((m) => path === m || path.startsWith(m.endsWith("/") ? m : `${m}/`));
}

/** Abas fixas no rodapé do celular: Início, Aulas, Notas, Certificados, Mais. */
export function BottomNav({ slug, items }: { slug: string; items: NavLink[] }) {
  const path = useLocalPath(slug);
  return (
    <nav
      aria-label="Navegação principal"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      className="fixed inset-x-0 bottom-0 z-20 grid border-t border-line bg-surface px-1 pt-1.5 pb-[max(10px,env(safe-area-inset-bottom))] md:hidden"
    >
      {items.map((it) => {
        const active = isActive(it, path);
        return (
          <Link
            key={it.key}
            href={`/t/${slug}${it.href}`}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 text-xs no-underline ${active ? "font-semibold text-brand-ink" : "font-medium text-ink-muted"}`}
          >
            <span aria-hidden="true" className={`flex h-[30px] w-[52px] items-center justify-center rounded-full ${active ? "bg-brand-soft" : ""}`}>
              <Icon name={it.icon} strong={active} />
            </span>
            <span className="max-w-full truncate px-0.5">{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Barra lateral do computador: as mesmas abas e, abaixo, o que no celular fica em "Mais". */
export function SideNav({ slug, primary, more, adminHref }: { slug: string; primary: NavLink[]; more: NavLink[]; adminHref?: string }) {
  const path = useLocalPath(slug);
  const item = (it: NavLink) => {
    const active = isActive(it, path) && !(it.key === "mais");
    return (
      <li key={it.key}>
        <Link
          href={`/t/${slug}${it.href}`}
          aria-current={active ? "page" : undefined}
          className={`flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-[15px] no-underline ${active ? "bg-brand-soft font-semibold text-brand-ink" : "font-medium text-ink-muted hover:bg-sunken hover:text-ink"}`}
        >
          <Icon name={it.icon} strong={active} />
          <span className="flex-1">{it.label}</span>
          {it.badge && <span className={`text-xs font-semibold ${it.badgeTone === "warning" ? "text-warning" : "text-ink-subtle"}`}>{it.badge}</span>}
        </Link>
      </li>
    );
  };
  return (
    <nav aria-label="Navegação principal" className="flex flex-col gap-5">
      <ul className="flex flex-col gap-0.5">{primary.filter((p) => p.key !== "mais").map(item)}</ul>
      <div className="flex flex-col gap-1">
        <span className="px-3 text-xs font-semibold tracking-wide text-ink-subtle">MAIS</span>
        <ul className="flex flex-col gap-0.5">{more.map(item)}</ul>
      </div>
      {adminHref && (
        <Link href={adminHref} className="flex min-h-11 items-center gap-3 rounded-[10px] border border-line-strong px-3 text-[15px] font-semibold text-ink no-underline hover:bg-sunken">
          <Icon name="dashboard" />
          Área administrativa
        </Link>
      )}
    </nav>
  );
}

/** Sair da conta e voltar ao login. */
export function SignOut({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      aria-busy={busy || undefined}
      onClick={async () => {
        setBusy(true);
        await authClient.signOut();
        router.push("/login");
        router.refresh();
      }}
      className={
        compact
          ? `flex min-h-11 w-full items-center gap-3 rounded-[10px] px-3 text-[15px] font-medium text-ink-muted hover:bg-sunken hover:text-ink disabled:opacity-60 ${className}`
          : `flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] border border-line-strong bg-transparent text-base font-semibold text-ink hover:bg-sunken disabled:opacity-60 ${className}`
      }
    >
      {compact && <Icon name="logout" />}
      {busy ? "Saindo..." : "Sair da conta"}
    </button>
  );
}
