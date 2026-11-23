import { cache } from "react";
import { withContext } from "@/lib/db";
import { requireMember } from "@/lib/guards";
import { studentNav } from "@/lib/menu";
import { unreadCount } from "@/lib/services/communication";
import { getEnabledFeatures, getLabels } from "@/lib/tenant";

/**
 * Contexto da área do aluno: quem é, o que está ligado e os contadores da navegação.
 * Em cache por requisição: o layout e a página chamam sem repetir consultas.
 */
export const loadStudent = cache(async (slug: string, returnTo: string) => {
  const m = await requireMember(slug, returnTo);
  const [labels, enabled] = await Promise.all([getLabels(m.tenant.id), getEnabledFeatures(m.tenant.id)]);
  const extra = await withContext({ tenantId: m.tenant.id, userId: m.userId }, async (c) => {
    const unread = await unreadCount(c, m.userId);
    const openPayments = (
      await c.query<{ n: number }>(
        `select count(*)::int as n from payments p join enrollments e on e.id = p.enrollment_id
         where e.user_id = $1 and e.status = 'active' and p.status in ('pending', 'overdue')`,
        [m.userId],
      )
    ).rows[0].n;
    const course = (
      await c.query<{ program: string; cohort: string }>(
        `select p.name as program, co.name as cohort from enrollments e
         join cohorts co on co.tenant_id = e.tenant_id and co.id = e.cohort_id
         join programs p on p.tenant_id = co.tenant_id and p.id = co.program_id
         where e.user_id = $1 and e.status = 'active' order by (e.stage = 'released') desc, e.created_at desc limit 1`,
        [m.userId],
      )
    ).rows[0] ?? null;
    return { unread, openPayments, course };
  });
  const nav = studentNav(labels, enabled, { staff: m.staff, unread: extra.unread, openPayments: extra.openPayments });
  return { ...m, labels, enabled, ...extra, nav };
});

export type StudentContext = Awaited<ReturnType<typeof loadStudent>>;
