import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { btnOutline, btnPrimary, EmptyBox, Eyebrow, inputCls, labelCls, PageHead, panelCls, Tag, type Tone } from "@/components/admin-ui";
import { AutoSelect } from "@/components/auto-select";
import { Icon } from "@/components/icon";
import { cx, Field } from "@/components/ui";
import { withContext } from "@/lib/db";
import { weekdayDate } from "@/lib/format";
import { can, requireStaff } from "@/lib/guards";
import { canSchedule, lessonState, lessonTone, STATE_LABELS } from "@/lib/services/lessons";
import { getLabels } from "@/lib/tenant";
import { scheduleLessonAction } from "./actions";

type Lesson = { id: string; title: string; starts_at: Date; duration_minutes: number; status: string; recording_id: string | null; module_name: string; cohort_name: string; teacher_name: string | null };

const TZ = "America/Sao_Paulo";
const day = (d: Date) => weekdayDate(d);
const time = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
const TONE: Record<string, Tone> = { ok: "ok", warn: "warn", muted: "muted", danger: "bad" };

function LessonRow({ slug, l }: { slug: string; l: Lesson }) {
  const st = lessonState(l);
  const live = st === "live";
  return (
    <li>
      <Link
        href={`/t/${slug}/admin/aulas/${l.id}`}
        className={`flex items-center gap-3.5 rounded-[14px] border bg-surface px-4 py-3.5 text-ink no-underline hover:text-ink ${live ? "border-brand ring-[1.5px] ring-brand" : "border-line hover:border-line-strong"}`}
      >
        <span className="flex w-[84px] shrink-0 flex-col">
          <span className="text-xs font-semibold whitespace-nowrap text-ink-subtle">{day(l.starts_at)}</span>
          <span className="font-display text-xl font-semibold">{time(l.starts_at)}</span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[15px] font-semibold">{l.title}</span>
          <span className="text-[13px] text-ink-muted">
            {l.cohort_name} · {l.module_name} · {l.teacher_name ?? "professor a definir"}
          </span>
        </span>
        <Tag tone={live ? "brand" : (TONE[lessonTone(st)] ?? "muted")} icon={live ? "video" : undefined} small>{STATE_LABELS[st]}</Tag>
        <Icon name="chevronRight" size={20} className="text-ink-subtle" />
      </Link>
    </li>
  );
}

