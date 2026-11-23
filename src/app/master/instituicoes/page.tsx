import Link from "next/link";
import { btnOutline, btnPrimary, inputCls, PageHead, tableCls, tableWrap, tdCls, thCls, trCls, Tag } from "@/components/admin-ui";
import { Icon } from "@/components/icon";
import { withContext } from "@/lib/db";
import { requireMaster } from "@/lib/guards";
import { courseUsage } from "@/lib/services/academic";
import { estimateBilling, formatBRL } from "@/lib/services/billing";
import { tenantPath } from "@/lib/urls";
import { INVOICE, listTenants, rootDomain, STAGE, stageOf, type Stage } from "../data";
import { SupportButton } from "../master-ui";
import { EmptyState } from "@/components/ui";

const FILTERS = [
  ["todas", "Todas"],
  ["ativas", "Ativa"],
  ["implantacao", "Em implantação"],
  ["suspensas", "Suspensa"],
  ["atraso", "Cobrança em atraso"],
] as const;
type Filter = (typeof FILTERS)[number][0];
const STAGE_OF_FILTER: Partial<Record<Filter, Stage>> = { ativas: "active", implantacao: "implant", suspensas: "suspended" };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Instituições (protótipo): busca, situação em pílulas e a tabela com "Entrar como suporte". */
export default async function MasterInstitutionsPage({ searchParams }: { searchParams: Promise<{ q?: string; situacao?: string }> }) {
  const { q: rawQ, situacao } = await searchParams;
  const { userId } = await requireMaster("/master/instituicoes");
  const q = rawQ?.trim().slice(0, 80) ?? "";
  const filter: Filter = FILTERS.some(([k]) => k === situacao) ? (situacao as Filter) : "todas";
  const root = rootDomain();

  const rows = await withContext({ userId, master: true }, (c) => listTenants(c));
  const term = norm(q);
  const matched = rows.filter((r) => !term || norm(r.name).includes(term) || norm(r.slug).includes(term));
  const hit = (r: (typeof rows)[number], f: Filter) => f === "todas" || (f === "atraso" ? r.invoice === "late" : stageOf(r) === STAGE_OF_FILTER[f]);
  const shown = matched.filter((r) => hit(r, filter));
  const activeN = rows.filter((r) => stageOf(r) === "active").length;

  const usage = new Map(
    await Promise.all(
      shown.map(async (r) => {
        const u = await withContext({ tenantId: r.id }, (c) => courseUsage(c));
        const est = r.plan_values && r.status === "active" ? estimateBilling(r.plan_values, u) : { totalCents: 0 };
        return [r.id, { students: u.reduce((n, x) => n + x.activeStudents, 0), month: est.totalCents }] as const;
      }),
    ),
  );

  const href = (f: Filter) => {
    const p = new URLSearchParams({ ...(q ? { q } : {}), ...(f !== "todas" ? { situacao: f } : {}) });
    return `/master/instituicoes${p.size ? `?${p}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        title="Instituições"
        sub={`${rows.length} ${rows.length === 1 ? "instituição" : "instituições"} · ${activeN} ${activeN === 1 ? "ativa" : "ativas"}`}
        action={
          <Link href="/master/nova" className={btnPrimary}>
            <Icon name="plus" size={20} />
            Cadastrar instituição
          </Link>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <form action="/master/instituicoes" method="get" role="search" className="flex max-w-xs min-w-52 flex-[1_1_220px] flex-col gap-1.5 text-[13px] font-semibold">
          <label htmlFor="q">Buscar</label>
          {filter !== "todas" && <input type="hidden" name="situacao" value={filter} />}
          <input id="q" name="q" type="search" defaultValue={q} placeholder="Nome ou endereço" className={inputCls} />
        </form>
        <nav aria-label="Situação" className="flex flex-wrap gap-1.5">
          {FILTERS.map(([key, label]) => {
            const active = filter === key;
            const n = matched.filter((r) => hit(r, key)).length;
            if (key === "atraso" && !n && !active) return null;
            return (
              <Link
                key={key}
                href={href(key)}
                aria-current={active ? "page" : undefined}
                className={`inline-flex h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold whitespace-nowrap no-underline ${
                  active ? "border-ink bg-ink text-white hover:text-white" : "border-line-strong bg-surface text-ink hover:bg-sunken hover:text-ink"
                }`}
              >
                {label}
                <span className={`font-medium ${active ? "text-[#D6D7D4]" : "text-ink-subtle"}`}>{n}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon="search"
          title="Nenhuma instituição encontrada"
          action={
            <div className="flex flex-wrap gap-2">
              {rows.length > 0 && <Link href="/master/instituicoes" className={btnOutline}>Limpar busca</Link>}
              <Link href="/master/nova" className={btnPrimary}>Cadastrar instituição</Link>
            </div>
          }
        >
          {rows.length === 0 ? "Cadastre a primeira para enviar o convite ao administrador." : "Confira a grafia, troque o filtro ou cadastre uma nova instituição com esse nome."}
        </EmptyState>
      ) : (
        <div className={tableWrap}>
          <table className={`${tableCls} min-w-[820px]`}>
            <thead>
              <tr>
                <th scope="col" className={thCls}>Instituição</th>
                <th scope="col" className={thCls}>Situação</th>
                <th scope="col" className={thCls}>Plano</th>
                <th scope="col" className={`${thCls} text-right`}>Alunos</th>
                <th scope="col" className={`${thCls} text-right`}>Mês</th>
                <th scope="col" className={thCls}>Cobrança</th>
                <th scope="col" className={`${thCls} text-right`}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const u = usage.get(r.id);
                const st = STAGE[stageOf(r)];
                const inv = INVOICE[r.invoice];
                return (
                  <tr key={r.id} className={trCls}>
                    <td className={`${tdCls} py-2`}>
                      <Link href={`/master/${r.slug}`} className="flex min-h-11 flex-col justify-center text-ink no-underline hover:text-ink">
                        <span className="text-[15px] font-semibold underline decoration-line-strong underline-offset-[3px]">{r.name}</span>
                        <span className="text-[13px] text-ink-subtle">{r.slug}.{root}</span>
                      </Link>
                    </td>
                    <td className={tdCls}><Tag tone={st.tone} icon={st.icon}>{st.label}</Tag></td>
                    <td className={`${tdCls} text-ink-muted`}>{r.plan ?? "Sem plano"}</td>
                    <td className={`${tdCls} text-right tabular-nums`}>{(u?.students ?? 0).toLocaleString("pt-BR")}</td>
                    <td className={`${tdCls} text-right whitespace-nowrap tabular-nums`}>{u?.month ? formatBRL(u.month) : "–"}</td>
                    <td className={tdCls}>
                      <span className={`inline-flex items-center gap-1 text-[13px] font-semibold whitespace-nowrap ${{ ok: "text-success", warn: "text-warning", bad: "text-danger", muted: "text-ink-subtle", brand: "text-brand-ink" }[inv.tone]}`}>
                        <Icon name={inv.icon} size={16} />
                        {inv.label}
                      </span>
                    </td>
                    <td className={`${tdCls} py-1 text-right`}>
                      <SupportButton name={r.name} href={tenantPath(r.slug, "/admin")} disabled={r.status === "suspended"} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
