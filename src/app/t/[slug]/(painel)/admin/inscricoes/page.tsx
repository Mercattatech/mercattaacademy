import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { btnOutline, btnText, EmptyBox, inputCls, labelCls, PageHead, Pill, Tag, tableCls, tableWrap, tdCls, thCls, trCls, type Tone } from "@/components/admin-ui";
import { AutoSelect } from "@/components/auto-select";
import { Icon } from "@/components/icon";
import { withContext } from "@/lib/db";
import { shortDate } from "@/lib/format";
import { can, requireStaff } from "@/lib/guards";
import { STAGE_LABELS, type Stage } from "@/lib/services/documents";
import { getLabels } from "@/lib/tenant";
import { markStaffNoticesReadAction, releaseAccessAction } from "./actions";
import { cx } from "@/components/ui";

type Row = { id: string; student: string; email: string; cohort_name: string; stage: Stage; created_at: Date; sent: number; review: number; required: number };

const STAGE_TAG: Record<Stage, { tone: Tone; icon: "file" | "payments" | "checkCircle"; label: string }> = {
  documents: { tone: "warn", icon: "file", label: "Documentos" },
  payment: { tone: "warn", icon: "payments", label: "Pagamento" },
  released: { tone: "ok", icon: "checkCircle", label: "Liberado" },
};