/** Aulas (protótipo): agenda em cartões; presença e sala ficam na página de cada aula. */
export default async function AdminLessonsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ turma?: string; nova?: string; anteriores?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireStaff(slug, ["coordenacao", "professor"], `/t/${slug}/admin/aulas`);
  const labels = await getLabels(ctx.tenant.id);
  const base = `/t/${slug}/admin/aulas`;
  const cohortId = sp.turma && /^[0-9a-f-]{36}$/i.test(sp.turma) ? sp.turma : null;
  const manager = canSchedule(ctx.roles);

  const { cohorts, modules, teachers, lessons } = await withContext({ tenantId: ctx.tenant.id, userId: ctx.userId }, async (c) => ({
    cohorts: (await c.query<{ id: string; name: string }>("select id, name from cohorts order by created_at desc")).rows,
    modules: (
      await c.query<{ id: string; name: string; cohort_name: string }>(
        `select cm.id, cm.name, co.name as cohort_name from cohort_modules cm join cohorts co on co.tenant_id = cm.tenant_id and co.id = cm.cohort_id
         where co.status <> 'closed' order by co.created_at desc, cm.position`,
      )
    ).rows,
    teachers: (
      await c.query<{ id: string; name: string }>(
        `select distinct u.id, u.name from memberships m join "user" u on u.id = m.user_id where m.role in ('professor', 'coordenacao', 'admin') order by u.name`,
      )
    ).rows,
    lessons: (
      await c.query<Lesson>(
        `select l.id, l.title, l.starts_at, l.duration_minutes, l.status, l.recording_id, cm.name as module_name, co.name as cohort_name, u.name as teacher_name
         from lessons l join cohort_modules cm on cm.tenant_id = l.tenant_id and cm.id = l.cohort_module_id
         join cohorts co on co.tenant_id = l.tenant_id and co.id = l.cohort_id left join "user" u on u.id = l.teacher_id
         where ($1::uuid is null or l.cohort_id = $1) and ($2::boolean or l.teacher_id = $3)
         order by l.starts_at limit 400`,
        [cohortId, manager || can(ctx), ctx.userId],
      )
    ).rows,
  }));

  const now = Date.now();
  const upcoming = lessons.filter((l) => l.starts_at.getTime() + l.duration_minutes * 60_000 >= now && l.status !== "canceled" && l.status !== "ended");
  const past = lessons.filter((l) => !upcoming.includes(l)).reverse();
  const showPast = sp.anteriores === "1";
  const pastShown = showPast ? past : past.slice(0, 8);
  const showForm = manager && sp.nova === "1";
  const lessonWord = labels.lesson.singular.toLowerCase();

  return (
    <div className="flex flex-col gap-6">
      <PageHead
        title={labels.lesson.plural}
        sub={manager ? `${upcoming.length} ${upcoming.length === 1 ? "agendada" : "agendadas"} daqui para a frente. Abra a ${lessonWord} para a sala, a presença e os materiais.` : `As ${labels.lesson.plural.toLowerCase()} em que você é o professor. A coordenação faz o agendamento.`}
        action={
          manager && !showForm ? (
            <Link href={`${base}?nova=1${cohortId ? `&turma=${cohortId}` : ""}`} className={btnPrimary}>
              <Icon name="plus" size={20} />
              Agendar {lessonWord}
            </Link>
          ) : undefined
        }
      />

      {showForm && (
        <section aria-labelledby="nova" className={`${panelCls} flex max-w-[760px] flex-col gap-4 p-5`}>
          <div className="flex items-start justify-between gap-3">
            <h2 id="nova" className="m-0 font-sans text-lg font-semibold">Agendar {lessonWord}</h2>
            <Link href={base} aria-label="Fechar" className="-mt-2 -mr-2 flex size-11 items-center justify-center rounded-[10px] text-ink-muted hover:bg-sunken">
              <Icon name="close" />
            </Link>
          </div>
          {modules.length === 0 ? (
            <p className="m-0 text-[15px] text-ink-muted">Abra uma {labels.cohort.singular.toLowerCase()} com {labels.module.plural.toLowerCase()} antes de agendar.</p>
          ) : (
            <ActionForm action={scheduleLessonAction.bind(null, slug)} submitLabel="Agendar" pendingLabel="Agendando..." resetOnSuccess submitClassName={cx(btnPrimary, "self-start")} className="grid gap-4 sm:grid-cols-2">
              <label className={`${labelCls} sm:col-span-2`}>
                {labels.module.singular}
                <select name="cohortModuleId" required className={inputCls}>
                  {modules.map((m) => <option key={m.id} value={m.id}>{m.cohort_name}: {m.name}</option>)}
                </select>
              </label>
              <div className="sm:col-span-2"><Field label="Título" name="title" id="l-title" required maxLength={140} /></div>
              <Field label="Data e hora (Brasília)" name="startsLocal" type="datetime-local" id="l-start" required />
              <Field label="Duração (minutos)" name="durationMinutes" type="number" min={15} max={480} defaultValue={120} id="l-dur" required />
              <label className={`${labelCls} sm:col-span-2`}>
                Professor
                <select name="teacherId" className={inputCls}>
                  <option value="">A definir</option>
                  {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
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

      {lessons.length === 0 ? (
        <EmptyBox icon="calendar" title={`Nenhuma ${lessonWord} aqui`}>
          {manager ? `Use "Agendar ${lessonWord}" para montar a agenda. Os alunos veem na área deles e podem levar para o calendário.` : "Quando a coordenação agendar, elas aparecem aqui."}
        </EmptyBox>
      ) : (
        <>
          <section aria-labelledby="proximas" className="flex flex-col gap-3">
            <Eyebrow id="proximas">Próximas</Eyebrow>
            {upcoming.length === 0 ? (
              <p className="m-0 text-[15px] text-ink-muted">Nenhuma {lessonWord} pela frente.</p>
            ) : (
              <ol className="m-0 flex list-none flex-col gap-2 p-0">
                {upcoming.map((l) => <LessonRow key={l.id} slug={slug} l={l} />)}
              </ol>
            )}
          </section>
          {past.length > 0 && (
            <section aria-labelledby="anteriores" className="flex flex-col gap-3">
              <Eyebrow id="anteriores">Anteriores</Eyebrow>
              <ol className="m-0 flex list-none flex-col gap-2 p-0">
                {pastShown.map((l) => <LessonRow key={l.id} slug={slug} l={l} />)}
              </ol>
              {!showPast && past.length > pastShown.length && (
                <Link href={`${base}?anteriores=1${cohortId ? `&turma=${cohortId}` : ""}`} className={cx(btnOutline, "self-start")}>
                  Ver todas as anteriores ({past.length})
                </Link>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
