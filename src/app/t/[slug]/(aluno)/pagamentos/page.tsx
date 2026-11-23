import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Icon } from "@/components/icon";
import { BackHeader, Card, Chip, Empty, primaryBtn, Screen, SectionTitle, StatusText } from "@/components/student-ui";
import { withContext } from "@/lib/db";
import { dayToDate, shortDate, weekdayDate } from "@/lib/format";
import { formatBRL } from "@/lib/services/billing";
import { dueText } from "@/lib/services/home";
import type { PaymentStatus } from "@/lib/services/payments";
import { getSession } from "@/lib/session";
import { resolveTenant } from "@/lib/tenant";

type Pay = {
  id: string; installment_no: number; installments: number; amount_cents: number; status: PaymentStatus;
  due_date: string | null; paid_at: Date | null; invoice_url: string | null; program: string;
};

const label = (p: Pay) => (p.installments > 1 ? `Parcela ${p.installment_no} de ${p.installments}` : "Pagamento à vista");

/** Próxima cobrança e histórico (tela 11 do protótipo). */
export default async function PaymentsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await resolveTenant(slug);
  if (!tenant) notFound();
  const session = await getSession();
  if (!session) redirect(`/login?voltar=${encodeURIComponent(`/t/${slug}/pagamentos`)}`);

  const pays = await withContext({ tenantId: tenant.id, userId: session.user.id }, async (c) =>
    (
      await c.query<Pay>(
        `select p.id, p.installment_no, p.installments, p.amount_cents, p.status, p.due_date::text as due_date, p.paid_at, p.invoice_url, pr.name as program
         from payments p join enrollments e on e.id = p.enrollment_id
         join cohorts co on co.tenant_id = e.tenant_id and co.id = e.cohort_id
         join programs pr on pr.tenant_id = co.tenant_id and pr.id = co.program_id
         where e.user_id = $1 and e.status <> 'canceled'
         order by p.due_date nulls last, p.installment_no`,
        [session.user.id],
      )
    ).rows,
  );

  const open = pays.filter((p) => p.status === "pending" || p.status === "overdue");
  const next = open[0];
  const history = pays.filter((p) => p !== next).reverse();
  const programs = new Set(pays.map((p) => p.program));

  return (
    <>
      <BackHeader href={`/t/${slug}/mais`} title="Pagamentos" />
      <Screen>
        {pays.length === 0 && (
          <Empty icon="payments" title="Nenhuma cobrança">
            Quando sua matrícula chegar à etapa de pagamento, as cobranças aparecem aqui.{" "}
            <Link href={`/t/${slug}/inscricoes`} className="font-semibold text-brand-ink underline">Ver matrícula</Link>
          </Empty>
        )}

        {next && (
          <Card className="flex flex-col gap-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-ink-muted">{label(next)}</span>
              {next.status === "overdue" ? (
                <Chip tone="danger" icon="warning">Em atraso</Chip>
              ) : (
                <Chip tone="warning" icon="clock">{next.due_date ? dueText(next.due_date).replace(/,.*$/, "") : "A pagar"}</Chip>
              )}
            </div>
            <div>
              <div className="font-display text-4xl font-semibold leading-[1.1] tracking-[-0.02em]">{formatBRL(next.amount_cents)}</div>
              <div className="mt-1 text-sm text-ink-muted">
                {next.due_date ? `Vencimento ${weekdayDate(dayToDate(next.due_date))}` : "Sem data de vencimento"}
                {programs.size > 1 ? ` · ${next.program}` : ""}
              </div>
            </div>
            {next.invoice_url ? (
              <>
                <a href={next.invoice_url} target="_blank" rel="noreferrer" className={primaryBtn}>
                  <Icon name="payments" />
                  Pagar agora
                </a>
                <p className="m-0 text-center text-[13px] text-ink-subtle">Abre a cobrança com Pix, boleto ou cartão. Pix é confirmado em poucos minutos.</p>
              </>
            ) : (
              <p className="m-0 text-sm text-ink-muted">A cobrança ainda não foi gerada. Se precisar, fale com a secretaria pelo Atendimento.</p>
            )}
          </Card>
        )}

        {open.length > 1 && (
          <p className="m-0 -mt-2 text-sm text-ink-muted">Você tem mais {open.length - 1} cobrança{open.length > 2 ? "s" : ""} em aberto no histórico abaixo.</p>
        )}

        {history.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <SectionTitle>Histórico</SectionTitle>
            <div className="mt-1 flex flex-col">
              {history.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 border-b border-line py-3 last:border-b-0">
                  <span className="min-w-0">
                    <span className="text-[15px] font-semibold">{label(p)}</span>
                    <br />
                    <span className="text-[13px] text-ink-muted">
                      {formatBRL(p.amount_cents)} · {p.paid_at ? shortDate(p.paid_at) : p.due_date ? shortDate(dayToDate(p.due_date)) : "sem data"}
                    </span>
                  </span>
                  {p.status === "confirmed" ? (
                    <StatusText tone="success" icon="checkCircle">Pago</StatusText>
                  ) : p.status === "overdue" ? (
                    p.invoice_url ? <a href={p.invoice_url} target="_blank" rel="noreferrer" className="text-[13px] font-semibold text-danger underline">Em atraso · pagar</a> : <StatusText tone="danger" icon="warning">Em atraso</StatusText>
                  ) : p.status === "pending" ? (
                    p.invoice_url ? <a href={p.invoice_url} target="_blank" rel="noreferrer" className="text-[13px] font-semibold text-brand-ink underline">A pagar</a> : <StatusText tone="warning" icon="clock">A pagar</StatusText>
                  ) : (
                    <StatusText tone="muted">{p.status === "refunded" ? "Estornado" : "Cancelado"}</StatusText>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </Screen>
    </>
  );
}
