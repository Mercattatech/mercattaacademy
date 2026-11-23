import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icon";
import { monthsText, priceParts } from "@/components/vitrine";
import { shortDate } from "@/lib/format";
import { getShowcaseProgram } from "@/lib/services/showcase";
import { getLabels, resolveTenant } from "@/lib/tenant";
import { CohortPicker, type PickCohort } from "./cohort-picker";

const day = (d: string) => shortDate(`${d}T12:00:00`);

/** Página do curso (protótipo, Vitrine pública): dados, módulos e documentos à esquerda; preço e turmas à direita. */
export default async function ShowcaseProgramPage({ params }: { params: Promise<{ slug: string; programId: string }> }) {
  const { slug, programId } = await params;
  const tenant = await resolveTenant(slug);
  if (!tenant) notFound();
  const [labels, detail] = await Promise.all([getLabels(tenant.id), getShowcaseProgram(tenant.id, programId)]);
  if (!detail) notFound();
  const { program, modules, cohorts, documents } = detail;
  const price = priceParts(program);
  const months = monthsText(program.months);
  const cohortWord = labels.cohort.singular.toLowerCase();

  const facts = [
    program.workload_hours ? { k: "Carga horária", v: `${program.workload_hours} h`, big: true } : null,
    months ? { k: "Duração", v: months, big: true } : null,
    modules.length ? { k: labels.module.plural, v: String(modules.length), big: true } : null,
    cohorts[0]?.starts_on ? { k: "Próximo início", v: day(cohorts[0].starts_on), big: true } : null,
  ].filter((f): f is { k: string; v: string; big: boolean } => !!f);

  const pick: PickCohort[] = cohorts.map((c) => ({
    id: c.id,
    name: c.name,
    when: [c.starts_on ? `começa em ${day(c.starts_on)}` : "início a definir", c.ends_on ? `termina em ${day(c.ends_on)}` : null].filter(Boolean).join(" · "),
    until: c.enrollment_closes_on ? day(c.enrollment_closes_on) : null,
  }));

  return (
    <div className={`mx-auto flex max-w-[1120px] flex-col gap-7 px-4 pt-6 sm:px-8 ${pick.length ? "pb-32 md:pb-[72px]" : "pb-[72px]"}`}>
      <nav aria-label="Caminho" className="flex items-center gap-1 text-sm">
        <Link href={`/t/${slug}`} className="inline-flex min-h-8 items-center font-semibold text-brand-ink underline underline-offset-2">{labels.program.plural}</Link>
        <Icon name="chevronRight" size={18} className="text-ink-subtle" />
        <span className="truncate text-ink-muted">{program.name}</span>
      </nav>

      <div className="flex flex-wrap items-start gap-x-14 gap-y-10">
        <div className="flex min-w-0 flex-[1_1_560px] flex-col gap-9">
          <div className="flex flex-col gap-3.5">
            <p className="m-0 text-sm font-semibold text-brand-ink">{labels.program.singular} · {tenant.name}</p>
            <h1 className="m-0 font-display text-[34px] leading-[1.06] font-[650] tracking-[-0.025em] text-balance md:text-[44px]">{program.name}</h1>
            {program.summary && <p className="m-0 max-w-[56ch] text-lg text-pretty text-ink-muted">{program.summary}</p>}
          </div>

          {facts.length > 0 && (
            <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(128px,1fr))] gap-5 border-y border-line py-5">
              {facts.map((f) => (
                <div key={f.k}>
                  <dt className="text-[13px] text-ink-subtle">{f.k}</dt>
                  <dd className="m-0 mt-1 font-display text-[22px] font-semibold">{f.v}</dd>
                </div>
              ))}
            </dl>
          )}

          {program.description && <p className="m-0 max-w-[64ch] text-base whitespace-pre-line text-ink-muted">{program.description}</p>}

          <section aria-labelledby="modulos" className="flex flex-col gap-2">
            <h2 id="modulos" className="m-0 mb-2 font-display text-2xl font-semibold tracking-[-0.01em]">{labels.module.plural}</h2>
            {modules.length === 0 ? (
              <p className="m-0 text-[15px] text-ink-muted">A grade ainda não foi divulgada.</p>
            ) : (
              <ol className="m-0 list-none p-0">
                {modules.map((m, i) => (
                  <li key={m.id} className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-baseline gap-3 border-t border-line py-3.5">
                    <span className="font-display text-lg font-semibold text-ink-subtle">{i + 1}</span>
                    <span>
                      <span className="block text-base font-semibold">{m.name}</span>
                      {m.teacher_name && <span className="text-sm text-ink-muted">{m.teacher_name}</span>}
                      {m.syllabus && (
                        <details className="group mt-1">
                          <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 text-sm font-semibold text-brand-ink [&::-webkit-details-marker]:hidden">
                            <Icon name="chevronRight" size={16} className="transition-transform group-open:rotate-90" />
                            Ementa
                          </summary>
                          <p className="m-0 mt-1 text-sm whitespace-pre-line text-ink-muted">{m.syllabus}</p>
                        </details>
                      )}
                    </span>
                    <span className="text-sm whitespace-nowrap text-ink-muted">{m.workload_hours ? `${m.workload_hours} h` : ""}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {documents.length > 0 && (
            <section aria-labelledby="docs" className="flex flex-col gap-3">
              <h2 id="docs" className="m-0 font-display text-2xl font-semibold tracking-[-0.01em]">Documentos para a matrícula</h2>
              <p className="m-0 text-[15px] text-ink-muted">Você envia depois da inscrição, pelo celular. PDF, JPG ou PNG.</p>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {documents.map((d) => (
                  <li key={d.id} className="flex items-center gap-2.5 text-[15px]">
                    <Icon name="file" size={20} className="text-ink-muted" />
                    {d.name}
                    {!d.required && <span className="text-[13px] text-ink-subtle">(opcional)</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside aria-label="Inscrição" className="flex w-full max-w-full flex-[1_1_320px] flex-col gap-4 rounded-3xl bg-canvas p-6 md:sticky md:top-24 md:max-w-[400px]">
          <div>
            <span className="text-[13px] text-ink-subtle">Investimento</span>
            <div className="mt-0.5 font-display text-[34px] leading-[1.1] font-semibold tracking-[-0.02em]">{price.main}</div>
            {price.sub && <div className="mt-1 text-[15px] text-ink-muted">{price.sub}</div>}
          </div>
          {pick.length === 0 ? (
            <div className="flex flex-col gap-1.5 rounded-[14px] bg-surface p-4">
              <strong className="text-[15px]">Sem {labels.cohort.plural.toLowerCase()} com inscrição aberta</strong>
              <span className="text-sm text-ink-muted">Fale com a secretaria para saber da próxima.</span>
            </div>
          ) : (
            <CohortPicker slug={slug} cohorts={pick} priceMain={price.main} cohortWord={cohortWord} />
          )}
        </aside>
      </div>
    </div>
  );
}
