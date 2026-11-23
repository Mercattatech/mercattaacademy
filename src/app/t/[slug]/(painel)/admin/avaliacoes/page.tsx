import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { btnOutline, btnPrimary, btnText, EmptyBox, inputCls, labelCls, PageHead, panelCls, Tag, tableCls, tableWrap, tdCls, thCls, trCls } from "@/components/admin-ui";
import { AutoSelect } from "@/components/auto-select";
import { Icon } from "@/components/icon";
import { cx, Field } from "@/components/ui";
import { withContext } from "@/lib/db";
import { formatDay, formatNumber } from "@/lib/format";
import { requireStaff } from "@/lib/guards";
import { getLabels } from "@/lib/tenant";
import { createAssessmentAction } from "./actions";

export default async function AssessmentsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ turma?: string; nova?: string }> }) {
  const { slug } = await params;
  const { turma, nova } = await searchParams;
  const ctx = await requireStaff(slug, ["coordenacao", "professor"], `/t/${slug}/admin/avaliacoes`);
  const labels = await getLabels(ctx.tenant.id);
  const cohortId = turma && /^[0-9a-f-]{36}$/i.test(turma) ? turma : null;
  const manager = ctx.roles.some((r) => r === "admin" || r === "coordenacao");

  const { cohorts, modules, items } = await withContext({ tenantId: ctx.tenant.id, userId: ctx.userId }, async (c) => {
    const mine = `(cm.teacher_id = $1 or exists (select 1 from lessons l where l.cohort_module_id = cm.id and l.teacher_id = $1))`;
    return {
      cohorts: (await c.query<{ id: string; name: string }>("select id, name from cohorts order by created_at desc")).rows,
      modules: (await c.query<{ id: string; name: string; cohort_name: string }>(
        `select cm.id, cm.name, co.name as cohort_name from cohort_modules cm join cohorts co on co.tenant_id = cm.tenant_id and co.id = cm.cohort_id
         where ($2::boolean or ${mine}) order by co.created_at desc, cm.position`, [ctx.userId, manager])).rows,
      items: (await c.query<{ id: string; title: string; weight: string; max_score: string; due_on: string | null; module_name: string; cohort_name: string; graded: number; total: number }>(
        `select a.id, a.title, a.weight, a.max_score, a.due_on::text, cm.name as module_name, co.name as cohort_name,
                (select count(*)::int from grades g where g.assessment_id = a.id) as graded,
                (select count(*)::int from enrollments e where e.cohort_id = a.cohort_id and e.status = 'active' and e.stage = 'released') as total
         from assessments a join cohort_modules cm on cm.tenant_id = a.tenant_id and cm.id = a.cohort_module_id
         join cohorts co on co.tenant_id = a.tenant_id and co.id = a.cohort_id
         where ($3::uuid is null or a.cohort_id = $3) and ($2::boolean or ${mine}) order by co.created_at desc, cm.position, a.created_at`, [ctx.userId, manager, cohortId])).rows,
    };
  });

  const base = `/t/${slug}/admin/avaliacoes`;
  const showForm = nova === "1";

  return (
    <div className="flex flex-col gap-6">
      <PageHead
        title="Avaliações"
        sub={manager ? "Provas e trabalhos de cada módulo. Abra uma avaliação para lançar as notas." : `Os ${labels.module.plural.toLowerCase()} em que você é professor. Abra uma avaliação para lançar as notas.`}
        action={
          !showForm && modules.length > 0 ? (
            <Link href={`${base}?nova=1${cohortId ? `&turma=${cohortId}` : ""}`} className={btnPrimary}>
              <Icon name="plus" size={20} />
              Criar avaliação
            </Link>
          ) : undefined
        }
      />

      {showForm && (
        <section aria-labelledby="nova" className={`${panelCls} flex max-w-[760px] flex-col gap-4 p-5`}>
          <div className="flex items-start justify-between gap-3">
            <h2 id="nova" className="m-0 font-sans text-lg font-semibold">Criar avaliação</h2>
            <Link href={base} aria-label="Fechar" className="-mt-2 -mr-2 flex size-11 items-center justify-center rounded-[10px] text-ink-muted hover:bg-sunken">
              <Icon name="close" />
            </Link>
          </div>
          {modules.length === 0 ? (
            <p className="m-0 text-[15px] text-ink-muted">Nenhum {labels.module.singular.toLowerCase()} disponível para você.</p>
          ) : (
            <ActionForm action={createAssessmentAction.bind(null, slug)} submitLabel="Criar avaliação" pendingLabel="Criando..." resetOnSuccess submitClassName={cx(btnPrimary, "self-start")} className="grid gap-4 sm:grid-cols-2">
              <label className={`${labelCls} sm:col-span-2`}>
                {labels.module.singular}
                <select name="cohortModuleId" required className={inputCls}>
                  {modules.map((m) => <option key={m.id} value={m.id}>{m.cohort_name}: {m.name}</option>)}
                </select>
              </label>
              <div className="sm:col-span-2"><Field label="Título" name="title" id="a-title" required maxLength={140} placeholder="Ex.: Prova do módulo" /></div>
              <Field label="Peso" name="weight" id="a-weight" type="number" step="0.01" min="0.01" defaultValue={1} required hint="Quanto vale na média do módulo." />
              <Field label="Nota máxima" name="maxScore" id="a-max" type="number" step="0.01" min="0.01" defaultValue={10} required />
              <Field label="Data (opcional)" name="dueOn" id="a-due" type="date" />
            </ActionForm>
          )}
        </section>
      )}

      {cohorts.length > 1 && (
        <form method="get" action={base} className="flex flex-wrap items-end gap-2">
          <label className={`${labelCls} text-[13px]`}>
            {labels.cohort.singular}
            <AutoSelect name="turma" defaultValue={cohortId ?? ""} className={cx(inputCls, "w-auto pr-8")}>
              <option value="">Todas as {labels.cohort.plural.toLowerCase()}</option>
              {cohorts.map((co) => <option key={co.id} value={co.id}>{co.name}</option>)}
            </AutoSelect>
          </label>
          <noscript><button type="submit" className={btnOutline}>Filtrar</button></noscript>
        </form>
      )}

      {items.length === 0 ? (
        <EmptyBox icon="grading" title="Nenhuma avaliação aqui">
          Crie uma avaliação por {labels.module.singular.toLowerCase()} (prova, trabalho) com peso e nota máxima. A média do aluno sai sozinha.
        </EmptyBox>
      ) : (
        <div className={tableWrap}>
          <table className={tableCls}>
            <thead>
              <tr>
                <th scope="col" className={thCls}>Avaliação</th>
                <th scope="col" className={thCls}>Peso</th>
                <th scope="col" className={thCls}>Nota máx.</th>
                <th scope="col" className={thCls}>Data</th>
                <th scope="col" className={thCls}>Notas lançadas</th>
                <th scope="col" className={`${thCls} text-right`}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => {
                const done = a.total > 0 && a.graded >= a.total;
                return (
                  <tr key={a.id} className={trCls}>
                    <td className={tdCls}>
                      <strong className="font-semibold">{a.title}</strong>
                      <br />
                      <span className="text-[13px] text-ink-subtle">{a.cohort_name} · {a.module_name}</span>
                    </td>
                    <td className={`${tdCls} tabular-nums`}>{formatNumber(a.weight, 2)}</td>
                    <td className={`${tdCls} tabular-nums`}>{formatNumber(a.max_score, 2)}</td>
                    <td className={`${tdCls} whitespace-nowrap text-ink-muted`}>{a.due_on ? formatDay(a.due_on) : "–"}</td>
                    <td className={tdCls}>
                      {done ? <Tag tone="ok">{a.graded} de {a.total}</Tag> : <Tag tone={a.graded ? "warn" : "muted"} icon={a.graded ? "clock" : null}>{a.graded} de {a.total}</Tag>}
                    </td>
                    <td className={`${tdCls} text-right`}>
                      <Link href={`${base}/${a.id}`} className={btnText}>{done ? "Ver notas" : "Lançar notas"}</Link>
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
