import { ActionForm } from "@/components/action-form";
import { btnPrimary, inputCls, PageHead } from "@/components/admin-ui";
import { Icon } from "@/components/icon";
import { withContext } from "@/lib/db";
import { requireMaster } from "@/lib/guards";
import { formatBRL } from "@/lib/services/billing";
import { updatePlanAction } from "../actions";
import { FeatureMatrix } from "./feature-matrix";
import { btn, cx } from "@/components/ui";

type Plan = { id: string; name: string; price_per_course_cents: number; included_students: number; extra_student_cents: number; tenants: number };
type Feature = { key: string; name: string; description: string; kind: "core" | "optional" };

const labelCls = "flex flex-col gap-1.5 text-sm font-semibold";

/** Planos e recursos (protótipo): cartão do plano e matriz de recursos opcionais por instituição. */
export default async function MasterPlansPage() {
  const { userId } = await requireMaster("/master/planos");

  const { plans, features, tenants } = await withContext({ userId, master: true }, async (c) => {
    const plans = (
      await c.query<Plan>(
        `select p.id, p.name, p.price_per_course_cents, p.included_students, p.extra_student_cents,
                (select count(*)::int from tenants t where t.plan_id = p.id and t.status <> 'deleted') as tenants
         from plans p where p.active order by p.price_per_course_cents`,
      )
    ).rows;
    const features = (await c.query<Feature>("select key, name, description, kind from features order by sort_order")).rows;
    const tenants = (
      await c.query<{ slug: string; name: string; enabled: string[] }>(
        `select t.slug, t.name,
                coalesce(array(select tf.feature_key from tenant_features tf where tf.tenant_id = t.id and tf.enabled), '{}') as enabled
         from tenants t where t.status <> 'deleted' order by t.name`,
      )
    ).rows;
    return { plans, features, tenants };
  });

  const core = features.filter((f) => f.kind === "core");
  const optional = features.filter((f) => f.kind === "optional");
  const brl0 = (cents: number) => formatBRL(cents).replace(/,00$/, "");

  return (
    <div className="flex flex-col gap-7">
      <PageHead title="Planos e recursos" sub="Os recursos do núcleo vêm em todos os planos. Os opcionais são ligados por instituição." />

      {plans.map((p) => (
        <details key={p.id} className="group rounded-2xl border border-line bg-surface">
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-8 gap-y-4 p-5 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 flex-[1_1_260px]">
              <span className="text-[13px] font-semibold text-ink-subtle">PLANO</span>
              <span className="mt-0.5 block font-display text-2xl font-semibold">{p.name}</span>
              <span className="mt-1 block text-sm text-ink-muted">
                {brl0(p.price_per_course_cents)} por curso publicado com até {p.included_students} alunos ativos, mais {brl0(p.extra_student_cents)} por aluno a mais.
              </span>
            </span>
            <span className="text-sm text-ink-muted">
              <strong className="font-display text-[22px] text-ink">{p.tenants}</strong> {p.tenants === 1 ? "instituição" : "instituições"}
            </span>
            <span className={btn("secondary", "md", "gap-1.5 group-open:bg-sunken")}>
              <Icon name="edit" size={18} />
              Editar valores
            </span>
          </summary>
          <div className="border-t border-line px-5 py-5">
            <ActionForm action={updatePlanAction.bind(null, p.id)} submitLabel="Salvar valores" submitClassName={cx(btnPrimary, "self-start")} className="grid max-w-3xl gap-4 sm:grid-cols-3">
              <label className={labelCls}>
                Por curso publicado (R$)
                <input name="price" type="number" step="0.01" min="0" inputMode="decimal" required defaultValue={(p.price_per_course_cents / 100).toFixed(2)} className={inputCls} />
              </label>
              <label className={labelCls}>
                Alunos incluídos por curso
                <input name="included" type="number" step="1" min="0" required defaultValue={p.included_students} className={inputCls} />
              </label>
              <label className={labelCls}>
                Por aluno a mais (R$)
                <input name="extra" type="number" step="0.01" min="0" inputMode="decimal" required defaultValue={(p.extra_student_cents / 100).toFixed(2)} className={inputCls} />
              </label>
              <p className="m-0 text-[13px] text-ink-subtle sm:col-span-3">Vale para as próximas cobranças. As já geradas não mudam.</p>
            </ActionForm>
          </div>
        </details>
      ))}
      {plans.length === 0 && <p className="m-0 text-[15px] text-ink-muted">Nenhum plano ativo cadastrado.</p>}

      <section aria-labelledby="opcionais" className="flex flex-col gap-3">
        <h2 id="opcionais" className="m-0 font-sans text-lg font-semibold">Recursos opcionais por instituição</h2>
        {tenants.length === 0 || optional.length === 0 ? (
          <p className="m-0 text-[15px] text-ink-muted">Nada para mostrar ainda.</p>
        ) : (
          <>
            <FeatureMatrix features={optional.map((f) => ({ key: f.key, name: f.name }))} tenants={tenants} />
            <p className="m-0 text-[13px] text-ink-subtle">Passe o mouse no cabeçalho para ver o nome completo de cada recurso. A mudança fica registrada na auditoria.</p>
          </>
        )}
      </section>

      <section aria-labelledby="nucleo" className="flex flex-col gap-3">
        <h2 id="nucleo" className="m-0 font-sans text-lg font-semibold">Núcleo, em todas as instituições</h2>
        <ul className="m-0 grid list-none gap-x-8 gap-y-3 p-0 sm:grid-cols-2">
          {core.map((f) => (
            <li key={f.key} className="flex gap-2.5">
              <Icon name="checkCircle" size={20} className="mt-0.5 text-success" />
              <span>
                <span className="block text-[15px] font-semibold">{f.name}</span>
                <span className="block text-sm text-ink-muted">{f.description}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
