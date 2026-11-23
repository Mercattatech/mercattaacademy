import { ActionForm } from "@/components/action-form";
import { btnPrimary, inputCls, labelCls, PageHead } from "@/components/admin-ui";
import { requireStaff } from "@/lib/guards";
import { getLabels } from "@/lib/tenant";
import { TenantLogo } from "../../../_shell/shells";
import { saveSettingsAction } from "../actions";
import { BrandColor } from "./brand-color";
import { cx } from "@/components/ui";

const LABEL_ROWS = [
  { key: "program", title: "Curso", hint: "Ex.: Pós-graduação, Curso, MBA" },
  { key: "cohort", title: "Turma", hint: "Ex.: Turma, Classe, Edição" },
  { key: "module", title: "Matéria", hint: "Ex.: Módulo, Disciplina" },
  { key: "lesson", title: "Aula", hint: "Ex.: Aula, Encontro" },
] as const;

const section = "flex flex-col gap-4 border-t border-line pt-5";
const h2 = "m-0 font-sans text-lg font-semibold";
const help = "mt-1 mb-0 text-sm text-ink-muted";

/** Configurações (protótipo): logo, cor principal, nomes usados e endereço. */
export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireStaff(slug, ["admin"], `/t/${slug}/admin/configuracoes`);
  const labels = await getLabels(ctx.tenant.id);
  const root = process.env.ROOT_DOMAIN ?? "localhost:3000";

  return (
    <div className="flex max-w-[760px] flex-col gap-8">
      <PageHead title="Configurações" sub="Identidade e nomes que alunos e equipe veem." />
      <ActionForm action={saveSettingsAction.bind(null, slug)} submitLabel="Salvar alterações" submitClassName={cx(btnPrimary, "self-start")} className="flex flex-col gap-8">
        <section aria-labelledby="logo" className={section}>
          <h2 id="logo" className={h2}>Logo</h2>
          <div className="flex flex-wrap items-center gap-5">
            <span className="rounded-xl border border-line bg-surface px-4 py-3">
              <TenantLogo tenant={ctx.tenant} className="h-14" />
            </span>
            <span className="max-w-[40ch] text-[13px] text-ink-subtle">Para trocar o logo, envie o arquivo (PNG ou SVG com fundo transparente) para o suporte da plataforma.</span>
          </div>
        </section>

        <section aria-labelledby="cor" className={section}>
          <div>
            <h2 id="cor" className={h2}>Cor principal</h2>
            <p className={help}>Usada em botões, links e item ativo do menu. O resto da interface fica neutro.</p>
          </div>
          <BrandColor initial={ctx.tenant.brand.primary ?? "#7B4F72"} />
        </section>

        <section aria-labelledby="nomes" className={section}>
          <div>
            <h2 id="nomes" className={h2}>Nomes usados na plataforma</h2>
            <p className={help}>Troque se a sua instituição usa outros termos. Aparecem no menu e nas páginas.</p>
          </div>
          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
            {LABEL_ROWS.map((row) => (
              <fieldset key={row.key} className="m-0 grid grid-cols-2 gap-3 border-0 p-0 sm:col-span-2">
                <legend className="sr-only">{row.title}</legend>
                <label className={labelCls}>
                  {row.title} (singular)
                  <input name={`${row.key}_s`} defaultValue={labels[row.key].singular} required className={inputCls} />
                  <span className="text-[13px] font-normal text-ink-subtle">{row.hint}</span>
                </label>
                <label className={labelCls}>
                  Plural
                  <input name={`${row.key}_p`} defaultValue={labels[row.key].plural} required className={inputCls} />
                </label>
              </fieldset>
            ))}
          </div>
        </section>

        <section aria-labelledby="links" className={section}>
          <h2 id="links" className={h2}>Links no rodapé</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelCls}>
              Site
              <input name="site" type="url" defaultValue={ctx.tenant.links.site ?? ""} placeholder="https://" className={inputCls} />
            </label>
            <label className={labelCls}>
              Instagram
              <input name="instagram" type="url" defaultValue={ctx.tenant.links.instagram ?? ""} placeholder="https://instagram.com/..." className={inputCls} />
            </label>
          </div>
        </section>

        <section aria-labelledby="endereco" className={section}>
          <h2 id="endereco" className={h2}>Endereço</h2>
          <div className="flex flex-col gap-1.5 text-sm font-semibold">
            Endereço da sua plataforma
            <span className="flex h-11 max-w-md items-center overflow-hidden rounded-[10px] border border-line bg-sunken text-[15px] font-normal">
              <span className="px-3 font-semibold">{slug}</span>
              <span className="text-ink-subtle">.{root}</span>
            </span>
            <span className="text-[13px] font-normal text-ink-subtle">Para mudar o endereço ou usar um domínio próprio, fale com o suporte.</span>
          </div>
        </section>
      </ActionForm>
    </div>
  );
}
