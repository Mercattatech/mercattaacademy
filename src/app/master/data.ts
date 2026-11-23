import type { PoolClient } from "pg";
import type { IconName } from "@/components/icon";
import type { Tone } from "@/components/admin-ui";
import { formatDay } from "@/lib/format";
import { formatBRL, type Plan } from "@/lib/services/billing";

/**
 * Situação mostrada no master. "Em implantação" não é um estado guardado:
 * é a instituição ativa cujo administrador ainda não aceitou o convite.
 */
export type Stage = "active" | "implant" | "suspended";
export const STAGE: Record<Stage, { tone: Tone; label: string; icon: IconName }> = {
  active: { tone: "ok", label: "Ativa", icon: "checkCircle" },
  implant: { tone: "brand", label: "Em implantação", icon: "wrench" },
  suspended: { tone: "warn", label: "Suspensa", icon: "pause" },
};

export type InvoiceState = "paid" | "open" | "late" | "none";
export const INVOICE: Record<InvoiceState, { tone: Tone; label: string; icon: IconName }> = {
  paid: { tone: "ok", label: "Paga", icon: "checkCircle" },
  open: { tone: "warn", label: "Em aberto", icon: "clock" },
  late: { tone: "bad", label: "Em atraso", icon: "error" },
  none: { tone: "muted", label: "Não gerada", icon: "minus" },
};

export type TenantRow = {
  id: string;
  slug: string;
  name: string;
  status: "active" | "suspended";
  suspended_reason: string | null;
  created_at: Date;
  plan: string | null;
  plan_values: Plan | null;
  has_admin: boolean;
  invite_email: string | null;
  invite_sent: Date | null;
  invoice: InvoiceState;
};

export const stageOf = (t: Pick<TenantRow, "status" | "has_admin">): Stage => (t.status === "suspended" ? "suspended" : t.has_admin ? "active" : "implant");

export async function listTenants(c: PoolClient): Promise<TenantRow[]> {
  return (
    await c.query<TenantRow>(`
      select t.id, t.slug, t.name, t.status, t.suspended_reason, t.created_at, p.name as plan,
             case when p.id is null then null else
               jsonb_build_object('price_per_course_cents', p.price_per_course_cents,
                                  'included_students', p.included_students,
                                  'extra_student_cents', p.extra_student_cents) end as plan_values,
             exists (select 1 from memberships m where m.tenant_id = t.id and m.role = 'admin') as has_admin,
             (select i.email from invites i where i.tenant_id = t.id and i.role = 'admin' and i.accepted_at is null and i.revoked_at is null
               order by i.created_at desc limit 1) as invite_email,
             (select i.created_at from invites i where i.tenant_id = t.id and i.role = 'admin' and i.accepted_at is null and i.revoked_at is null
               order by i.created_at desc limit 1) as invite_sent,
             coalesce((select case when i.status = 'paid' then 'paid' when i.due_date < current_date then 'late' else 'open' end
                from platform_invoices i
               where i.tenant_id = t.id and i.period_start = date_trunc('month', now())::date and i.status <> 'canceled'
               order by i.created_at desc limit 1), 'none') as invoice
      from tenants t left join plans p on p.id = t.plan_id
      where t.status <> 'deleted' order by t.name`)
  ).rows;
}

export type Alert = { key: string; kind: string; icon: IconName; tone: "bad" | "warn"; title: string; body: string; slug: string; cta?: { href: string; label: string } };

/** Alertas da visão geral: cobrança da plataforma vencida e instituição parada na implantação. */
export async function masterAlerts(c: PoolClient, tenants?: TenantRow[]): Promise<Alert[]> {
  const late = (
    await c.query<{ id: string; slug: string; name: string; amount_cents: number; due_date: string; days: number }>(
      `select i.id, t.slug, t.name, i.amount_cents, i.due_date::text, (current_date - i.due_date)::int as days
       from platform_invoices i join tenants t on t.id = i.tenant_id
       where i.status in ('pending', 'overdue') and i.due_date < current_date and t.status <> 'deleted'
       order by i.due_date`,
    )
  ).rows;
  const all = tenants ?? (await listTenants(c));
  const days = (d: Date) => Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
  return [
    ...late.map((i) => ({
      key: `late-${i.id}`,
      kind: "PAGAMENTO",
      icon: "payments" as const,
      tone: "bad" as const,
      title: `Cobrança da ${i.name} em atraso há ${i.days} ${i.days === 1 ? "dia" : "dias"}`,
      body: `Valor de ${formatBRL(i.amount_cents)}, vencido em ${formatDay(i.due_date)}.`,
      slug: i.slug,
      cta: { href: "/master/cobrancas", label: "Ver cobranças" },
    })),
    ...all
      // Só depois de 3 dias: logo após o cadastro, esperar o aceite é normal.
      .filter((t) => stageOf(t) === "implant" && days(t.created_at) >= 3)
      .map((t) => {
        const n = days(t.created_at);
        return {
          key: `impl-${t.id}`,
          kind: "IMPLANTAÇÃO",
          icon: "mail" as const,
          tone: "warn" as const,
          title: `${t.name} em implantação ${n === 0 ? "desde hoje" : `há ${n} ${n === 1 ? "dia" : "dias"}`}`,
          body: t.invite_email ? `O administrador (${t.invite_email}) ainda não aceitou o convite.` : "Nenhum administrador e nenhum convite em aberto.",
          slug: t.slug,
          cta: { href: `/master/${t.slug}#administradores`, label: t.invite_email ? "Reenviar convite" : "Convidar administrador" },
        };
      }),
  ];
}

export const rootDomain = () => process.env.ROOT_DOMAIN ?? "localhost:3000";
