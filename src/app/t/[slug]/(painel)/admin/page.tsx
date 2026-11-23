import Link from "next/link";
import { Bar, btnOutline, btnText, Eyebrow, Initials, SectionHead, Tag, type Tone } from "@/components/admin-ui";
import { withContext } from "@/lib/db";
import { shortDate } from "@/lib/format";
import { can, requireStaff, STAFF_ROLES } from "@/lib/guards";
import { STAGE_LABELS, type Stage } from "@/lib/services/documents";
import { getLabels } from "@/lib/tenant";

const TZ = "America/Sao_Paulo";
const STAGE_TAG: Record<Stage, { tone: Tone; icon: "file" | "payments" | "checkCircle" }> = {
  documents: { tone: "warn", icon: "file" },
  payment: { tone: "warn", icon: "payments" },
  released: { tone: "ok", icon: "checkCircle" },
};
const COHORT_NOTE: Record<string, string | undefined> = { planned: "planejada", open: "inscrições abertas", running: undefined, closed: "concluída" };

function greeting(now: Date) {
  const h = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(now));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

/** Visão geral (protótipo: "Bom dia", Precisa de ação hoje, Matrículas por turma, Matrículas recentes). */
export default async function AdminHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireStaff(slug, STAFF_ROLES, `/t/${slug}/admin`);
  const labels = await getLabels(ctx.tenant.id);
  const base = `/t/${slug}/admin`;
  const sec = can(ctx, "secretaria");
  const fin = can(ctx, "financeiro");
  const coord = can(ctx, "coordenacao");
  const teach = can(ctx, "coordenacao", "professor");
  const seesEnrollments = can(ctx, "secretaria", "financeiro");

  const data = await withContext({ tenantId: ctx.tenant.id, userId: ctx.userId }, async (c) => {
    const n = async (sql: string, args: unknown[] = []) => (await c.query<{ n: number }>(sql, args)).rows[0].n;
    return {
      docs: sec ? await n("select count(*)::int as n from student_documents where status = 'sent' and approved_at is null") : 0,
      toRelease: sec || fin ? await n("select count(*)::int as n from enrollments where stage = 'payment' and status = 'active'") : 0,
      overdue: fin || sec ? await n("select count(*)::int as n from payments where status = 'overdue'") : 0,
      tickets:
        sec || coord
          ? await n(`select count(*)::int as n from support_threads t where t.status = 'open'
                       and coalesce((select m.staff from support_messages m where m.thread_id = t.id order by m.created_at desc, m.id desc limit 1), false) = false`)
          : 0,
      lessonsToday: teach
        ? await n(
            `select count(*)::int as n from lessons l where l.status <> 'canceled'
               and (l.starts_at at time zone '${TZ}')::date = (now() at time zone '${TZ}')::date
               and ($1::boolean or l.teacher_id = $2)`,
            [coord, ctx.userId],
          )
        : 0,
      cohorts: (
        await c.query<{ id: string; name: string; program: string; status: string; students: number }>(
          `select co.id, co.name, p.name as program, co.status,
                  (select count(*)::int from enrollments e where e.cohort_id = co.id and e.status = 'active') as students
           from cohorts co join programs p on p.tenant_id = co.tenant_id and p.id = co.program_id
           order by co.status = 'closed', co.starts_on desc nulls last, co.created_at desc limit 6`,
        )
      ).rows,
      recent: seesEnrollments
        ? (
            await c.query<{ id: string; name: string; cohort: string; stage: Stage; created_at: Date }>(
              `select e.id, u.name, co.name as cohort, e.stage, e.created_at
               from enrollments e join "user" u on u.id = e.user_id join cohorts co on co.tenant_id = e.tenant_id and co.id = e.cohort_id
               where e.status <> 'canceled' order by e.created_at desc limit 5`,
            )
          ).rows
        : [],
    };
  });

  const plural = (k: number, one: string, many: string) => (k === 1 ? one : many);
  const actions = [
    data.docs > 0 && {
      n: data.docs,
      title: plural(data.docs, "Documento aguardando aprovação", "Documentos aguardando aprovação"),
      sub: "Aprove ou recuse para o aluno seguir para o pagamento.",
      cta: "Revisar",
      href: `${base}/documentos`,
    },
    data.toRelease > 0 && {
      n: data.toRelease,
      title: plural(data.toRelease, "Inscrição aguardando pagamento", "Inscrições aguardando pagamento"),
      sub: "Documentos completos. O acesso libera quando o pagamento é confirmado.",
      cta: "Ver inscrições",
      href: `${base}/inscricoes?etapa=payment`,
    },
    data.overdue > 0 && {
      n: data.overdue,
      title: plural(data.overdue, "Cobrança vencida", "Cobranças vencidas"),
      sub: "Vale um lembrete para o aluno.",
      cta: "Ver pagamentos",
      href: `${base}/pagamentos?situacao=overdue`,
    },
    data.tickets > 0 && {
      n: data.tickets,
      title: plural(data.tickets, "Chamado sem resposta", "Chamados sem resposta"),
      sub: "Alunos esperando a equipe no Atendimento.",
      cta: "Responder",
      href: `${base}/atendimento`,
    },
    data.lessonsToday > 0 && {
      n: data.lessonsToday,
      title: `${plural(data.lessonsToday, labels.lesson.singular, labels.lesson.plural)} hoje`,
      sub: "Confira a sala e, depois, a presença.",
      cta: "Ver agenda",
      href: `${base}/aulas`,
    },
  ].filter(Boolean) as { n: number; title: string; sub: string; cta: string; href: string }[];

  const now = new Date();
  const today = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(now);
  const scale = Math.max(1, ...data.cohorts.map((c) => c.students));

  return (
    <div className="flex flex-col gap-9">
      <div>
        <p className="mt-0 mb-1 text-sm text-ink-subtle first-letter:uppercase">{today}</p>
        <h1 className="m-0 font-display text-[32px] leading-[1.15] font-[650] tracking-[-0.02em]">
          {greeting(now)}, {ctx.userName.split(" ")[0]}
        </h1>
      </div>

      <section aria-labelledby="acao" className="flex flex-col gap-3">
        <Eyebrow id="acao">Precisa de ação hoje</Eyebrow>
        {actions.length === 0 ? (
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-5 py-4">
            <Tag tone="ok">Tudo em dia</Tag>
            <span className="text-[15px] text-ink-muted">Nada esperando por você agora.</span>
          </div>
        ) : (
          <div className="rounded-2xl border border-line bg-surface">
            {actions.map((a, i) => (
              <div key={a.href} className={`flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4 ${i ? "border-t border-line" : ""}`}>
                <span className="min-w-11 font-display text-[32px] leading-none font-semibold tracking-[-0.02em]">{a.n}</span>
                <span className="flex min-w-[200px] flex-1 flex-col gap-0.5">
                  <span className="text-base font-semibold">{a.title}</span>
                  <span className="text-sm text-ink-muted">{a.sub}</span>
                </span>
                <Link href={a.href} className={btnOutline}>{a.cta}</Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-10">
        <section aria-labelledby="por-turma" className="flex flex-col gap-[18px]">
          <SectionHead
            id="por-turma"
            title={`Matrículas por ${labels.cohort.singular.toLowerCase()}`}
            aside={<Link href={`${base}/cursos`} className={btnText}>{labels.program.plural}</Link>}
          />
          {data.cohorts.length === 0 ? (
            <p className="m-0 text-[15px] text-ink-muted">Nenhuma {labels.cohort.singular.toLowerCase()} ainda. Abra uma a partir de {labels.program.plural.toLowerCase()}.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {data.cohorts.map((co) => (
                <Link key={co.id} href={`${base}/turmas/${co.id}`} className="text-ink no-underline hover:text-ink">
                  <Bar label={co.name} note={COHORT_NOTE[co.status] ?? co.program} value={co.students} scale={scale} muted={co.status === "closed"} />
                </Link>
              ))}
            </div>
          )}
        </section>

        {seesEnrollments && (
          <section aria-labelledby="recentes" className="flex flex-col gap-2.5">
            <SectionHead id="recentes" title="Matrículas recentes" aside={<Link href={`${base}/inscricoes`} className={btnText}>Ver inscrições</Link>} />
            {data.recent.length === 0 ? (
              <p className="m-0 text-[15px] text-ink-muted">Nenhuma inscrição ainda.</p>
            ) : (
              <div className="flex flex-col">
                {data.recent.map((r, i) => (
                  <div key={r.id} className={`flex items-center gap-3 py-3 ${i ? "border-t border-line" : ""}`}>
                    <Initials name={r.name} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[15px] font-semibold">{r.name}</span>
                      <span className="text-[13px] text-ink-muted">
                        {r.cohort} · {shortDate(r.created_at)}
                      </span>
                    </span>
                    <Tag tone={STAGE_TAG[r.stage].tone} icon={STAGE_TAG[r.stage].icon}>
                      {r.stage === "released" ? "Liberado" : STAGE_LABELS[r.stage]}
                    </Tag>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
