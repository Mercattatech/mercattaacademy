import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { btnOutline, btnPrimary, EmptyBox, inputCls, labelCls, PageHead, Tag, textareaCls, type Tone } from "@/components/admin-ui";
import { Icon } from "@/components/icon";
import { withContext } from "@/lib/db";
import { can, requireStaff, STAFF_ROLES } from "@/lib/guards";
import { getLabels } from "@/lib/tenant";
import { createProgramAction } from "../actions";
import { cx } from "@/components/ui";

const PROGRAM_STATUS: Record<string, { label: string; tone: Tone; icon: "currentStep" | "edit" | "folder" }> = {
  draft: { label: "Rascunho", tone: "muted", icon: "edit" },
  published: { label: "Publicado", tone: "ok", icon: "currentStep" },
  archived: { label: "Arquivado", tone: "muted", icon: "folder" },
};

/** Pós-graduações (protótipo): lista com situação, alunos e "Editar grade". */
export default async function ProgramsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ novo?: string }> }) {
  const { slug } = await params;
  const { novo } = await searchParams;
  const ctx = await requireStaff(slug, STAFF_ROLES, `/t/${slug}/admin/cursos`);
  const labels = await getLabels(ctx.tenant.id);
  const canCreate = can(ctx, "coordenacao");
  const base = `/t/${slug}/admin/cursos`;
  const programs = await withContext({ tenantId: ctx.tenant.id }, async (c) =>
    (
      await c.query<{ id: string; name: string; status: string; modules: number; cohorts: number; hours: number | null; students: number }>(`
      select p.id, p.name, p.status,
             (select count(*)::int from program_modules m where m.program_id = p.id) as modules,
             (select count(*)::int from cohorts co where co.program_id = p.id) as cohorts,
             (select sum(m.workload_hours)::int from program_modules m where m.program_id = p.id) as hours,
             (select count(distinct e.user_id)::int from enrollments e join cohorts co on co.id = e.cohort_id
               where co.program_id = p.id and e.status = 'active') as students
      from programs p order by p.status = 'archived', p.name`)
    ).rows,
  );
  const published = programs.filter((p) => p.status === "published").length;
  const lower = (n: number, l: { singular: string; plural: string }) => `${n} ${(n === 1 ? l.singular : l.plural).toLowerCase()}`;
  const showForm = canCreate && (novo === "1" || programs.length === 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHead
        title={labels.program.plural}
        sub={programs.length ? `${lower(programs.length, labels.program)} · ${published} ${published === 1 ? "publicado" : "publicados"} na vitrine` : undefined}
        action={
          canCreate && !showForm ? (
            <Link href={`${base}?novo=1`} className={btnPrimary}>
              <Icon name="plus" size={20} />
              Nova {labels.program.singular.toLowerCase()}
            </Link>
          ) : undefined
        }
      />

      {showForm && (
        <section aria-labelledby="novo" className="flex max-w-[760px] flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="novo" className="m-0 font-sans text-lg font-semibold">Nova {labels.program.singular.toLowerCase()}</h2>
              <p className="mt-1 mb-0 text-sm text-ink-muted">Nasce como rascunho. Publique quando a grade estiver pronta.</p>
            </div>
            {programs.length > 0 && (
              <Link href={base} aria-label="Fechar" className="-mt-2 -mr-2 flex size-11 items-center justify-center rounded-[10px] text-ink-muted hover:bg-sunken">
                <Icon name="close" />
              </Link>
            )}
          </div>
          <ActionForm action={createProgramAction.bind(null, slug)} submitLabel="Criar e montar a grade" submitClassName={cx(btnPrimary, "self-start")} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
              <label className={labelCls}>
                Nome
                <input name="name" required className={inputCls} placeholder="Ex.: Harmonização Orofacial" />
              </label>
              <label className={labelCls}>
                Carga horária (h)
                <input name="workloadHours" type="number" min={1} inputMode="numeric" className={inputCls} />
              </label>
            </div>
            <label className={labelCls}>
              Descrição
              <textarea name="description" rows={4} className={textareaCls} />
            </label>
          </ActionForm>
        </section>
      )}

      {programs.length === 0 ? (
        !canCreate && <EmptyBox icon="school" title={`Nenhuma ${labels.program.singular.toLowerCase()} ainda`}>A coordenação cadastra e monta a grade.</EmptyBox>
      ) : (
        <div className="flex flex-col border-t border-line">
          {programs.map((p) => {
            const st = PROGRAM_STATUS[p.status] ?? PROGRAM_STATUS.draft;
            return (
              <div key={p.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line px-1 py-5">
                <span className="flex flex-[1_1_280px] flex-col gap-1">
                  <Link href={`${base}/${p.id}`} className={`text-[17px] font-semibold no-underline hover:underline ${p.status === "archived" ? "text-ink-muted" : "text-ink"}`}>{p.name}</Link>
                  <span className="text-sm text-ink-muted">
                    {lower(p.modules, labels.module)}
                    {p.hours ? ` · ${p.hours} h` : ""} · {lower(p.cohorts, labels.cohort)}
                  </span>
                </span>
                <span className="flex w-[120px]"><Tag tone={st.tone} icon={st.icon}>{st.label}</Tag></span>
                <span className="w-[110px] text-sm text-ink-muted">
                  <strong className="font-display text-xl font-semibold text-ink">{p.students}</strong> alunos
                </span>
                <Link href={`${base}/${p.id}`} className={btnOutline}>{p.status === "archived" ? "Ver" : "Editar grade"}</Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
