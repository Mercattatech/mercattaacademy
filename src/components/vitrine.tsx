import Link from "next/link";
import { formatBRL } from "@/lib/services/billing";
import type { ShowcaseProgram } from "@/lib/services/showcase";
import type { Labels } from "@/lib/tenant";
import { Icon } from "./icon";

export function priceText(cents: number | null): string {
  return cents == null ? "Consulte a secretaria" : formatBRL(cents);
}

/** Preço como no protótipo: parcela em destaque e o total à vista embaixo. */
export function priceParts(p: Pick<ShowcaseProgram, "price_cents" | "max_installments" | "payment_note">): { main: string; sub: string | null } {
  if (p.price_cents == null) return { main: "Consulte a secretaria", sub: null };
  if (p.max_installments > 1) {
    return { main: `${p.max_installments}x ${formatBRL(Math.ceil(p.price_cents / p.max_installments))}`, sub: `ou ${formatBRL(p.price_cents)} à vista` };
  }
  return { main: formatBRL(p.price_cents), sub: p.payment_note || null };
}

export const monthsText = (n: number | null) => (n ? `${n} ${n === 1 ? "mês" : "meses"}` : null);

/** Lista pública de cursos publicados (protótipo, Vitrine pública: linhas largas com preço à direita). */
export function Vitrine({ slug, labels, programs }: { slug: string; labels: Labels; programs: ShowcaseProgram[] }) {
  const cohortWord = (n: number) => (n === 1 ? labels.cohort.singular : labels.cohort.plural).toLowerCase();
  return (
    <section aria-labelledby="v-cursos" className="mx-auto flex w-full max-w-[1120px] flex-col gap-2 px-4 pt-6 pb-[72px] sm:px-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3 pb-3">
        <h2 id="v-cursos" className="m-0 font-display text-[28px] font-[650] tracking-[-0.015em]">{labels.program.plural}</h2>
        {programs.length > 0 && (
          <span className="text-sm text-ink-subtle">
            {programs.length} {programs.length === 1 ? "curso" : "cursos"}
          </span>
        )}
      </div>
      {programs.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-[20px] bg-canvas px-7 py-10">
          <Icon name="calendar" size={32} className="text-brand" />
          <strong className="text-lg">Novas turmas em breve</strong>
          <span className="max-w-[48ch] text-[15px] text-ink-muted">
            No momento não há inscrições abertas. Acompanhe esta página ou fale com a secretaria.
          </span>
        </div>
      ) : (
        <ul className="m-0 list-none border-t border-line p-0">
          {programs.map((p) => {
            const price = priceParts(p);
            const months = monthsText(p.months);
            return (
              <li key={p.id} className="border-b border-line">
                <Link
                  href={`/t/${slug}/cursos/${p.id}`}
                  className="-mx-4 flex flex-wrap items-start gap-x-10 gap-y-4 rounded-2xl px-4 py-7 text-ink no-underline hover:bg-canvas hover:text-ink sm:-mx-5 sm:px-5"
                >
                  <span className="flex min-w-0 flex-[1_1_380px] flex-col gap-2">
                    <span className="font-display text-[26px] leading-[1.15] font-semibold tracking-[-0.015em]">{p.name}</span>
                    {p.summary && <span className="max-w-[56ch] text-base text-ink-muted">{p.summary}</span>}
                    <span className="mt-1 flex flex-wrap gap-x-4 gap-y-2 text-sm text-ink-muted">
                      {p.workload_hours && (
                        <span className="flex items-center gap-1.5"><Icon name="clock" size={18} />{p.workload_hours} horas</span>
                      )}
                      {months && (
                        <span className="flex items-center gap-1.5"><Icon name="calendar" size={18} />{months}</span>
                      )}
                      {p.open_cohorts > 0 ? (
                        <span className="flex items-center gap-1.5 font-semibold text-success">
                          <Icon name="howToReg" size={18} />
                          {p.open_cohorts} {cohortWord(p.open_cohorts)} com inscrição aberta
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5">Sem inscrições abertas agora</span>
                      )}
                    </span>
                  </span>
                  <span className="flex min-w-[200px] flex-none flex-col gap-0.5">
                    {p.max_installments > 1 && p.price_cents != null && <span className="text-[13px] text-ink-subtle">a partir de</span>}
                    <span className="font-display text-[28px] font-semibold tracking-[-0.02em]">{price.main}</span>
                    {price.sub && <span className="text-sm text-ink-muted">{price.sub}</span>}
                    <span className="mt-2.5 flex items-center gap-1 text-[15px] font-semibold text-brand-ink">
                      Ver curso e {labels.cohort.plural.toLowerCase()}
                      <Icon name="chevronRight" size={20} />
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const STEPS = [
  { icon: "howToReg", title: "Inscrição", body: "Escolha a turma e crie sua conta." },
  { icon: "upload", title: "Documentos", body: "Envie pelo celular. A secretaria confere." },
  { icon: "payments", title: "Pagamento", body: "Abre depois do envio dos documentos." },
  { icon: "playCircle", title: "Acesso", body: "Aulas, materiais e notas na sua área." },
] as const;

/** Topo da vitrine: chamada à esquerda e, no lugar da foto do protótipo, as quatro etapas da matrícula. */
export function VitrineHero({ tenantName, labels }: { tenantName: string; labels: Labels }) {
  return (
    <section className="mx-auto flex w-full max-w-[1120px] flex-wrap items-end gap-x-14 gap-y-8 px-4 pt-10 pb-10 sm:px-8 md:pt-16">
      <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-4">
        <p className="m-0 text-sm font-semibold text-brand-ink">{tenantName}</p>
        <h1 className="m-0 font-display text-[40px] leading-[1.04] font-[650] tracking-[-0.03em] text-balance md:text-[56px]">
          {labels.program.plural} com inscrição online.
        </h1>
        <p className="m-0 max-w-[46ch] text-lg text-pretty text-ink-muted">
          Escolha o curso, confira valores e {labels.cohort.plural.toLowerCase()} abertas e faça a matrícula sem sair de casa.
        </p>
      </div>
      <ol className="m-0 grid min-w-0 flex-[1_1_320px] list-none grid-cols-2 gap-3 rounded-3xl bg-brand-soft p-5 sm:p-6">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex flex-col gap-1.5 rounded-2xl bg-surface p-4">
            <span className="flex items-center gap-2 text-brand-ink">
              <Icon name={s.icon} size={20} />
              <span className="text-xs font-bold">{i + 1}</span>
            </span>
            <strong className="text-[15px]">{s.title}</strong>
            <span className="text-[13px] text-ink-muted">{s.body}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
