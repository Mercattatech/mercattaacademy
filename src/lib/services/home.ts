import type { PoolClient } from "pg";
import { dayToDate, shortDate } from "../format";
import { agendaForUser, type AgendaItem } from "./lessons";

/** "Vence hoje", "Vence amanhã, 21 nov" ou "Vence em 3 dias, 21 nov". */
export function dueText(day: string): string {
  const due = dayToDate(day);
  const today = dayToDate(new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date()));
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return `Venceu em ${shortDate(due)}`;
  if (days === 0) return "Vence hoje";
  if (days === 1) return `Vence amanhã, ${shortDate(due)}`;
  return `Vence em ${days} dias, ${shortDate(due)}`;
}

export type HomePending =
  | { kind: "document"; title: string; detail: string }
  | { kind: "payment"; title: string; detail: string; overdue: boolean; invoiceUrl: string | null };

/** Próxima aula e pendências do aluno (documento recusado, parcela em aberto). */
export async function studentHome(c: PoolClient, userId: string): Promise<{ next: AgendaItem | null; pending: HomePending[] }> {
  const now = Date.now();
  const next =
    (await agendaForUser(c, userId)).find((l) => l.status !== "canceled" && l.status !== "ended" && l.starts_at.getTime() + l.duration_minutes * 60_000 >= now) ?? null;

  const docs = (await c.query<{ name: string; rejected_reason: string }>(
    `select dt.name, d.rejected_reason
     from student_documents d
     join enrollments e on e.id = d.enrollment_id
     join document_types dt on dt.id = d.document_type_id
     where e.user_id = $1 and e.status = 'active' and d.status = 'pending' and d.rejected_reason is not null
     order by d.updated_at desc`, [userId],
  )).rows;

  const pays = (await c.query<{ installment_no: number; installments: number; amount_cents: number; status: string; due_date: string; invoice_url: string | null }>(
    `select p.installment_no, p.installments, p.amount_cents, p.status, p.due_date::text as due_date, p.invoice_url
     from payments p join enrollments e on e.id = p.enrollment_id
     where e.user_id = $1 and e.status = 'active' and p.status in ('pending', 'overdue')
     order by p.due_date nulls last limit 3`, [userId],
  )).rows;

  const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const pending: HomePending[] = [
    ...docs.map((d) => ({ kind: "document" as const, title: `Reenviar ${d.name.toLowerCase()}`, detail: `Recusado · ${d.rejected_reason}` })),
    ...pays.map((p) => {
      return {
        kind: "payment" as const,
        title: `${p.installments > 1 ? `Parcela ${p.installment_no} de ${p.installments}` : "Pagamento"} · ${brl(p.amount_cents)}`,
        detail: p.status === "overdue" ? `Em atraso${p.due_date ? ` desde ${shortDate(dayToDate(p.due_date))}` : ""}` : p.due_date ? dueText(p.due_date) : "A pagar",
        overdue: p.status === "overdue",
        invoiceUrl: p.invoice_url,
      };
    }),
  ];
  return { next, pending };
}
