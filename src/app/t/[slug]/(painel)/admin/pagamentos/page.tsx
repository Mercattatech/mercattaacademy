import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { btnOutline, btnPrimary, btnText, EmptyBox, inputCls, Kpi, labelCls, PageHead, Pill, Tag, tableCls, tableWrap, tdCls, thCls, trCls, type Tone } from "@/components/admin-ui";
import { Icon } from "@/components/icon";
import { withContext } from "@/lib/db";
import { shortDate } from "@/lib/format";
import { can, requireStaff } from "@/lib/guards";
import { formatBRL } from "@/lib/services/billing";
import { PAYMENT_LABELS, type PaymentStatus } from "@/lib/services/payments";
import { savePaymentSettingsAction } from "./actions";
import { cx } from "@/components/ui";

type Row = {
  id: string;
  student: string;
  program: string;
  cohort: string;
  installment_no: number;
  installments: number;
  amount_cents: number;
  status: PaymentStatus;
  due_date: string | null;
  invoice_url: string | null;
};

const TZ = "America/Sao_Paulo";
const STATUS_TAG: Record<PaymentStatus, { tone: Tone; label: string; icon: "checkCircle" | "clock" | "error" | "cancel" }> = {
  confirmed: { tone: "ok", label: "Pago", icon: "checkCircle" },
  pending: { tone: "muted", label: "A vencer", icon: "clock" },
  overdue: { tone: "bad", label: "Atrasado", icon: "error" },
  refunded: { tone: "warn", label: "Estornado", icon: "cancel" },
  canceled: { tone: "muted", label: "Cancelado", icon: "cancel" },
};

