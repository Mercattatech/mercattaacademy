import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { cx, Field, fieldCls, SelectField } from "@/components/ui";
import { withContext } from "@/lib/db";
import { can, requireStaff, STAFF_ROLES } from "@/lib/guards";
import { getLabels } from "@/lib/tenant";
import { cancelEnrollmentAction, enrollCsvAction, enrollOneAction, revokeInviteAction, updateCohortAction } from "../../actions";

const iso = (d: string | null) => d ?? "";

export default async function CohortPage({ params }: { params: Promise<{ slug: string; cohortId: string }> }) {
  const { slug, cohortId } = await params;
  const ctx = await requireStaff(slug, STAFF_ROLES, `/t/${slug}/admin/turmas/${cohortId}`);
  const labels = await getLabels(ctx.tenant.id);
  const canPlan = can(ctx, "coordenacao");
  const canEnroll = can(ctx, "secretaria", "coordenacao");

  const data = await withContext({ tenantId: ctx.tenant.id }, async (c) => {
    const cohort = (await c.query(
      `select co.*, p.name as program_name, p.id as program_id from cohorts co join programs p on p.id = co.program_id where co.id = $1`,
      [cohortId],
    )).rows[0];
    if (!cohort) return null;
    const modules = (await c.query<{ id: string; position: number; name: string; workload_hours: number | null; teacher_id: string | null; starts_on: string | null; ends_on: string | null }>(
      "select * from cohort_modules where cohort_id = $1 order by position",
      [cohortId],
    )).rows;
    const students = (await c.query<{ id: string; name: string; email: string; status: string; source: string }>(
      `select e.id, u.name, u.email, e.status, e.source from enrollments e join "user" u on u.id = e.user_id
       where e.cohort_id = $1 order by e.status, u.name`,
      [cohortId],
    )).rows;
    const pending = (await c.query<{ id: string; name: string | null; email: string; expires_at: Date }>(
      `select id, name, email, expires_at from invites
       where cohort_id = $1 and accepted_at is null and revoked_at is null order by created_at desc`,
      [cohortId],
    )).rows;
    const teachers = (await c.query<{ id: string; name: string }>(
      `select distinct u.id, u.name from memberships m join "user" u on u.id = m.user_id where m.role = 'professor' order by u.name`,
    )).rows;
    return { cohort, modules, students, pending, teachers };
  });
  if (!data) notFound();
  const { cohort, modules, students, pending, teachers } = data;
  const active = students.filter((s) => s.status === "active");

  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm">
        <Link href={`/t/${slug}/admin/cursos/${cohort.program_id}`} className="font-semibold text-brand-ink no-underline hover:underline">{cohort.program_name}</Link>
      </p>
      <h1 className="m-0 font-display text-[30px] leading-[1.15] font-[650] tracking-[-0.02em]">{cohort.name}</h1>
      <p className="mt-1 text-ink-muted">
        {active.length} alunos matriculados, {pending.length} convites aguardando aceite.
      </p>

      <section aria-labelledby="agenda" className="mt-10">
        <h2 id="agenda" className="m-0 font-sans text-lg font-semibold">{labels.cohort.singular} e {labels.module.plural.toLowerCase()}</h2>
        <ActionForm action={updateCohortAction.bind(null, slug, cohortId)} submitLabel="Salvar" className="mt-4 flex flex-col gap-6">
          <fieldset disabled={!canPlan} className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <Field label="Nome" name="name" defaultValue={cohort.name} required id="cohort-name" />
            </div>
            <Field label="Início" name="startsOn" type="date" defaultValue={iso(cohort.starts_on)} id="cohort-start" />
            <Field label="Fim" name="endsOn" type="date" defaultValue={iso(cohort.ends_on)} id="cohort-end" />
            <Field label="Inscrições abrem em" name="enrollmentOpensOn" type="date" defaultValue={iso(cohort.enrollment_opens_on)} id="cohort-enr-open" />
            <Field label="Inscrições fecham em" name="enrollmentClosesOn" type="date" defaultValue={iso(cohort.enrollment_closes_on)} id="cohort-enr-close" hint="A vitrine só mostra a turma com situação 'Inscrições abertas' e dentro deste período." />
            <div className="sm:col-span-2">
              <SelectField label="Situação" id="cohort-status" name="status" defaultValue={cohort.status}>
                <option value="planned">Planejada</option>
                <option value="open">Inscrições abertas</option>
                <option value="running">Em andamento</option>
                <option value="closed">Encerrada</option>
              </SelectField>
            </div>
          </fieldset>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead className="border-b border-line text-ink-muted">
                <tr>
                  <th className="py-2 pr-3 font-normal">{labels.module.singular}</th>
                  <th className="py-2 pr-3 font-normal">Início</th>
                  <th className="py-2 pr-3 font-normal">Fim</th>
                  <th className="py-2 font-normal">Professor</th>
                </tr>
              </thead>
              <tbody>
                {modules.map((m) => (
                  <tr key={m.id} className="border-b border-line">
                    <td className="py-2 pr-3">
                      <input type="hidden" name="moduleId" value={m.id} />
                      <span className="mr-2 text-ink-muted">{m.position}.</span>
                      {m.name}
                    </td>
                    <td className="py-2 pr-3">
                      <input type="date" name={`start_${m.id}`} defaultValue={iso(m.starts_on)} disabled={!canPlan} aria-label={`Início de ${m.name}`} className={cx(fieldCls, "w-auto px-2 text-[15px]")} />
                    </td>
                    <td className="py-2 pr-3">
                      <input type="date" name={`end_${m.id}`} defaultValue={iso(m.ends_on)} disabled={!canPlan} aria-label={`Fim de ${m.name}`} className={cx(fieldCls, "w-auto px-2 text-[15px]")} />
                    </td>
                    <td className="py-2">
                      <select name={`teacher_${m.id}`} defaultValue={m.teacher_id ?? ""} disabled={!canPlan} aria-label={`Professor de ${m.name}`} className={cx(fieldCls, "w-auto px-2 text-[15px]")}>
                        <option value="">A definir</option>
                        {teachers.map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ActionForm>
      </section>

      <div className="mt-12 grid gap-12 lg:grid-cols-[3fr_2fr]">
        <section aria-labelledby="alunos">
          <h2 id="alunos" className="m-0 font-sans text-lg font-semibold">Alunos</h2>
          {students.length + pending.length === 0 ? (
            <p className="mt-2 text-ink-muted">Nenhum aluno ainda. Matricule ao lado, um a um ou por planilha.</p>
          ) : (
            <ul className="mt-2 border-t border-line">
              {students.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3">
                  <span className={s.status === "canceled" ? "text-ink-muted line-through" : ""}>
                    <span className="text-sm font-semibold">{s.name}</span> <span className="text-ink-muted">{s.email}</span>
                  </span>
                  {s.status === "active" && canEnroll && (
                    <form action={cancelEnrollmentAction.bind(null, slug, cohortId, s.id)}>
                      <button type="submit" className="min-h-11 text-sm text-danger underline">Cancelar matrícula</button>
                    </form>
                  )}
                </li>
              ))}
              {pending.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3">
                  <span>
                    {p.name ?? p.email} <span className="text-ink-muted">{p.email}</span>
                    <span className="block text-sm text-ink-muted">
                      Convite {p.expires_at < new Date() ? "vencido" : `aguardando aceite até ${p.expires_at.toLocaleDateString("pt-BR")}`}
                    </span>
                  </span>
                  {canEnroll && (
                    <form action={revokeInviteAction.bind(null, slug, p.id)}>
                      <button type="submit" className="min-h-11 text-sm text-danger underline">Cancelar convite</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {canEnroll && (
          <div className="flex flex-col gap-10">
            <section aria-labelledby="matricular">
              <h2 id="matricular" className="m-0 font-sans text-lg font-semibold">Matricular aluno</h2>
              <p className="mt-1 text-sm text-ink-muted">Quem já tem conta entra na hora; os demais recebem convite por e-mail.</p>
              <ActionForm action={enrollOneAction.bind(null, slug, cohortId)} submitLabel="Matricular" pendingLabel="Matriculando..." resetOnSuccess className="mt-4 flex flex-col gap-3">
                <Field label="Nome completo" name="name" required id="enroll-name" />
                <Field label="E-mail" name="email" type="email" required id="enroll-email" />
              </ActionForm>
            </section>
            <section aria-labelledby="planilha">
              <h2 id="planilha" className="m-0 font-sans text-lg font-semibold">Matricular por planilha</h2>
              <p className="mt-1 text-sm text-ink-muted">
                Arquivo CSV com as colunas nome e e-mail. No Excel: Salvar como, CSV. Linhas com problema aparecem num relatório e não impedem as outras.
              </p>
              <ActionForm action={enrollCsvAction.bind(null, slug, cohortId)} submitLabel="Importar planilha" pendingLabel="Importando..." className="mt-4 flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor="csv" className="text-sm font-semibold">Arquivo CSV</label>
                  <input id="csv" name="file" type="file" accept=".csv,text/csv" required className="min-h-11" />
                </div>
              </ActionForm>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