/** Inscrições (protótipo): busca, turma, etapa em pílulas com contagem e tabela. */
export default async function EnrollmentsAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ etapa?: string; turma?: string; busca?: string }>;
}) {
  const { slug } = await params;
  const { etapa, turma, busca } = await searchParams;
  const term = busca?.trim().slice(0, 80) || null;
  const ctx = await requireStaff(slug, ["secretaria", "financeiro"], `/t/${slug}/admin/inscricoes`);
  const labels = await getLabels(ctx.tenant.id);
  const stage = etapa && ["documents", "payment", "released"].includes(etapa) ? (etapa as Stage) : null;
  const cohortId = turma && /^[0-9a-f-]{36}$/i.test(turma) ? turma : null;
  const canReview = can(ctx, "secretaria");
  const canRelease = can(ctx, "secretaria", "financeiro");
  const base = `/t/${slug}/admin`;

  const data = await withContext({ tenantId: ctx.tenant.id, userId: ctx.userId }, async (c) => {
    const where = `e.source = 'vitrine' and e.status <> 'canceled' and ($1::uuid is null or e.cohort_id = $1)
                   and ($2::text is null or u.name ilike '%' || $2 || '%' or u.email ilike '%' || $2 || '%')`;
    const cohorts = (await c.query<{ id: string; name: string }>("select id, name from cohorts order by created_at desc")).rows;
    const counts = (
      await c.query<{ stage: Stage; n: number }>(
        `select e.stage, count(*)::int as n from enrollments e join "user" u on u.id = e.user_id where ${where} group by e.stage`,
        [cohortId, term],
      )
    ).rows;
    const rows = (
      await c.query<Row>(
        `select e.id, u.name as student, u.email, co.name as cohort_name, e.stage, e.created_at,
                (select count(*)::int from student_documents d join document_types t on t.id = d.document_type_id
                  where d.enrollment_id = e.id and d.status = 'sent' and t.required and t.active) as sent,
                (select count(*)::int from student_documents d where d.enrollment_id = e.id and d.status = 'sent' and d.approved_at is null) as review,
                (select count(*)::int from document_types t where t.required and t.active) as required
         from enrollments e join "user" u on u.id = e.user_id join cohorts co on co.id = e.cohort_id
         where ${where} and ($3::text is null or e.stage = $3)
         order by e.stage_changed_at desc limit 200`,
        [cohortId, term, stage],
      )
    ).rows;
    const notices = (
      await c.query<{ id: string; message: string }>(
        `select id, message from notifications where user_id = $1 and read_at is null order by created_at desc limit 10`,
        [ctx.userId],
      )
    ).rows;
    return { cohorts, counts, rows, notices };
  });

  const count = (k: Stage | null) => data.counts.filter((x) => !k || x.stage === k).reduce((a, x) => a + x.n, 0);
  const link = (next: { etapa?: string | null }) => {
    const q = new URLSearchParams();
    const e = next.etapa === undefined ? stage : next.etapa;
    if (e) q.set("etapa", e);
    if (cohortId) q.set("turma", cohortId);
    if (term) q.set("busca", term);
    return `${base}/inscricoes${q.size ? `?${q}` : ""}`;
  };
  const filtered = !!(stage || cohortId || term);

  return (
    <div className="flex flex-col gap-5">
      <PageHead title="Inscrições" sub="Acompanhe cada aluno até o acesso ser liberado." />

      {data.notices.length > 0 && (
        <section aria-labelledby="novidades" className="flex flex-col gap-2 rounded-2xl border border-line bg-surface px-5 py-4">
          <h2 id="novidades" className="m-0 flex items-center gap-2 font-sans text-base font-semibold">
            <Icon name="bell" size={20} className="text-brand-ink" />
            Novidades
          </h2>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[15px] text-ink-muted">
            {data.notices.map((n) => <li key={n.id}>{n.message}</li>)}
          </ul>
          <ActionForm action={markStaffNoticesReadAction.bind(null, slug)} submitLabel="Marcar como lidas" submitClassName={cx(btnText, "self-start -ml-2.5")} className="flex flex-col gap-1" />
        </section>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <form method="get" action={`${base}/inscricoes`} className="contents">
          {stage && <input type="hidden" name="etapa" value={stage} />}
          <label className={`${labelCls} max-w-[320px] flex-[1_1_220px] text-[13px]`}>
            Buscar aluno
            <input name="busca" type="search" defaultValue={term ?? ""} placeholder="Nome ou e-mail" className={inputCls} />
          </label>
          <label className={`${labelCls} text-[13px]`}>
            {labels.cohort.singular}
            <AutoSelect name="turma" defaultValue={cohortId ?? ""} className={cx(inputCls, "w-auto pr-8")}>
              <option value="">Todas as {labels.cohort.plural.toLowerCase()}</option>
              {data.cohorts.map((co) => <option key={co.id} value={co.id}>{co.name}</option>)}
            </AutoSelect>
          </label>
          <button type="submit" className={btnOutline}>Filtrar</button>
        </form>
        <nav aria-label="Etapa" className="flex flex-wrap gap-1.5">
          <Pill href={link({ etapa: null })} active={!stage} label="Todas" count={count(null)} />
          {(["documents", "payment", "released"] as Stage[]).map((k) => (
            <Pill key={k} href={link({ etapa: k })} active={stage === k} label={STAGE_LABELS[k]} count={count(k)} />
          ))}
        </nav>
      </div>

      {data.rows.length === 0 ? (
        <EmptyBox
          icon={filtered ? "search" : "howToReg"}
          title={filtered ? "Nenhuma inscrição neste filtro" : "Nenhuma inscrição ainda"}
          action={filtered ? <Link href={`${base}/inscricoes`} className={btnOutline}>Limpar filtros</Link> : undefined}
        >
          {filtered ? "Tente outro nome, outra turma ou outra etapa." : "Quem se inscrever pela vitrine aparece aqui, com a etapa em que está."}
        </EmptyBox>
      ) : (
        <div className={tableWrap}>
          <table className={tableCls}>
            <thead>
              <tr>
                <th scope="col" className={thCls}>Aluno</th>
                <th scope="col" className={thCls}>{labels.cohort.singular}</th>
                <th scope="col" className={thCls}>Etapa</th>
                <th scope="col" className={thCls}>Documentos</th>
                <th scope="col" className={thCls}>Inscrição</th>
                <th scope="col" className={`${thCls} text-right`}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const t = STAGE_TAG[r.stage];
                return (
                  <tr key={r.id} className={trCls}>
                    <td className={tdCls}>
                      <strong className="font-semibold">{r.student}</strong>
                      <br />
                      <span className="text-[13px] text-ink-subtle">{r.email}</span>
                    </td>
                    <td className={`${tdCls} whitespace-nowrap`}>{r.cohort_name}</td>
                    <td className={tdCls}><Tag tone={t.tone} icon={t.icon}>{t.label}</Tag></td>
                    <td className={`${tdCls} whitespace-nowrap text-ink-muted`}>
                      {r.sent} de {r.required}
                      {r.review > 0 && <span className="block text-[13px] font-semibold text-warning">{r.review} em análise</span>}
                    </td>
                    <td className={`${tdCls} whitespace-nowrap text-ink-muted`}>{shortDate(r.created_at)}</td>
                    <td className={`${tdCls} text-right`}>
                      <div className="flex flex-col items-end gap-1">
                        {r.stage === "payment" && canRelease ? (
                          <ActionForm
                            action={releaseAccessAction.bind(null, slug, r.id)}
                            submitLabel="Liberar acesso"
                            pendingLabel="Liberando..."
                            confirm={`Confirma que o pagamento de ${r.student} foi recebido? O acesso será liberado.`}
                            submitClassName={btnText}
                            className="flex flex-col items-end gap-1 text-left"
                          />
                        ) : null}
                        {canReview && r.stage !== "released" && (
                          <Link href={`${base}/documentos?inscricao=${r.id}`} className={btnText}>
                            {r.review > 0 ? "Revisar documentos" : "Ver documentos"}
                          </Link>
                        )}
                        {r.stage === "released" && <span className="px-2.5 text-[13px] text-ink-subtle">Acesso liberado</span>}
                      </div>
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