/** Pagamentos (protótipo): três números do mês e a tabela de cobranças. Conexão com o Asaas fica recolhida no fim. */
export default async function PaymentsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ situacao?: string }> }) {
  const { slug } = await params;
  const { situacao } = await searchParams;
  const ctx = await requireStaff(slug, ["financeiro", "secretaria"], `/t/${slug}/admin/pagamentos`);
  const filter = situacao && situacao in PAYMENT_LABELS ? (situacao as PaymentStatus) : null;
  const isAdmin = can(ctx);
  const base = `/t/${slug}/admin/pagamentos`;

  const { settings, rows, kpi, counts } = await withContext({ tenantId: ctx.tenant.id, userId: ctx.userId }, async (c) => ({
    settings: (await c.query<{ environment: string; webhook_token: string }>("select environment, webhook_token from payment_settings")).rows[0],
    kpi: (
      await c.query<{ paid: number; paid_n: number; soon: number; soon_n: number; late: number; late_n: number }>(
        `select coalesce(sum(amount_cents) filter (where status = 'confirmed' and date_trunc('month', coalesce(paid_at, updated_at) at time zone '${TZ}') = date_trunc('month', now() at time zone '${TZ}')), 0)::int as paid,
                count(*) filter (where status = 'confirmed' and date_trunc('month', coalesce(paid_at, updated_at) at time zone '${TZ}') = date_trunc('month', now() at time zone '${TZ}'))::int as paid_n,
                coalesce(sum(amount_cents) filter (where status = 'pending' and due_date between (now() at time zone '${TZ}')::date and (now() at time zone '${TZ}')::date + 7), 0)::int as soon,
                count(*) filter (where status = 'pending' and due_date between (now() at time zone '${TZ}')::date and (now() at time zone '${TZ}')::date + 7)::int as soon_n,
                coalesce(sum(amount_cents) filter (where status = 'overdue'), 0)::int as late,
                count(*) filter (where status = 'overdue')::int as late_n
         from payments`,
      )
    ).rows[0],
    counts: (await c.query<{ status: PaymentStatus; n: number }>("select status, count(*)::int as n from payments group by status")).rows,
    rows: (
      await c.query<Row>(
        `select pay.id, u.name as student, pr.name as program, co.name as cohort, pay.installment_no, pay.installments,
                pay.amount_cents, pay.status, pay.due_date::text, pay.invoice_url
         from payments pay join enrollments e on e.tenant_id = pay.tenant_id and e.id = pay.enrollment_id
         join "user" u on u.id = e.user_id join cohorts co on co.tenant_id = e.tenant_id and co.id = e.cohort_id
         join programs pr on pr.tenant_id = co.tenant_id and pr.id = co.program_id
         where ($1::text is null or pay.status = $1)
         order by (pay.status = 'overdue') desc, pay.due_date desc nulls last, pay.created_at desc limit 200`,
        [filter],
      )
    ).rows,
  }));

  const root = process.env.ROOT_DOMAIN ?? "localhost:3000";
  const webhookUrl = `${root.startsWith("localhost") ? "http" : "https"}://${root}/api/webhooks/asaas/${slug}`;
  const month = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, month: "long", year: "numeric" }).format(new Date());
  const parcelas = (n: number) => `${n} ${n === 1 ? "parcela" : "parcelas"}`;
  const total = counts.reduce((a, x) => a + x.n, 0);
  const brl = (cents: number) => formatBRL(cents).replace(/,00$/, "");

  return (
    <div className="flex flex-col gap-6">
      <PageHead
        title="Pagamentos"
        sub={month.charAt(0).toUpperCase() + month.slice(1)}
        tag={!settings ? <Tag tone="warn" icon="warning">Asaas não conectado</Tag> : undefined}
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <Kpi label="Recebido no mês" value={brl(kpi.paid)} foot={parcelas(kpi.paid_n)} />
        <Kpi label="A vencer em 7 dias" value={brl(kpi.soon)} foot={parcelas(kpi.soon_n)} tone={kpi.soon_n ? "warn" : undefined} />
        <Kpi label="Atrasado" value={brl(kpi.late)} foot={parcelas(kpi.late_n)} tone={kpi.late_n ? "bad" : undefined} />
      </div>

      <nav aria-label="Situação" className="flex flex-wrap gap-1.5">
        <Pill href={base} active={!filter} label="Todas" count={total} />
        {(["overdue", "pending", "confirmed", "refunded", "canceled"] as PaymentStatus[]).map((k) => {
          const n = counts.find((x) => x.status === k)?.n ?? 0;
          return n || filter === k ? <Pill key={k} href={`${base}?situacao=${k}`} active={filter === k} label={STATUS_TAG[k].label} count={n} /> : null;
        })}
      </nav>

      {rows.length === 0 ? (
        <EmptyBox icon="payments" title={filter ? "Nenhuma cobrança nesta situação" : "Nenhuma cobrança ainda"} action={filter ? <Link href={base} className={btnOutline}>Ver todas</Link> : undefined}>
          {filter ? undefined : "As cobranças aparecem aqui quando o aluno chega à etapa de pagamento."}
        </EmptyBox>
      ) : (
        <div className={tableWrap}>
          <table className={tableCls}>
            <thead>
              <tr>
                <th scope="col" className={thCls}>Aluno</th>
                <th scope="col" className={thCls}>Cobrança</th>
                <th scope="col" className={thCls}>Valor</th>
                <th scope="col" className={thCls}>Vencimento</th>
                <th scope="col" className={thCls}>Situação</th>
                <th scope="col" className={`${thCls} text-right`}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const t = STATUS_TAG[r.status];
                return (
                  <tr key={r.id} className={trCls}>
                    <td className={tdCls}>
                      <strong className="font-semibold">{r.student}</strong>
                      <br />
                      <span className="text-[13px] text-ink-subtle">{r.program} · {r.cohort}</span>
                    </td>
                    <td className={`${tdCls} whitespace-nowrap`}>{r.installments > 1 ? `Parcela ${r.installment_no} de ${r.installments}` : "À vista"}</td>
                    <td className={`${tdCls} font-semibold whitespace-nowrap tabular-nums`}>{formatBRL(r.amount_cents)}</td>
                    <td className={`${tdCls} whitespace-nowrap text-ink-muted`}>{r.due_date ? shortDate(`${r.due_date}T12:00:00`) : "-"}</td>
                    <td className={tdCls}><Tag tone={t.tone} icon={t.icon}>{t.label}</Tag></td>
                    <td className={`${tdCls} text-right`}>
                      {r.invoice_url ? (
                        <a href={r.invoice_url} target="_blank" rel="noreferrer" className={btnText}>Ver cobrança</a>
                      ) : (
                        <span className="px-2.5 text-[13px] text-ink-subtle">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {isAdmin && (
        <details className="group rounded-2xl border border-line bg-surface" open={!settings}>
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 [&::-webkit-details-marker]:hidden">
            <Icon name="link" size={20} className="text-ink-muted" />
            <span className="flex-1 text-base font-semibold">Conexão com o Asaas</span>
            {settings ? <Tag tone="ok">Conectado · {settings.environment === "production" ? "Produção" : "Sandbox"}</Tag> : <Tag tone="warn" icon="warning">Não configurado</Tag>}
            <Icon name="chevronRight" size={20} className="text-ink-subtle transition-transform group-open:rotate-90" />
          </summary>
          <div className="flex flex-col gap-6 border-t border-line px-5 py-5">
            <ActionForm
              action={savePaymentSettingsAction.bind(null, slug)}
              submitLabel={settings ? "Trocar chave" : "Conectar ao Asaas"}
              pendingLabel="Testando conexão..."
              submitClassName={cx(btnPrimary, "self-start")}
              className="flex max-w-xl flex-col gap-4"
            >
              <label className={labelCls}>
                Chave de API do Asaas
                <input name="apiKey" type="password" autoComplete="off" required className={inputCls} />
                <span className="text-[13px] font-normal text-ink-subtle">Fica guardada cifrada e não aparece de novo. No Asaas: Integrações, Chaves de API.</span>
              </label>
              <label className={labelCls}>
                Ambiente
                <select name="environment" defaultValue={settings?.environment ?? "sandbox"} className={inputCls}>
                  <option value="sandbox">Sandbox (teste, sem dinheiro de verdade)</option>
                  <option value="production">Produção</option>
                </select>
              </label>
            </ActionForm>

            {settings && (
              <div className="flex flex-col gap-3 border-t border-line pt-5">
                <h3 className="m-0 font-sans text-base font-semibold">Avisos automáticos de pagamento (webhook)</h3>
                <p className="m-0 text-sm text-ink-muted">No Asaas, em Integrações, Webhooks, crie um webhook de cobranças com estes dados. É assim que o acesso do aluno é liberado sozinho.</p>
                <dl className="m-0 grid gap-3 text-sm">
                  <div><dt className="font-semibold">URL</dt><dd className="m-0"><code className="break-all rounded bg-sunken px-1.5 py-0.5">{webhookUrl}</code></dd></div>
                  <div><dt className="font-semibold">Token de autenticação</dt><dd className="m-0"><code className="break-all rounded bg-sunken px-1.5 py-0.5">{settings.webhook_token}</code></dd></div>
                  <div><dt className="font-semibold">Eventos</dt><dd className="m-0">Cobrança confirmada, recebida, vencida, estornada e removida. Versão da API: v3.</dd></div>
                </dl>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
