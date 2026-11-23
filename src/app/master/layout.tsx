import { PanelShell, type NavGroup } from "@/components/panel-shell";
import { withContext } from "@/lib/db";
import { requireMaster } from "@/lib/guards";
import { masterAlerts } from "./data";

/** Painel master (protótipo, aba Painel master): mesma casca do painel da instituição, na cor da plataforma. */
export default async function MasterLayout({ children }: { children: React.ReactNode }) {
  const { userId, name } = await requireMaster();
  const alerts = (await withContext({ userId, master: true }, (c) => masterAlerts(c))).length;
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase()).join("");

  const groups: NavGroup[] = [
    {
      title: "",
      items: [
        { href: "", label: "Visão geral", icon: "chart", badge: alerts || undefined, urgent: true },
        { href: "/instituicoes", label: "Instituições", icon: "building", also: ["/nova"], fallback: true },
        { href: "/planos", label: "Planos e recursos", icon: "toggle" },
        { href: "/cobrancas", label: "Cobranças", icon: "receipt" },
        { href: "/design-system", label: "Sistema de design", icon: "palette" },
      ],
    },
  ];

  const mark = <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-ink font-display text-sm font-bold tracking-[.02em] text-white">SSD</span>;

  return (
    <div data-theme="ssd">
      <PanelShell
        base="/master"
        storageKey="master-nav-collapsed"
        groups={groups}
        brand={
          <span className="flex items-center gap-2.5">
            {mark}
            <span className="flex flex-col leading-tight">
              <span className="font-display text-base font-bold">Plataforma de Cursos</span>
              <span className="text-xs font-semibold text-ink-subtle">Master</span>
            </span>
          </span>
        }
        brandShort={mark}
        search={{ action: "/master/instituicoes", name: "q", label: "Buscar instituição", placeholder: "Buscar instituição ou endereço" }}
        userName={name}
        initials={initials}
        roleLabel="Plataforma de Cursos"
        maxWidth="max-w-[1160px]"
      >
        {children}
      </PanelShell>
    </div>
  );
}
