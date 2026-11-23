import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { btn, Field, SelectField } from "@/components/ui";
import { StatusTag } from "@/components/admin-ui";
import { withContext } from "@/lib/db";
import { formatDateTime, formatDuration, toLocalInput } from "@/lib/format";
import { requireStaff } from "@/lib/guards";
import { attendanceFor, canManageLesson, canSchedule, lessonState, lessonTone, STATE_LABELS } from "@/lib/services/lessons";
import { getLabels } from "@/lib/tenant";
import { cancelLessonAction, closePresenceAction, deleteMaterialAction, endLessonAction, setOverrideAction, startLessonAction, updateLessonAction, uploadMaterialAction } from "../actions";

export default async function AdminLessonPage({ params }: { params: Promise<{ slug: string; lessonId: string }> }) {
  const { slug, lessonId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(lessonId)) notFound();
  const ctx = await requireStaff(slug, ["coordenacao", "professor"], `/t/${slug}/admin/aulas/${lessonId}`);
  const labels = await getLabels(ctx.tenant.id);

  const data = await withContext({ tenantId: ctx.tenant.id, userId: ctx.userId }, async (c) => {
    const lesson = (await c.query<{ id: string; title: string; starts_at: Date; duration_minutes: number; status: string; teacher_id: string | null; teacher_name: string | null; module_name: string; cohort_name: string; recording_id: string | null; recording_seconds: number | null; started_at: Date | null; ended_at: Date | null; presence_closed_at: Date | null }>(
      `select l.id, l.title, l.starts_at, l.duration_minutes, l.status, l.teacher_id, u.name as teacher_name, cm.name as module_name, co.name as cohort_name,
              l.recording_id, l.recording_seconds, l.started_at, l.ended_at, l.presence_closed_at
       from lessons l join cohort_modules cm on cm.tenant_id = l.tenant_id and cm.id = l.cohort_module_id
       join cohorts co on co.tenant_id = l.tenant_id and co.id = l.cohort_id left join "user" u on u.id = l.teacher_id where l.id = $1`, [lessonId],
    )).rows[0];
    if (!lesson) return null;
    return {
      lesson,
      materials: (await c.query<{ id: string; file_name: string; size_bytes: number }>("select id, file_name, size_bytes from lesson_materials where lesson_id = $1 order by created_at", [lessonId])).rows,
      attendance: lesson.status === "ended" ? await attendanceFor(c, lessonId) : null,
      teachers: (await c.query<{ id: string; name: string }>(`select distinct u.id, u.name from memberships m join "user" u on u.id = m.user_id where m.role in ('professor', 'coordenacao', 'admin') order by u.name`)).rows,
    };
  });
  if (!data || !canManageLesson(ctx.roles, ctx.userId, data.lesson)) notFound();
  const { lesson, materials, attendance, teachers } = data;
  const st = lessonState(lesson);
  const schedule = canSchedule(ctx.roles);

  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm"><Link href={`/t/${slug}/admin/aulas`} className="font-semibold text-brand-ink no-underline hover:underline">{labels.lesson.plural}</Link></p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="m-0 font-display text-[30px] leading-[1.15] font-[650] tracking-[-0.02em]">{lesson.title}</h1>
        <StatusTag tone={lessonTone(st)}>{STATE_LABELS[st]}</StatusTag>
      </div>
      <p className="mt-1 text-ink-muted">{lesson.cohort_name}: {lesson.module_name}. {formatDateTime(lesson.starts_at)}, {formatDuration(lesson.duration_minutes * 60)}. {lesson.teacher_name ? `Prof. ${lesson.teacher_name}` : "Professor a definir"}</p>

      <section aria-labelledby="sala" className="mt-6">
        <h2 id="sala" className="m-0 font-sans text-lg font-semibold">Sala</h2>
        {lesson.status === "scheduled" && (
          <ActionForm action={startLessonAction.bind(null, slug, lesson.id)} submitLabel="Iniciar aula" pendingLabel="Abrindo a sala..." className="mt-3 flex flex-col gap-2" />
        )}
        {lesson.status === "live" && (
          <div className="mt-3 flex flex-wrap items-start gap-4">
            <Link href={`/t/${slug}/aula/${lesson.id}`} className={btn()}>Entrar na sala</Link>
            <ActionForm action={endLessonAction.bind(null, slug, lesson.id)} submitLabel="Encerrar aula" pendingLabel="Encerrando..." variant="quiet" confirm="Encerrar a aula para todos?" className="flex flex-col gap-2" />
          </div>
        )}
        {lesson.status === "ended" && (
          <p className="mt-2">
            Encerrada{lesson.started_at && lesson.ended_at ? ` (${formatDuration((lesson.ended_at.getTime() - lesson.started_at.getTime()) / 1000)} no ar)` : ""}.{" "}
            {lesson.recording_id ? `Gravação anexada${lesson.recording_seconds ? ` (${formatDuration(lesson.recording_seconds)})` : ""}.` : "A gravação aparece sozinha quando estiver pronta."}
          </p>
        )}
        {lesson.status === "canceled" && <p className="mt-2">Aula cancelada.</p>}
      </section>

      {attendance && (
        <section aria-labelledby="pres" className="mt-8">
          <h2 id="pres" className="m-0 font-sans text-lg font-semibold">Presença</h2>
          <p className="text-sm text-ink-muted">
            Presente quem ficou conectado pelo menos {attendance.percent}% da aula ({formatDuration(attendance.thresholdSeconds)}). Você pode ajustar cada pessoa{lesson.presence_closed_at ? "" : " antes de fechar"}.
          </p>
          {attendance.rows.length === 0 ? <p className="mt-3 text-ink-muted">Nenhum aluno com acesso liberado nesta {labels.cohort.singular.toLowerCase()}.</p> : (
            <ul className="mt-3 border-t border-line">
              {attendance.rows.map((r) => {
                const final = lesson.presence_closed_at ? r.present : (r.override ?? r.auto_present);
                return (
                  <li key={r.enrollment_id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3">
                    <div>
                      <p className="text-sm font-semibold">{r.student}</p>
                      <p className="text-sm text-ink-muted">Conectado {formatDuration(r.seconds)}{r.override !== null ? `. Ajustado: ${r.override ? "presente" : "falta"}` : ""}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusTag tone={final ? "ok" : "warn"}>{final ? "Presente" : "Falta"}</StatusTag>
                      {!lesson.presence_closed_at && (["present", "absent", "auto"] as const).map((v) => (
                        <ActionForm key={v} action={setOverrideAction.bind(null, slug, lesson.id, r.enrollment_id, v)} submitLabel={v === "present" ? "Presente" : v === "absent" ? "Falta" : "Automático"} variant="quiet" className="flex" />
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {lesson.presence_closed_at ? (
            <p className="mt-3 font-bold">Presença fechada em {formatDateTime(lesson.presence_closed_at)}.</p>
          ) : (
            <ActionForm action={closePresenceAction.bind(null, slug, lesson.id)} submitLabel="Fechar presença" confirm="Depois de fechar, a presença não muda mais. Continuar?" className="mt-4 flex flex-col gap-2" />
          )}
        </section>
      )}

      <section aria-labelledby="mat" className="mt-8 max-w-2xl">
        <h2 id="mat" className="m-0 font-sans text-lg font-semibold">Materiais (PDF)</h2>
        {materials.length > 0 && (
          <ul className="mt-2 border-t border-line">
            {materials.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3">
                <a href={`/t/${slug}/materiais/${m.id}`} target="_blank" rel="noreferrer" className="font-semibold text-brand-ink no-underline hover:underline">{m.file_name}</a>
                <ActionForm action={deleteMaterialAction.bind(null, slug, lesson.id, m.id)} submitLabel="Remover" variant="quiet" confirm="Remover este PDF?" className="flex" />
              </li>
            ))}
          </ul>
        )}
        <ActionForm action={uploadMaterialAction.bind(null, slug, lesson.id)} submitLabel="Anexar PDF" pendingLabel="Enviando..." resetOnSuccess className="mt-3 flex flex-wrap items-start gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="mat-file" className="sr-only">Arquivo PDF</label>
            <input id="mat-file" name="file" type="file" accept="application/pdf" required className="min-h-11 py-2" />
            <p className="text-sm text-ink-muted">Até 4 MB. Pode anexar antes ou depois da aula.</p>
          </div>
        </ActionForm>
      </section>

      {schedule && lesson.status === "scheduled" && (
        <section aria-labelledby="ed" className="mt-10 max-w-2xl border-t border-line pt-6">
          <h2 id="ed" className="m-0 font-sans text-lg font-semibold">Editar</h2>
          <ActionForm action={updateLessonAction.bind(null, slug, lesson.id)} submitLabel="Salvar" className="mt-3 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Título" name="title" id="e-title" defaultValue={lesson.title} required maxLength={140} /></div>
            <Field label="Data e hora (Brasília)" name="startsLocal" type="datetime-local" id="e-start" defaultValue={toLocalInput(lesson.starts_at)} required />
            <Field label="Duração (minutos)" name="durationMinutes" type="number" min={15} max={480} defaultValue={lesson.duration_minutes} id="e-dur" required />
            <div className="sm:col-span-2">
              <SelectField label="Professor" id="e-teacher" name="teacherId" defaultValue={lesson.teacher_id ?? ""}>
                <option value="">A definir</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </SelectField>
            </div>
          </ActionForm>
          <ActionForm action={cancelLessonAction.bind(null, slug, lesson.id)} submitLabel="Cancelar aula" variant="quiet" confirm="Cancelar esta aula?" className="mt-4 flex flex-col gap-2" />
        </section>
      )}
    </div>
  );
}
