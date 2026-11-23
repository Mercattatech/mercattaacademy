import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { btnOutline, btnText, PageHead, panelCls, Tag, textareaCls, type Tone } from "@/components/admin-ui";
import { Icon } from "@/components/icon";
import { cx, Field, SelectField } from "@/components/ui";
import { withContext } from "@/lib/db";
import { can, requireStaff, STAFF_ROLES } from "@/lib/guards";
import { formatDay } from "@/lib/format";
import { getEnabledFeatures, getLabels } from "@/lib/tenant";
import {
  addModuleAction,
  createCohortAction,
  deleteModuleAction,
  moveModuleAction,
  updateModuleAction,
  updateProgramAction,
} from "../../actions";

const COHORT_STATUS: Record<string, { label: string; tone: Tone; icon: "clock" | "howToReg" | "playCircle" | "checkCircle" }> = {
  planned: { label: "Planejada", tone: "muted", icon: "clock" },
  open: { label: "Inscrições abertas", tone: "brand", icon: "howToReg" },
  running: { label: "Em andamento", tone: "ok", icon: "playCircle" },
  closed: { label: "Encerrada", tone: "muted", icon: "checkCircle" },
};
const PROGRAM_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Rascunho", tone: "muted" },
  published: { label: "Publicado", tone: "ok" },
  archived: { label: "Arquivado", tone: "muted" },
};

type Teacher = { id: string; name: string };

function TeacherSelect({ teachers, name, value, id }: { teachers: Teacher[]; name: string; value?: string | null; id: string }) {
  return (
    <SelectField label="Professor padrão" id={id} name={name} defaultValue={value ?? ""}>
      <option value="">Definir depois</option>
      {teachers.map((t) => (
        <option key={t.id} value={t.id}>{t.name}</option>
      ))}
    </SelectField>
  );
}

