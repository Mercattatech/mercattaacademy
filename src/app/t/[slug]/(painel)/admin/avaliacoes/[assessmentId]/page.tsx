import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { cx, Field, fieldCls } from "@/components/ui";
import { withContext } from "@/lib/db";
import { formatNumber, trimNumber } from "@/lib/format";
import { requireStaff } from "@/lib/guards";
import { canGradeModule, gradeSheet } from "@/lib/services/grades";
import { deleteAssessmentAction, saveGradesAction, updateAssessmentAction } from "../actions";

export default async function GradeSheetPage({ params }: { params: Promise<{ slug: string; assessmentId: string }> }) {
  const { slug, assessmentId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(assessmentId)) notFound();
  const ctx = await requireStaff(slug, ["coordenacao", "professor"], `/t/${slug}/admin/avaliacoes/${assessmentId}`);
  const data = await withContext({ tenantId: ctx.tenant.id, userId: ctx.userId }, async (c) => {
    const a = (await c.query<{ id: string; title: string; weight: string; max_score: string; due_on: string | null; cohort_module_id: string; module_name: string; cohort_name: string }>(
      `select a.id, a.title, a.weight, a.max_score, a.due_on::text, a.cohort_module_id, cm.name as module_name, co.name as cohort_name
       from assessments a join cohort_modules cm on cm.tenant_id = a.tenant_id and cm.id = a.cohort_module_id join cohorts co on co.tenant_id = a.tenant_id and co.id = a.cohort_id where a.id = $1`, [assessmentId])).rows[0];
    if (!a || !(await canGradeModule(c, ctx.roles, ctx.userId, a.cohort_module_id))) return null;
    return { a, sheet: await gradeSheet(c, assessmentId) };
  });
  if (!data) notFound();
  const { a, sheet } = data;

  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm"><Link href={`/t/${slug}/admin/avaliacoes`} className="font-semibold text-brand-ink no-underline hover:underline">Avaliações</Link></p>
      <h1 className="m-0 font-display text-[30px] leading-[1.15] font-[650] tracking-[-0.02em]">{a.title}</h1>
      <p className="mt-1 text-ink-muted">{a.cohort_name}: {a.module_name}. Peso {formatNumber(a.weight, 2)}, nota máxima {formatNumber(a.max_score, 2)}.</p>

      <section aria-labelledby="notas" className="mt-6 max-w-2xl">
        <h2 id="notas" className="m-0 font-sans text-lg font-semibold">Notas</h2>
        {sheet.length === 0 ? <p className="mt-2 text-ink-muted">Nenhum aluno com acesso liberado nesta turma.</p> : (
          <ActionForm action={saveGradesAction.bind(null, slug, a.id)} submitLabel="Salvar notas" pendingLabel="Salvando..." className="mt-3 flex flex-col gap-4">
            <ul className="border-t border-line">
              {sheet.map((r) => (
                <li key={r.enrollmentId} className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-2">
                  <label htmlFor={`s-${r.enrollmentId}`} className="text-sm font-semibold">{r.student}</label>
                  <input id={`s-${r.enrollmentId}`} name={`score_${r.enrollmentId}`} inputMode="decimal" defaultValue={r.score === null ? "" : trimNumber(r.score)} aria-describedby="dica-nota" className={cx(fieldCls, "w-28 text-right")} />
                </li>
              ))}
            </ul>
            <p id="dica-nota" className="text-sm text-ink-muted">De 0 a {trimNumber(a.max_score)}. Deixe vazio para ficar sem nota. Quem receber nota nova é avisado.</p>
          </ActionForm>
        )}
      </section>

      <section aria-labelledby="ed" className="mt-10 max-w-2xl border-t border-line pt-6">
        <h2 id="ed" className="m-0 font-sans text-lg font-semibold">Editar avaliação</h2>
        <ActionForm action={updateAssessmentAction.bind(null, slug, a.id)} submitLabel="Salvar avaliação" className="mt-3 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Título" name="title" id="e-title" defaultValue={a.title} required maxLength={140} /></div>
          <Field label="Peso" name="weight" id="e-weight" type="number" step="0.01" min="0.01" defaultValue={Number(a.weight)} required />
          <Field label="Nota máxima" name="maxScore" id="e-max" type="number" step="0.01" min="0.01" defaultValue={Number(a.max_score)} required />
          <Field label="Data (opcional)" name="dueOn" id="e-due" type="date" defaultValue={a.due_on ?? ""} />
        </ActionForm>
        <ActionForm action={deleteAssessmentAction.bind(null, slug, a.id)} submitLabel="Remover avaliação" variant="quiet" confirm="Remover a avaliação apaga todas as notas dela. Continuar?" className="mt-6 flex flex-col gap-2" />
      </section>
    </div>
  );
}
