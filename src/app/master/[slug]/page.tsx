import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { btnOutline, btnPrimary, btnText, inputCls, PageHead, Tag, tableCls, tdCls, thCls, trCls } from "@/components/admin-ui";
import { Icon } from "@/components/icon";
import { withContext } from "@/lib/db";
import { formatDay, formatMonth } from "@/lib/format";
import { requireMaster } from "@/lib/guards";
import { courseUsage } from "@/lib/services/academic";
import { estimateBilling, formatBRL } from "@/lib/services/billing";
import { tenantPath } from "@/lib/urls";
import {
  generateInvoiceAction,
  markInvoicePaidAction,
  resendAdminInviteAction,
  setStatusAction,
  updateTenantAction,
} from "../actions";
import { INVOICE, rootDomain, STAGE, stageOf, type InvoiceState } from "../data";
import { FeatureSwitches, SupportButton, SuspendDialog } from "../master-ui";
import { btn, cx, Notice } from "@/components/ui";

type Invoice = { id: string; period_start: string; amount_cents: number; status: string; due_date: string; paid_at: Date | null; courses: number; students: number; late: boolean; current: boolean };

const labelCls = "flex flex-col gap-1.5 text-sm font-semibold";
const sectionDetails = "group rounded-2xl border border-line bg-surface";
const summaryCls = "flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 [&::-webkit-details-marker]:hidden";