export default async function ProgramPage({ params }: { params: Promise<{ slug: string; programId: string }> }) {
  const { slug, programId } = await params;
  const ctx = await requireStaff(slug, STAFF_ROLES, `/t/${slug}/admin/cursos/${programId}`);
  const labels = await getLabels(ctx.tenant.id);
  const videosOn = (await getEnabledFeatures(ctx.tenant.id)).has("aulas_gravadas");
  const editable = can(ctx, "coordenacao");

  const data = await withContext({ tenantId: ctx.tenant.id }, async (c) => {
    const program = (await c.query("select * from programs where id = $1", [programId])).rows[0];
    if (!program) return null;
    const modules = (await c.query<{ id: string; position: number; name: string; syllabus: string; workload_hours: number | null; default_teacher_id: string | null; teacher_name: string | null; video_count: number }>(
      `select m.*, u.name as teacher_name,
              (select count(*)::int from module_videos v where v.module_id = m.id and v.status = 'ready') as video_count
         from program_modules m left join "user" u on u.id = m.default_teacher_id
       where m.program_id = $1 order by m.position`,
      [programId],
    )).rows;
    const cohorts = (await c.query<{ id: string; name: string; status: string; starts_on: string | null; students: number }>(
      `select co.id, co.name, co.status, co.starts_on,
              (select count(*)::int from enrollments e where e.cohort_id = co.id and e.status = 'active') as students
       from cohorts co where co.program_id = $1 order by co.starts_on desc nulls last, co.created_at desc`,
      [programId],
    )).rows;
    const teachers = (await c.query<Teacher>(
      `select distinct u.id, u.name from memberships m join "user" u on u.id = m.user_id where m.role = 'professor' order by u.name`,
    )).rows;
    return { program, modules, cohorts, teachers };
  });
  if (!data) notFound();
  const { program, modules, cohorts, teachers } = data;
  const totalHours = modules.reduce((s, m) => s + (m.workload_hours ?? 0), 0);

  const st = PROGRAM_STATUS[program.status as string] ?? PROGRAM_STATUS.draft;
  const target = program.workload_hours as number | null;
  const hoursOk = !target || totalHours === target;
  const lowerM = (n: number) => `${n} ${(n === 1 ? labels.module.singular : labels.module.plural).toLowerCase()}`;

  return (
    <div className="flex flex-col gap-8">
      <PageHead
        crumbs={[{ href: `/t/${slug}/admin/cursos`, label: labels.program.plural }]}
        title={program.name}
        tag={<Tag tone={st.tone} icon={program.status === "published" ? "currentStep" : null}>{st.label}</Tag>}
        sub={`Grade curricular. Mudanças valem para as próximas ${labels.cohort.plural.toLowerCase()}; as já abertas mantêm a própria cópia.`}
        action={
          program.status === "published" ? (
            <a href={`/t/${slug}/cursos/${programId}`} target="_blank" rel="noreferrer" className={btnOutline}>
              <Icon name="external" size={20} />
              Ver na vitrine
            </a>
          ) : undefined
        }
      />

      <section aria-labelledby="grade" className={`${panelCls} flex flex-col gap-3 p-5`}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="grade" className="m-0 font-sans text-lg font-semibold">{labels.module.plural}</h2>
          <span className={`flex items-center gap-1 text-sm font-semibold ${hoursOk ? "text-ink-muted" : "text-warning"}`}>
            <Icon name={hoursOk ? "checkCircle" : "warning"} size={18} />
            {lowerM(modules.length)} · {totalHours} h no total{target ? (hoursOk ? " · bate com a carga do curso" : ` · o curso prevê ${target} h`) : ""}
          </span>
        </div>
        {editable && modules.length > 1 && <p className="m-0 text-sm text-ink-muted">Use as setas para mudar a ordem.</p>}
        {modules.length === 0 ? (
          <p className="m-0 text-[15px] text-ink-muted">A grade está vazia. Adicione o primeiro {labels.module.singular.toLowerCase()} abaixo.</p>
        ) : (
          <ol className="m-0 flex list-none flex-col p-0">
            {modules.map((m, i) => (
              <li key={m.id} className={`py-3 ${i ? "border-t border-line" : ""}`}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sunken text-sm font-semibold text-ink-muted">{m.position}</span>
                  <span className="min-w-[200px] flex-1 text-[15px] font-semibold">{m.name}</span>
                  <span className="w-20 text-sm text-ink-muted">{m.workload_hours ? `${m.workload_hours} h` : "- h"}</span>
                  <span className="w-48 truncate text-sm text-ink-muted">{m.teacher_name ?? "Professor a definir"}</span>
                  {videosOn && (
                    <a href={`/t/${slug}/admin/cursos/${programId}/modulos/${m.id}`} className={cx(btnText, "px-2")}>
                      <Icon name="video" size={18} />
                      Vídeos{m.video_count ? ` (${m.video_count})` : ""}
                    </a>
                  )}
                  {editable && (
                    <span className="flex gap-1">
                      <form action={moveModuleAction.bind(null, slug, programId, m.id, "up")}>
                        <button type="submit" disabled={i === 0} aria-label={`Mover ${m.name} para cima`} className="flex size-10 items-center justify-center rounded-[9px] border border-line-strong bg-surface text-ink-muted hover:bg-sunken disabled:opacity-30">
                          <Icon name="arrowUp" size={18} />
                        </button>
                      </form>
                      <form action={moveModuleAction.bind(null, slug, programId, m.id, "down")}>
                        <button type="submit" disabled={i === modules.length - 1} aria-label={`Mover ${m.name} para baixo`} className="flex size-10 items-center justify-center rounded-[9px] border border-line-strong bg-surface text-ink-muted hover:bg-sunken disabled:opacity-30">
                          <Icon name="arrowDown" size={18} />
                        </button>
                      </form>
                    </span>
                  )}
                </div>
                {editable && (
                  <details className="group mt-1 pl-12">
                    <summary className={cx(btnText, "-ml-2.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>Editar</summary>
                    <div className="mt-2 flex max-w-xl flex-col gap-3 rounded-xl bg-canvas p-4">
                      <ActionForm action={updateModuleAction.bind(null, slug, programId, m.id)} submitLabel="Salvar" className="flex flex-col gap-3">
                        <Field label="Nome" name="name" defaultValue={m.name} required id={`name-${m.id}`} />
                        <Field label="Carga horária (horas)" name="workloadHours" type="number" min={1} defaultValue={m.workload_hours ?? ""} id={`wh-${m.id}`} />
                        <TeacherSelect teachers={teachers} name="defaultTeacherId" value={m.default_teacher_id} id={`t-${m.id}`} />
                        <div className="flex flex-col gap-1">
                          <label htmlFor={`syl-${m.id}`} className="text-sm font-semibold">Ementa</label>
                          <textarea id={`syl-${m.id}`} name="syllabus" rows={3} defaultValue={m.syllabus} className={textareaCls} />
                        </div>
                      </ActionForm>
                      <form action={deleteModuleAction.bind(null, slug, programId, m.id)}>
                        <button type="submit" className="min-h-11 text-sm font-semibold text-danger hover:underline">Excluir {m.name} da grade</button>
                      </form>
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ol>
        )}

        {editable && (
          <details className="group border-t border-line pt-3">
            <summary className="inline-flex h-11 cursor-pointer list-none items-center gap-1.5 rounded-[10px] border-[1.5px] border-dashed border-line-strong px-4 text-[15px] font-semibold text-brand-ink hover:bg-brand-soft [&::-webkit-details-marker]:hidden">
              <Icon name="plus" size={20} />
              Adicionar {labels.module.singular.toLowerCase()}
            </summary>
            <div className="mt-3 max-w-xl">
              <ActionForm action={addModuleAction.bind(null, slug, programId)} submitLabel={`Adicionar ${labels.module.singular.toLowerCase()}`} resetOnSuccess className="flex flex-col gap-3">
                <Field label="Nome" name="name" required id="new-module-name" />
                <Field label="Carga horária (horas)" name="workloadHours" type="number" min={1} id="new-module-hours" />
                <TeacherSelect teachers={teachers} name="defaultTeacherId" id="new-module-teacher" />
                <div className="flex flex-col gap-1">
                  <label htmlFor="new-module-syllabus" className="text-sm font-semibold">Ementa</label>
                  <textarea id="new-module-syllabus" name="syllabus" rows={3} className={textareaCls} />
                </div>
              </ActionForm>
              {teachers.length === 0 && <p className="mt-2 mb-0 text-sm text-ink-muted">Para escolher professores, convide-os em Equipe com o perfil Professor.</p>}
            </div>
          </details>
        )}
      </section>

      <section aria-labelledby="turmas" className="flex flex-col gap-3">
        <h2 id="turmas" className="m-0 font-sans text-lg font-semibold">{labels.cohort.plural}</h2>
        {cohorts.length === 0 ? (
          <p className="m-0 text-[15px] text-ink-muted">Nenhuma {labels.cohort.singular.toLowerCase()} aberta.</p>
        ) : (
          <div className="flex flex-col border-t border-line">
            {cohorts.map((co) => {
              const cs = COHORT_STATUS[co.status] ?? COHORT_STATUS.planned;
              return (
                <div key={co.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line px-1 py-4">
                  <span className="flex-[1_1_220px]">
                    <strong className="text-base font-semibold">{co.name}</strong>
                    <br />
                    <span className="text-sm text-ink-muted">{co.starts_on ? `Começa em ${formatDay(co.starts_on)}` : "Sem data de início"}</span>
                  </span>
                  <span className="w-[90px] text-sm"><strong>{co.students}</strong> alunos</span>
                  <Tag tone={cs.tone} icon={cs.icon}>{cs.label}</Tag>
                  <Link href={`/t/${slug}/admin/turmas/${co.id}`} className={btnText}>Abrir {labels.cohort.singular.toLowerCase()}</Link>
                </div>
              );
            })}
          </div>
        )}
        {editable && (
          <details className="group">
            <summary className={cx(btnOutline, "cursor-pointer list-none [&::-webkit-details-marker]:hidden")}>
              <Icon name="plus" size={20} />
              Nova {labels.cohort.singular.toLowerCase()}
            </summary>
            <div className={`${panelCls} mt-3 max-w-xl p-5`}>
              <ActionForm action={createCohortAction.bind(null, slug, programId)} submitLabel={`Abrir ${labels.cohort.singular.toLowerCase()}`} className="flex flex-col gap-3">
                <Field label="Nome" name="name" required hint="Ex.: Turma 2027-A" id="new-cohort-name" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Início" name="startsOn" type="date" />
                  <Field label="Fim" name="endsOn" type="date" />
                </div>
              </ActionForm>
            </div>
          </details>
        )}
      </section>

      {editable && (
        <details className={`group ${panelCls}`}>
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 [&::-webkit-details-marker]:hidden">
            <Icon name="settings" size={20} className="text-ink-muted" />
            <span className="flex-1 text-base font-semibold">Dados, valor e regras de aprovação</span>
            <Icon name="chevronRight" size={20} className="text-ink-subtle transition-transform group-open:rotate-90" />
          </summary>
          <div className="border-t border-line px-5 py-5">
            <ActionForm action={updateProgramAction.bind(null, slug, programId)} submitLabel="Salvar alterações" className="grid max-w-3xl gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><Field label="Nome" name="name" defaultValue={program.name} required id="program-name" /></div>
              <div className="sm:col-span-2"><Field label="Resumo para a vitrine" name="summary" defaultValue={program.summary} maxLength={400} id="program-summary" hint="Uma ou duas frases que aparecem na lista de cursos." /></div>
              <Field label="Valor (R$)" name="priceReais" inputMode="decimal" defaultValue={program.price_cents == null ? "" : (program.price_cents / 100).toFixed(2).replace(".", ",")} id="program-price" hint="Valor que o aluno paga à instituição. Vazio = 'Consulte'." />
              <Field label="Máximo de parcelas" name="maxInstallments" type="number" min={1} max={12} defaultValue={program.max_installments} id="program-installments" hint="1 = só à vista. O acesso libera com a primeira parcela." />
              <Field label="Forma de pagamento" name="paymentNote" defaultValue={program.payment_note} id="program-payment" />
              <Field label="Carga horária total (horas)" name="workloadHours" type="number" min={1} defaultValue={program.workload_hours ?? ""} id="program-hours" />
              <Field label="Nota mínima para o certificado" name="minGrade" type="number" step="0.1" min={0} max={10} defaultValue={Number(program.min_grade)} id="program-min-grade" hint="Média final de 0 a 10." />
              <Field label="Frequência mínima para o certificado (%)" name="minFrequencyPercent" type="number" min={0} max={100} defaultValue={program.min_frequency_percent} id="program-min-freq" hint="Presenças em relação às aulas realizadas." />
              <Field label="Presença mínima por aula (%)" name="minAttendancePercent" type="number" min={1} max={100} defaultValue={program.min_attendance_percent} id="program-attendance" hint="Tempo da aula ao vivo conectado para contar presença." />
              <SelectField label="Situação" id="program-status" name="status" defaultValue={program.status}>
                <option value="draft">Rascunho (não aparece para alunos)</option>
                <option value="published">Publicado (conta na cobrança da plataforma)</option>
                <option value="archived">Arquivado</option>
              </SelectField>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label htmlFor="program-desc" className="text-sm font-semibold">Descrição</label>
                <textarea id="program-desc" name="description" rows={4} defaultValue={program.description} className={textareaCls} />
              </div>
            </ActionForm>
          </div>
        </details>
      )}
    </div>
  );
}
