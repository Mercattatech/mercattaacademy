import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { btnPrimary, inputCls, PageHead } from "@/components/admin-ui";
import { withContext } from "@/lib/db";
import { requireMaster } from "@/lib/guards";
import { formatBRL } from "@/lib/services/billing";
import { createTenantAction } from "../actions";
import { rootDomain } from "../data";
import { NameSlugFields } from "../master-ui";
import { cx } from "@/components/ui";

const labelCls = "flex flex-col gap-1.5 text-sm font-semibold";
const bigInput = cx(inputCls, "h-12 text-base");

/** Cadastrar instituição (protótipo): coluna de 560px, endereço com o domínio ao lado. */
export default async function NewTenantPage() {
  const { userId } = await requireMaster("/master/nova");
  const plans = await withContext({ userId, master: true }, async (c) =>
    (
      await c.query<{ id: string; name: string; price_per_course_cents: number; included_students: number; extra_student_cents: number }>(
        "select id, name, price_per_course_cents, included_students, extra_student_cents from plans where active order by created_at",
      )
    ).rows,
  );
  const brl0 = (cents: number) => formatBRL(cents).replace(/,00$/, "");

  return (
    <div className="flex max-w-[560px] flex-col gap-6">
      <PageHead
        crumbs={[{ href: "/master/instituicoes", label: "Instituições" }]}
        title="Cadastrar instituição"
        sub="Ela começa em implantação, com os recursos opcionais desligados. O administrador recebe um convite por e-mail para criar a senha."
      />
      <ActionForm
        action={createTenantAction}
        submitLabel="Cadastrar e enviar convite"
        pendingLabel="Cadastrando..."
        submitClassName={cx(btnPrimary, "h-12 self-start px-5 text-base")}
        className="flex flex-col gap-5"
      >
        <NameSlugFields root={rootDomain()} />
        <label className={labelCls}>
          Plano
          <select name="planId" required className={`${bigInput} px-2.5`}>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {brl0(p.price_per_course_cents)} por curso até {p.included_students} alunos, {brl0(p.extra_student_cents)} por aluno a mais
              </option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          Nome do administrador <span className="-mt-1 text-[13px] font-normal text-ink-subtle">Opcional. Aparece no convite.</span>
          <input name="adminName" autoComplete="off" className={bigInput} />
        </label>
        <label className={labelCls}>
          E-mail do administrador
          <input name="adminEmail" type="email" required autoComplete="off" placeholder="nome@instituicao.com.br" className={bigInput} />
        </label>
      </ActionForm>
      <Link href="/master/instituicoes" className="-mt-2 self-start text-[15px] font-semibold text-ink-muted no-underline hover:text-ink">
        Cancelar
      </Link>
    </div>
  );
}