/** Detalhe da instituição no master (protótipo): resumo e cobranças à esquerda, recursos e situação à direita. */
export default async function MasterTenantPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ criada?: string }> }) {
  const { slug } = await params;
  const { criada } = await searchParams;
  const { userId } = await requireMaster(`/master/${slug}`);

  const data = await withContext({ userId, master: true }, async (c) => {
    const tenant = (
      await c.query(
        `select t.*, p.name as plan_name, p.price_per_course_cents, p.included_students, p.extra_student_cents
         from tenants t left join plans p on p.id = t.plan_id where t.slug = $1 and t.status <> 'deleted'`,
        [slug],
      )
    ).rows[0];
    if (!tenant) return null;
    const features = (
      await c.query<{ key: string; name: string; description: string; enabled: boolean }>(
        `select f.key, f.name, f.description, coalesce(tf.enabled, false) as enabled
         from features f left join tenant_features tf on tf.feature_key = f.key and tf.tenant_id = $1
         where f.kind = 'optional' order by f.sort_order`,
        [tenant.id],
      )
    ).rows;
    const invoices = (
      await c.query<Invoice>(
        `select id, period_start::text, amount_cents, status, due_date::text, paid_at, courses, students,
                (status in ('pending', 'overdue') and due_date < current_date) as late,
                (period_start = date_trunc('month', now())::date) as current
         from platform_invoices where tenant_id = $1 and status <> 'canceled' order by period_start desc limit 12`,
        [tenant.id],
      )
    ).rows;
    const admins = (
      await c.query<{ name: string; email: string }>(
        `select u.name, u.email from memberships m join "user" u on u.id = m.user_id where m.tenant_id = $1 and m.role = 'admin' order by u.name`,
        [tenant.id],
      )
    ).rows;
    const pendingAdmins = (
      await c.query<{ email: string; expires_at: Date }>(
        `select email, expires_at from invites where tenant_id = $1 and role = 'admin' and accepted_at is null and revoked_at is null order by created_at desc`,
        [tenant.id],
      )
    ).rows;
    return { tenant, features, invoices, admins, pendingAdmins };
  });
  if (!data) notFound();
  const { tenant, features, invoices, admins, pendingAdmins } = data;

  const usage = await withContext({ tenantId: tenant.id }, (c) => courseUsage(c));
  const estimate = estimateBilling(tenant, usage);
  const stage = stageOf({ status: tenant.status, has_admin: admins.length > 0 });
  const st = STAGE[stage];
  const suspended = tenant.status === "suspended";
  const hasCurrent = invoices.some((i) => i.current);
  const since = new Date(tenant.created_at).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" }).replace(".", "");
  const brl0 = (cents: number) => formatBRL(cents).replace(/,00$/, "");
  const invState = (i: Invoice): InvoiceState => (i.status === "paid" ? "paid" : i.late ? "late" : "open");

  return (
    <div className="flex flex-col gap-7">
      <PageHead
        crumbs={[{ href: "/master/instituicoes", label: "Instituições" }]}
        title={tenant.name}
        tag={<Tag tone={st.tone} icon={st.icon}>{st.label}</Tag>}
        sub={`${slug}.${rootDomain()} · desde ${since}`}
        action={<SupportButton primary name={tenant.name} href={tenantPath(slug, "/admin")} disabled={suspended} />}
      />

      {criada && (
        <Notice tone="ok" title={`${tenant.name} cadastrada.`}>
          Enviamos o convite para <strong>{pendingAdmins[0]?.email ?? "o administrador"}</strong>. Enquanto ele não aceitar, a instituição fica em implantação.
        </Notice>
      )}
      {suspended && (
        <Notice tone="warn" icon="pause" title="Suspensa.">
          Alunos e equipe veem um aviso e não conseguem entrar. Motivo: {tenant.suspended_reason}
        </Notice>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] items-start gap-10">
        <div className="flex flex-col gap-3">
          <h2 className="m-0 font-sans text-lg font-semibold">Resumo</h2>
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-5 gap-y-2.5 text-[15px]">
            <dt className="text-ink-muted">Administrador</dt>
            <dd className="m-0 min-w-0 break-words">{admins[0] ? `${admins[0].name} · ${admins[0].email}` : pendingAdmins[0] ? `Convite pendente · ${pendingAdmins[0].email}` : "Nenhum"}</dd>
            <dt className="text-ink-muted">Plano</dt>
            <dd className="m-0">{tenant.plan_name ?? "Sem plano"}</dd>
            <dt className="text-ink-muted">Cursos publicados</dt>
            <dd className="m-0">{estimate.lines.length}</dd>
            <dt className="text-ink-muted">Alunos ativos</dt>
            <dd className="m-0">{estimate.lines.reduce((n, l) => n + l.activeStudents, 0).toLocaleString("pt-BR")}</dd>
            <dt className="text-ink-muted">Estimativa do mês</dt>
            <dd className="m-0 font-semibold">{suspended ? "Sem cobrança enquanto suspensa" : formatBRL(estimate.totalCents)}</dd>
          </dl>

          <h2 className="mt-5 mb-0 font-sans text-lg font-semibold">Cobranças da plataforma</h2>
          <ul className="m-0 list-none p-0">
            {invoices.map((inv) => {
              const t = INVOICE[invState(inv)];
              const m = formatMonth(inv.period_start);
              return (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-3">
                  <span>
                    <strong className="font-semibold">{m.charAt(0).toUpperCase() + m.slice(1)}</strong> · {formatBRL(inv.amount_cents)}
                    <span className="block text-[13px] text-ink-subtle">
                      {inv.courses} {inv.courses === 1 ? "curso" : "cursos"} · {inv.students} alunos ·{" "}
                      {inv.status === "paid" && inv.paid_at ? `paga em ${new Date(inv.paid_at).toLocaleDateString("pt-BR", { day: "numeric", month: "short" }).replace(".", "")}` : `vence ${formatDay(inv.due_date)}`}
                    </span>
                  </span>
                  <span className="flex items-center gap-2.5">
                    <Tag tone={t.tone} icon={t.icon}>{t.label}</Tag>
                    {inv.status !== "paid" && (
                      <ActionForm action={markInvoicePaidAction.bind(null, slug, inv.id)} submitLabel="Marcar como paga" pendingLabel="Salvando..." submitClassName={btnText} className="flex items-center" />
                    )}
                  </span>
                </li>
              );
            })}
            {invoices.length === 0 && (
              <li className="border-t border-line py-3 text-sm text-ink-muted">Nenhuma cobrança ainda. A primeira é gerada quando houver curso publicado.</li>
            )}
          </ul>
          {!hasCurrent && !suspended && tenant.plan_id && (
            <ActionForm action={generateInvoiceAction.bind(null, slug)} submitLabel="Gerar cobrança deste mês" pendingLabel="Gerando..." submitClassName={cx(btnOutline, "self-start")} className="flex flex-col gap-2" />
          )}
          <details className="group border-t border-line pt-1">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-brand-ink [&::-webkit-details-marker]:hidden">
              <Icon name="chevronRight" size={18} className="transition-transform group-open:rotate-90" />
              Como o valor do mês é calculado
            </summary>
            <p className="mt-1 mb-3 text-[13px] text-ink-muted">
              Plano {tenant.plan_name}: {brl0(tenant.price_per_course_cents)} por curso publicado com até {tenant.included_students} alunos ativos, mais {brl0(tenant.extra_student_cents)} por aluno a mais.
            </p>
            <div className="overflow-x-auto rounded-[12px] border border-line">
              <table className={`${tableCls} min-w-[420px]`}>
                <thead>
                  <tr>
                    <th scope="col" className={thCls}>Curso publicado</th>
                    <th scope="col" className={`${thCls} text-right`}>Alunos</th>
                    <th scope="col" className={`${thCls} text-right`}>Excedentes</th>
                    <th scope="col" className={`${thCls} text-right`}>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {estimate.lines.map((l) => (
                    <tr key={l.programId} className={trCls}>
                      <td className={tdCls}>{l.name}</td>
                      <td className={`${tdCls} text-right tabular-nums`}>{l.activeStudents}</td>
                      <td className={`${tdCls} text-right tabular-nums`}>{l.extraStudents}</td>
                      <td className={`${tdCls} text-right tabular-nums`}>{formatBRL(l.amountCents)}</td>
                    </tr>
                  ))}
                  {estimate.lines.length === 0 && (
                    <tr className={trCls}><td colSpan={4} className={`${tdCls} text-ink-muted`}>Nenhum curso publicado: nada a cobrar.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </details>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <h2 className="m-0 font-sans text-lg font-semibold">Recursos opcionais</h2>
            <p className="mt-1 mb-0 text-sm text-ink-muted">A mudança vale no próximo carregamento da instituição.</p>
          </div>
          <FeatureSwitches slug={slug} features={features} />

          <h2 className="mt-3 mb-0 font-sans text-lg font-semibold">Situação</h2>
          {suspended ? (
            <div className="flex flex-col items-start gap-2">
              <p className="m-0 text-sm text-ink-muted">Reativar libera o acesso na hora. A ação fica na auditoria.</p>
              <ActionForm action={setStatusAction.bind(null, slug)} submitLabel="Reativar instituição" pendingLabel="Reativando..." submitClassName={btnPrimary} className="flex flex-col gap-2">
                <input type="hidden" name="status" value="active" />
              </ActionForm>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-2">
              <p className="m-0 text-sm text-ink-muted">Suspender bloqueia o acesso de alunos e equipe. Os dados são preservados.</p>
              <SuspendDialog name={tenant.name} action={setStatusAction.bind(null, slug)} />
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <details id="administradores" className={sectionDetails} open={stage === "implant"}>
          <summary className={summaryCls}>
            <Icon name="person" size={20} className="text-ink-muted" />
            <span className="flex-1 text-base font-semibold">Administradores</span>
            {pendingAdmins.length > 0 && <Tag tone="brand" icon="mail" small>Convite pendente</Tag>}
            <Icon name="chevronRight" size={20} className="text-ink-subtle transition-transform group-open:rotate-90" />
          </summary>
          <div className="flex flex-col gap-4 border-t border-line px-5 py-5">
            <ul className="m-0 list-none p-0">
              {admins.map((a) => (
                <li key={a.email} className="flex flex-wrap gap-x-2 border-b border-line py-2.5 text-[15px]">
                  <strong className="font-semibold">{a.name}</strong>
                  <span className="text-ink-muted">{a.email}</span>
                </li>
              ))}
              {pendingAdmins.map((p) => (
                <li key={p.email} className="flex flex-wrap gap-x-2 border-b border-line py-2.5 text-[15px]">
                  <strong className="font-semibold">{p.email}</strong>
                  <span className="text-ink-muted">convite em aberto até {p.expires_at.toLocaleDateString("pt-BR")}</span>
                </li>
              ))}
              {admins.length + pendingAdmins.length === 0 && <li className="py-2 text-[15px] text-ink-muted">Nenhum administrador.</li>}
            </ul>
            <ActionForm
              action={resendAdminInviteAction.bind(null, slug)}
              submitLabel={pendingAdmins.length ? "Reenviar convite" : "Enviar convite"}
              pendingLabel="Enviando..."
              submitClassName={cx(btnOutline, "self-start")}
              className="flex max-w-md flex-col gap-3"
            >
              <label className={labelCls}>
                E-mail do administrador
                <input name="email" type="email" required defaultValue={pendingAdmins[0]?.email ?? ""} className={inputCls} />
              </label>
            </ActionForm>
          </div>
        </details>

        <details className={sectionDetails}>
          <summary className={summaryCls}>
            <Icon name="settings" size={20} className="text-ink-muted" />
            <span className="flex-1 text-base font-semibold">Dados e marca</span>
            <Icon name="chevronRight" size={20} className="text-ink-subtle transition-transform group-open:rotate-90" />
          </summary>
          <div className="border-t border-line px-5 py-5">
            <ActionForm action={updateTenantAction.bind(null, slug)} submitLabel="Salvar dados" submitClassName={cx(btnPrimary, "self-start")} className="grid max-w-2xl gap-4 sm:grid-cols-2">
              <label className={labelCls}>
                Nome
                <input name="name" required defaultValue={tenant.name} className={inputCls} />
              </label>
              <label className={labelCls}>
                Cor principal
                <input name="primary" type="color" defaultValue={tenant.brand?.primary ?? "#1f4e79"} className={cx(inputCls, "p-1")} />
              </label>
              <label className={labelCls}>
                Site
                <input name="site" type="url" defaultValue={tenant.links?.site ?? ""} placeholder="https://" className={inputCls} />
              </label>
              <label className={labelCls}>
                Instagram
                <input name="instagram" type="url" defaultValue={tenant.links?.instagram ?? ""} placeholder="https://instagram.com/..." className={inputCls} />
              </label>
            </ActionForm>
          </div>
        </details>

        <details className={sectionDetails}>
          <summary className={summaryCls}>
            <Icon name="trash" size={20} className="text-danger" />
            <span className="flex-1 text-base font-semibold">Excluir instituição</span>
            <Icon name="chevronRight" size={20} className="text-ink-subtle transition-transform group-open:rotate-90" />
          </summary>
          <div className="border-t border-line px-5 py-5">
            <ActionForm
              action={setStatusAction.bind(null, slug)}
              submitLabel="Excluir instituição"
              pendingLabel="Excluindo..."
              confirm="Excluir esta instituição? Ela some da plataforma, mas os dados ficam guardados."
              submitClassName={btn("dangerOutline", "md", "self-start")}
              className="flex max-w-md flex-col gap-3"
            >
              <input type="hidden" name="status" value="deleted" />
              <p className="m-0 text-sm text-ink-muted">Ela some da plataforma e ninguém consegue entrar. Os dados ficam guardados.</p>
              <label className={labelCls}>
                Para confirmar, digite {slug}
                <input name="confirm" autoComplete="off" className={inputCls} />
              </label>
            </ActionForm>
          </div>
        </details>
      </div>
    </div>
  );
}
