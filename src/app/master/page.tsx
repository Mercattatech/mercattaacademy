import Link from "next/link";
import { btnOutline, btnText, PageHead } from "@/components/admin-ui";
import { Icon } from "@/components/icon";
import { withContext } from "@/lib/db";
import { sinceText } from "@/lib/format";
import { requireMaster } from "@/lib/guards";
import { courseUsage } from "@/lib/services/academic";
import { formatBRL } from "@/lib/services/billing";
import { listTenants, masterAlerts, stageOf } from "./data";
import { cx, Notice } from "@/components/ui";

type InvoiceRow = { id: string; slug: string; name: string; amount_cents: number; status: string };
type ActivityRow = { created_at: Date; action: string; tenant_name: string | null; actor: string | null; feature: string | null };

const ACTIONS: Record<string, string> = {
  tenant_created: "cadastrou",
  tenant_updated: "atualizou os dados de",
  tenant_suspended: "suspendeu",
  tenant_reactivated: "reativou",
  tenant_deleted: "excluiu",
  feature_on: "ligou",
  feature_off: "desligou",
  invoice_created: "gerou a cobrança do mês de",
  invoice_paid: "registrou o pagamento de",
  support_access: "entrou como suporte em",
  plan_updated: "alterou os valores do plano",
};

const TZ = "America/Sao_Paulo";
const monthLabel = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, month: "long", year: "numeric" });
const brl0 = (cents: number) => formatBRL(cents).replace(/,00$/, "");

