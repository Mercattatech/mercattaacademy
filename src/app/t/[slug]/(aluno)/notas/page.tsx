import { notFound, redirect } from "next/navigation";
import { Card, Chip, Empty, Meter, Screen, ScreenTitle, SectionTitle, StatusText } from "@/components/student-ui";
import { withContext } from "@/lib/db";
import { formatNumber } from "@/lib/format";
import { boletimsFor, reasonText, SITUATION_LABELS, type Boletim } from "@/lib/services/grades";
import { getSession } from "@/lib/session";
import { resolveTenant } from "@/lib/tenant";

const situationChip = (s: Boletim["standing"]["situation"]) =>
  s === "approved" ? <Chip tone="success" icon="checkCircle">{SITUATION_LABELS[s]}</Chip>
  : s === "failed" ? <Chip tone="danger" icon="warning">{SITUATION_LABELS[s]}</Chip>
  : <Chip tone="brand" icon="pending">{SITUATION_LABELS[s]}</Chip>;

/** Notas e frequência (tela 08 do protótipo). */
export default async function StudentGradesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await resolveTenant(slug);
  if (!tenant) notFound();
  const session = await getSession();
  if (!session) redirect(`/login?voltar=${encodeURIComponent(`/t/${slug}/notas`)}`);
  const list = await withContext({ tenantId: tenant.id, userId: session.user.id }, (c) => boletimsFor(c, session.user.id));

  return (
    <Screen>
      {list.length === 0 && (
        <>
          <ScreenTitle>Notas</ScreenTitle>
          <Empty icon="grading" title="Ainda não há notas">
            Suas notas aparecem aqui quando o acesso ao curso estiver liberado e o professor lançar a primeira avaliação.
          </Empty>
        </>
      )}

      {list.map((b, i) => {
        const st = b.standing;
        const closed = st.modules.filter((m) => m.average != null);
        const partial = closed.length ? closed.reduce((s, m) => s + (m.average as number), 0) / closed.length : null;
        const grade = st.finalGrade ?? partial;
        const gradeOk = grade != null && grade + 1e-9 >= b.rules.minGrade;
        const freqOk = st.frequency != null && st.frequency + 1e-9 >= b.rules.minFrequencyPercent;
        const reason = reasonText(st);
        return (
          <section key={b.enrollmentId} aria-labelledby={`b-${b.enrollmentId}`} className={`flex flex-col gap-6 ${i > 0 ? "border-t border-line pt-8" : ""}`}>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <h1 id={`b-${b.enrollmentId}`} className="m-0 font-display text-[30px] font-[650] leading-[1.1] tracking-[-0.02em]">Notas</h1>
                {situationChip(st.situation)}
              </div>
              <p className="m-0 text-sm text-ink-muted">{b.program} · {b.cohort}</p>
            </div>

            <Card className="flex flex-col gap-[22px]">
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[15px] font-semibold">{st.finalGrade != null ? "Média final" : "Média parcial"}</span>
                  <span>
                    <span className="font-display text-[30px] font-semibold">{grade == null ? "–" : formatNumber(grade)}</span>
                    <span className="text-sm text-ink-subtle"> / mínimo {formatNumber(b.rules.minGrade)}</span>
                  </span>
                </div>
                <Meter label="Média" percent={(grade ?? 0) * 10} goal={b.rules.minGrade * 10} />
                {grade == null ? (
                  <StatusText tone="muted" icon="pending">Sem módulo fechado ainda</StatusText>
                ) : gradeOk ? (
                  <StatusText tone="success" icon="checkCircle">Acima do mínimo</StatusText>
                ) : (
                  <StatusText tone="warning" icon="warning">Abaixo do mínimo</StatusText>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[15px] font-semibold">Frequência</span>
                  <span>
                    <span className="font-display text-[30px] font-semibold">{st.frequency == null ? "–" : `${formatNumber(st.frequency, 0)}%`}</span>
                    <span className="text-sm text-ink-subtle"> / mínimo {b.rules.minFrequencyPercent}%</span>
                  </span>
                </div>
                <Meter label="Frequência" percent={st.frequency ?? 0} goal={b.rules.minFrequencyPercent} />
                {st.frequency == null ? (
                  <StatusText tone="muted" icon="pending">Sem aulas com presença fechada</StatusText>
                ) : freqOk ? (
                  <StatusText tone="success" icon="checkCircle">Acima do mínimo</StatusText>
                ) : (
                  <StatusText tone="warning" icon="warning">Abaixo do mínimo, fale com a coordenação</StatusText>
                )}
              </div>
              {reason && <p className="m-0 border-t border-line pt-4 text-sm text-ink-muted">{reason}</p>}
            </Card>

            <div className="flex flex-col gap-2.5">
              <SectionTitle>Boletim</SectionTitle>
              {b.modules.length === 0 ? (
                <p className="m-0 text-sm text-ink-muted">Ainda não há avaliações neste curso.</p>
              ) : (
                <div className="flex flex-col">
                  {b.modules.map((m) => {
                    const sm = st.modules.find((x) => x.moduleId === m.id);
                    const done = m.average != null;
                    return (
                      <details key={m.id} className="group border-b border-line last:border-b-0">
                        <summary className="grid cursor-pointer list-none grid-cols-[1fr_auto] gap-x-3 gap-y-1 py-3.5 [&::-webkit-details-marker]:hidden">
                          <span className="text-[15px] font-semibold">{m.name}</span>
                          <span className={`text-right font-display text-xl font-semibold ${done ? "" : "text-ink-subtle"}`}>{done ? formatNumber(m.average as number) : "–"}</span>
                          <span className="text-[13px] text-ink-muted">
                            {sm ? `${sm.graded} de ${sm.total} avaliaç${sm.total > 1 ? "ões" : "ão"} com nota` : ""} · ver detalhes
                          </span>
                          {done ? (
                            (m.average as number) + 1e-9 >= b.rules.minGrade ? (
                              <StatusText tone="success" icon="checkCircle">Fechado</StatusText>
                            ) : (
                              <StatusText tone="warning" icon="warning">Abaixo</StatusText>
                            )
                          ) : (
                            <StatusText tone="brand" icon="pending">Em andamento</StatusText>
                          )}
                        </summary>
                        <ul className="m-0 mb-3 flex list-none flex-col gap-1 rounded-xl bg-surface p-3">
                          {m.assessments.map((a) => (
                            <li key={a.id} className="flex items-baseline justify-between gap-3 text-sm">
                              <span>{a.title} <span className="text-ink-subtle">· peso {formatNumber(a.weight, 0)}</span></span>
                              <span className="font-semibold whitespace-nowrap">{a.score == null ? <span className="font-normal text-ink-subtle">sem nota</span> : `${formatNumber(a.score)} / ${formatNumber(a.max)}`}</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        );
      })}
    </Screen>
  );
}
