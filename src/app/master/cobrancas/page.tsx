import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { btnPrimary, btnText, EmptyBox, PageHead, Tag, tableCls, tableWrap, tdCls, thCls, trCls } from "@/components/admin-ui";
import { withContext } from "@/lib/db";
import { formatDay } from "@/lib/format";
import { requireMaster } from "@/lib/guards";
import { formatBRL } from "@/lib/services/billing";
import { generateAllInvoicesAction, markInvoicePaidAction } from "../actions";
import { INVOICE } from "../data";

type Row = { id: string; slug: string; name: string; courses: number; students: number; amount_cents: number; status: "pending" | "paid" | "overdue"; due_date: string; late: boolean };

const monthLabel = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", month: "long", year: "numeric" });

/** Cobranças da plataforma no mês (protótipo): tabela com composição, situação e total. */
export default async function MasterBillingPage() {
  const { userId } = await requireMaster("/master/cobrancas");

  const { rows, missing } = await withContext({ userId, master: true }, async (c) => ({
    rows: (
      await c.query<Row>(
        `select i.id, t.slug, t.name, i.courses, i.students, i.amount_cents, i.status, i.due_date::text,
                (i.status in ('pending', 'overdue') and i.due_date < current_date) as late
         from platform_invoices i join tenants t on t.id = i.tenant_id
         where i.period_start = date_trunc('month', now())::date and i.status <> 'canceled' and t.status <> 'deleted'
         order by (i.status <> 'paid' and i.due_date < current_date) desc, t.name`,
      )
    ).rows,
    missing: (
      await c.query<{ n: number }>(
        `select count(*)::int as n from tenants t
         where t.status = 'active' and t.plan_id is not null
           and not exists (select 1 from platform_invoices i where i.tenant_id = t.id
                           and i.period_start = date_trunc('month', now())::date and i.status <> 'canceled')`,
      )
    ).rows[0].n,
  }));

  const total = rows.reduce((n, r) => n + r.amount_cents, 0);
  const received = rows.filter((r) => r.status === "paid").reduce((n, r) => n + r.amount_cents, 0);
  const month = monthLabel.format(new Date());

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        title="Cobranças"
        sub={`${month.charAt(0).toUpperCase() + month.slice(1)} · vencimento dia 10 do mês seguinte`}
        action={
          missing > 0 ? (
            <ActionForm
              action={generateAllInvoicesAction}
              submitLabel={missing === 1 ? "Gerar a cobrança que falta" : `Gerar as ${missing} cobranças que faltam`}
              pendingLabel="Gerando..."
              submitClassName={btnPrimary}
              className="flex flex-col items-end gap-1.5"
            />
          ) : undefined
        }
      />

      {rows.length === 0 ? (
        <EmptyBox icon="receipt" title="Nenhuma cobrança gerada neste mês">
          Use o botão acima para gerar a cobrança de todas as instituições ativas com plano.
        </EmptyBox>
      ) : (
        <div className={tableWrap}>
          <table className={`${tableCls} min-w-[680px]`}>
            <thead>
              <tr>
                <th scope="col" className={thCls}>Instituição</th>
                <th scope="col" className={thCls}>Composição</th>
                <th scope="col" className={`${thCls} text-right`}>Valor</th>
                <th scope="col" className={thCls}>Situação</th>
                <th scope="col" className={`${thCls} text-right`}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const t = INVOICE[r.status === "paid" ? "paid" : r.late ? "late" : "open"];
                return (
                  <tr key={r.id} className={trCls}>
                    <td className={`${tdCls} font-semibold`}>
                      <Link href={`/master/${r.slug}`} className="text-ink no-underline hover:text-ink hover:underline">{r.name}</Link>
                    </td>
                    <td className={`${tdCls} text-ink-muted`}>
                      {r.courses} {r.courses === 1 ? "curso" : "cursos"} · {r.students.toLocaleString("pt-BR")} {r.students === 1 ? "aluno" : "alunos"}
                    </td>
                    <td className={`${tdCls} text-right whitespace-nowrap tabular-nums`}>{formatBRL(r.amount_cents)}</td>
                    <td className={tdCls}>
                      <span className="flex flex-col items-start gap-0.5">
                        <Tag tone={t.tone} icon={t.icon}>{t.label}</Tag>
                        {r.status !== "paid" && <span className="text-xs text-ink-subtle">{r.late ? "venceu" : "vence"} {formatDay(r.due_date)}</span>}
                      </span>
                    </td>
                    <td className={`${tdCls} py-1 text-right`}>
                      {r.status !== "paid" && (
                        <ActionForm action={markInvoicePaidAction.bind(null, r.slug, r.id)} submitLabel="Marcar como paga" pendingLabel="Salvando..." submitClassName={btnText} className="flex flex-col items-end" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-line-strong">
                <td colSpan={2} className="py-3.5 pl-4 font-bold">Total do mês</td>
                <td className="px-2 py-3.5 text-right font-bold whitespace-nowrap tabular-nums">{formatBRL(total)}</td>
                <td colSpan={2} className="py-3.5 pr-4 pl-2 text-ink-muted">{formatBRL(received)} recebidos</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