/** Visão geral do master (protótipo): quatro números, alertas, receita por instituição e atividade. */
export default async function MasterOverviewPage() {
  const { userId } = await requireMaster();

  const data = await withContext({ userId, master: true }, async (c) => {
    const tenants = await listTenants(c);
    const alerts = await masterAlerts(c, tenants);
    const month = (
      await c.query<InvoiceRow>(
        `select i.id, t.slug, t.name, i.amount_cents, i.status
         from platform_invoices i join tenants t on t.id = i.tenant_id
         where i.period_start = date_trunc('month', now())::date and i.status <> 'canceled' and t.status <> 'deleted'`,
      )
    ).rows;
    const open = (
      await c.query<{ n: number; late: number }>(
        `select count(*)::int as n, count(*) filter (where due_date < current_date)::int as late
         from platform_invoices i join tenants t on t.id = i.tenant_id
         where i.status in ('pending', 'overdue') and t.status <> 'deleted'`,
      )
    ).rows[0];
    // Só ações da equipe da plataforma e do sistema sobre as instituições (não o dia a dia de cada uma).
    const activity = (
      await c.query<ActivityRow>(
        `select a.created_at, a.action, t.name as tenant_name, u.name as actor, f.name as feature
         from audit_log a left join tenants t on t.id = a.tenant_id left join "user" u on u.id = a.actor_user_id
         left join features f on a.entity = 'feature' and f.key = a.entity_id::text
         where a.action = any($1::text[])
         order by a.created_at desc, a.id desc limit 60`,
        [Object.keys(ACTIONS)],
      )
    ).rows
      // O acesso de suporte é registrado a cada página aberta: junta as repetidas seguidas.
      .filter((a, i, all) => i === 0 || !(a.action === all[i - 1].action && a.tenant_name === all[i - 1].tenant_name && a.actor === all[i - 1].actor))
      .slice(0, 6);
    return { tenants, alerts, month, open, activity };
  });

  const stages = data.tenants.map((t) => ({ t, s: stageOf(t) }));
  const active = stages.filter((x) => x.s === "active").map((x) => x.t);
  const implant = stages.filter((x) => x.s === "implant").length;
  const suspended = stages.filter((x) => x.s === "suspended").length;

  const usages = await Promise.all(active.map((t) => withContext({ tenantId: t.id }, (c) => courseUsage(c))));
  const courses = usages.reduce((n, u) => n + u.length, 0);
  const students = usages.reduce((n, u) => n + u.reduce((m, x) => m + x.activeStudents, 0), 0);

  const revenue = data.month.reduce((n, i) => n + i.amount_cents, 0);
  const received = data.month.filter((i) => i.status === "paid").reduce((n, i) => n + i.amount_cents, 0);
  const bars = [...data.month].sort((a, b) => b.amount_cents - a.amount_cents).slice(0, 6);
  const maxBar = Math.max(1, ...bars.map((b) => b.amount_cents));
  const month = monthLabel.format(new Date());

  const subParts = [implant ? `${implant} em implantação` : "", suspended ? `${suspended} ${suspended === 1 ? "suspensa" : "suspensas"}` : ""].filter(Boolean);
  const kpis = [
    { label: "Instituições ativas", value: String(active.length), sub: subParts.join(" · ") || "nenhuma parada" },
    { label: "Alunos ativos", value: students.toLocaleString("pt-BR"), sub: `em ${courses} ${courses === 1 ? "curso publicado" : "cursos publicados"}` },
    { label: "Receita do mês", value: brl0(revenue), sub: data.month.length ? `${brl0(received)} já recebidos` : "cobranças ainda não geradas" },
  ];

  return (
    <div className="flex flex-col gap-8">
      <PageHead title="Visão geral" sub={month.charAt(0).toUpperCase() + month.slice(1)} />

      <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] overflow-hidden rounded-2xl border border-line bg-surface">
        {kpis.map((k) => (
          <div key={k.label} className="flex flex-col gap-0.5 px-5 py-4 shadow-[1px_0_0_var(--color-line),0_1px_0_var(--color-line)]">
            <dt className="order-1 text-sm text-ink-muted">{k.label}</dt>
            <dd className="order-2 m-0 font-display text-[34px] leading-[1.15] font-semibold tracking-[-0.02em]">{k.value}</dd>
            <dd className="order-3 m-0 text-[13px] text-ink-subtle">{k.sub}</dd>
          </div>
        ))}
        <div className="flex flex-col gap-0.5 px-5 py-4 shadow-[0_1px_0_var(--color-line)]">
          <dt className="order-1 text-sm text-ink-muted">Cobranças em aberto</dt>
          <dd className="order-2 m-0 font-display text-[34px] leading-[1.15] font-semibold tracking-[-0.02em]">{data.open.n}</dd>
          <dd className={`order-3 m-0 flex items-center gap-1 text-[13px] font-semibold ${data.open.late ? "text-danger" : "text-success"}`}>
            <Icon name={data.open.late ? "error" : "checkCircle"} size={16} />
            {data.open.late ? `${data.open.late} em atraso` : "nenhuma em atraso"}
          </dd>
        </div>
      </dl>

      <section aria-labelledby="alertas" className="flex flex-col gap-3">
        <h2 id="alertas" className="m-0 font-sans text-lg font-semibold">
          Alertas <span className="font-medium text-ink-subtle">· {data.alerts.length}</span>
        </h2>
        {data.alerts.length === 0 ? (
          <Notice tone="ok" title="Nenhum alerta agora.">
            Nenhuma cobrança em atraso e nenhuma implantação parada.
          </Notice>
        ) : (
          <ul className="m-0 list-none rounded-2xl border border-line bg-surface p-0">
            {data.alerts.map((a, i) => (
              <li key={a.key} className={`flex flex-wrap items-start gap-3.5 px-5 py-4 ${i ? "border-t border-line" : ""}`}>
                <span className={`flex size-10 shrink-0 items-center justify-center rounded-[12px] ${a.tone === "bad" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning"}`}>
                  <Icon name={a.icon} size={22} />
                </span>
                <span className="flex min-w-0 flex-[1_1_260px] flex-col gap-0.5">
                  <span className={`text-[13px] font-bold ${a.tone === "bad" ? "text-danger" : "text-warning"}`}>{a.kind}</span>
                  <span className="text-base font-semibold">{a.title}</span>
                  <span className="text-sm text-ink-muted">{a.body}</span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <Link href={`/master/${a.slug}`} className={cx(btnText, "h-11 px-3 text-[15px]")}>Ver instituição</Link>
                  {a.cta && <Link href={a.cta.href} className={btnOutline}>{a.cta.label}</Link>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] items-start gap-10">
        <section aria-labelledby="receita" className="flex flex-col gap-4">
          <h2 id="receita" className="m-0 font-sans text-lg font-semibold">Receita por instituição</h2>
          {bars.length === 0 ? (
            <p className="m-0 text-[15px] text-ink-muted">
              Nenhuma cobrança gerada neste mês. <Link href="/master/cobrancas" className="font-semibold text-brand-ink">Gerar em Cobranças</Link>
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
              {bars.map((b) => (
                <li key={b.id} className="flex flex-col gap-1.5">
                  <div className="flex justify-between gap-3 text-sm">
                    <Link href={`/master/${b.slug}`} className="font-semibold text-ink no-underline hover:underline">{b.name}</Link>
                    <span className="tabular-nums">{formatBRL(b.amount_cents)}</span>
                  </div>
                  <div className="h-2.5 rounded-[5px] bg-sunken" role="presentation">
                    <span className="block h-full rounded-[5px] bg-brand" style={{ width: `${Math.max(2, Math.round((b.amount_cents / maxBar) * 100))}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="atividade" className="flex flex-col gap-2">
          <h2 id="atividade" className="m-0 mb-1 font-sans text-lg font-semibold">Atividade recente</h2>
          {data.activity.length === 0 ? (
            <p className="m-0 text-[15px] text-ink-muted">Nenhuma atividade registrada ainda.</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {data.activity.map((a, i) => {
                const s = sinceText(a.created_at);
                return (
                  <li key={i} className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 border-t border-line py-2.5">
                    <span className="text-[13px] text-ink-subtle">{s.charAt(0).toUpperCase() + s.slice(1)}</span>
                    <span className="text-sm">
                      <strong className="font-semibold">{a.actor ?? "Sistema"}</strong> {ACTIONS[a.action]}
                      {a.feature ? ` ${a.feature} em` : ""}
                      {a.tenant_name && a.action !== "plan_updated" ? ` ${a.tenant_name}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
