import Link from "next/link";
import { btnOutline, btnText, EmptyBox, inputCls, labelCls, PageHead, Tag, tableWrap, tdCls, thCls, trCls } from "@/components/admin-ui";
import { AutoSelect } from "@/components/auto-select";
import { Icon } from "@/components/icon";
import { withContext } from "@/lib/db";
import { formatNumber } from "@/lib/format";
import { requireStaff } from "@/lib/guards";
import { cohortReport, reasonText, SITUATION_LABELS } from "@/lib/services/grades";
import { getLabels } from "@/lib/tenant";
import { cx } from "@/components/ui";

/** Notas e frequência da turma (protótipo: tabela com médias, frequência e situação). */
export default async function ClassReportPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ turma?: string }> }) {
  const { slug } = await params;
  const { turma } = await searchParams;
  const ctx = await requireStaff(slug, ["coordenacao", "secretaria", "professor"], `/t/${slug}/admin/notas`);
  const labels = await getLabels(ctx.tenant.id);
  const base = `/t/${slug}/admin/notas`;
  const { cohorts, report, picked } = await withContext({ tenantId: ctx.tenant.id, userId: ctx.userId }, async (c) => {
    const list = (await c.query<{ id: string; name: string }>("select id, name from cohorts order by created_at desc")).rows;
    const picked = (turma && /^[0-9a-f-]{36}$/i.test(turma) ? list.find((x) => x.id === turma) : list[0]) ?? null;
    return { cohorts: list, report: picked ? await cohortReport(c, picked.id) : null, picked };
  });

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        title="Notas e frequência"
        sub={report ? `Meta: média ${formatNumber(report.rules.minGrade)} e frequência ${report.rules.minFrequencyPercent}%. As notas são lançadas em Avaliações.` : undefined}
        action={<Link href={`/t/${slug}/admin/avaliacoes${picked ? `?turma=${picked.id}` : ""}`} className={btnOutline}><Icon name="grading" size={20} />Lançar notas</Link>}
      />
      {cohorts.length > 0 && (
        <form method="get" action={base} className="flex flex-wrap items-end gap-2">
          <label className={`${labelCls} text-[13px]`}>
            {labels.cohort.singular}
            <AutoSelect name="turma" defaultValue={picked?.id} className={cx(inputCls, "w-auto pr-8")}>
              {cohorts.map((co) => <option key={co.id} value={co.id}>{co.name}</option>)}
            </AutoSelect>
          </label>
          <noscript><button type="submit" className={btnOutline}>Ver</button></noscript>
        </form>
      )}

      {!report ? (
        <EmptyBox icon="assignment" title={`Nenhuma ${labels.cohort.singular.toLowerCase()} ainda`} />
      ) : report.rows.length === 0 ? (
        <EmptyBox icon="assignment" title="Nenhum aluno com acesso liberado">As notas aparecem quando os alunos da turma tiverem acesso.</EmptyBox>
      ) : (
        <div className={tableWrap}>
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr>
                <th scope="col" className={thCls}>Aluno</th>
                {report.modules.map((m) => <th key={m.id} scope="col" className={thCls}>{m.name}</th>)}
                <th scope="col" className={thCls}>Média</th>
                <th scope="col" className={thCls}>Frequência</th>
                <th scope="col" className={thCls}>Situação</th>
                <th scope="col" className={`${thCls} text-right`}>Certificado</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r) => {
                const st = r.standing;
                const lowFreq = st.frequency != null && st.frequency < report.rules.minFrequencyPercent;
                return (
                  <tr key={r.enrollmentId} className={trCls}>
                    <th scope="row" className={`${tdCls} text-left font-semibold`}>{r.student}</th>
                    {report.modules.map((m) => {
                      const avg = st.modules.find((x) => x.moduleId === m.id)?.average;
                      return <td key={m.id} className={`${tdCls} tabular-nums ${avg == null ? "text-ink-subtle" : ""}`}>{avg == null ? "–" : formatNumber(avg)}</td>;
                    })}
                    <td className={`${tdCls} font-semibold tabular-nums`}>{st.finalGrade == null ? "–" : formatNumber(st.finalGrade)}</td>
                    <td className={`${tdCls} tabular-nums`}>
                      <span className={`inline-flex items-center gap-1 ${lowFreq ? "font-semibold text-danger" : ""}`}>
                        {st.frequency == null ? "–" : `${formatNumber(st.frequency, 0)}%`}
                        {lowFreq && <Icon name="warning" size={16} />}
                      </span>
                    </td>
                    <td className={tdCls}>
                      <Tag tone={st.situation === "approved" ? "ok" : st.situation === "failed" ? "bad" : "brand"} icon={st.situation === "approved" ? "checkCircle" : st.situation === "failed" ? "error" : "clock"}>
                        {SITUATION_LABELS[st.situation]}
                      </Tag>
                      <span className="mt-1 block max-w-[220px] text-[13px] text-ink-muted">{reasonText(st)}</span>
                    </td>
                    <td className={`${tdCls} text-right`}>
                      {r.certificate ? (
                        <a href={`/t/${slug}/certificados/${r.certificate.id}`} className={btnText}>{r.certificate.revoked ? "Anulado" : "Baixar"}</a>
                      ) : (
                        <span className="px-2.5 text-[13px] text-ink-subtle">{st.situation === "failed" ? "Não emitido" : "–"}</span>
                      )}
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
