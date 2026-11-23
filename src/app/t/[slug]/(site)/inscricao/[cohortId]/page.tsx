import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Icon } from "@/components/icon";
import { priceParts } from "@/components/vitrine";
import { withContext } from "@/lib/db";
import { shortDate } from "@/lib/format";
import { OPEN_COHORT } from "@/lib/services/showcase";
import { getSession } from "@/lib/session";
import { getLabels, resolveTenant } from "@/lib/tenant";
import { enrollAction, signUpAndEnrollAction } from "./actions";
import { bigCta, SignupForm } from "./signup-form";

type Info = {
  id: string;
  name: string;
  program_id: string;
  program_name: string;
  price_cents: number | null;
  payment_note: string;
  max_installments: number;
  starts_on: string | null;
  is_open: boolean;
  docs: string[];
};

const STEPS = ["Inscrição", "Documentos", "Pagamento", "Acesso"];

/** Inscrição (protótipo): coluna de 560px, etapas no topo e criação de conta. */
export default async function EnrollPage({ params }: { params: Promise<{ slug: string; cohortId: string }> }) {
  const { slug, cohortId } = await params;
  const tenant = await resolveTenant(slug);
  if (!tenant || !/^[0-9a-f-]{36}$/i.test(cohortId)) notFound();
  const labels = await getLabels(tenant.id);

  const info = await withContext({ tenantId: tenant.id }, async (c) =>
    (
      await c.query<Info>(
        `select co.id, co.name, p.id as program_id, p.name as program_name, p.price_cents, p.payment_note, p.max_installments,
                co.starts_on::text, (${OPEN_COHORT} and p.status = 'published') as is_open,
                array(select d.name from document_types d where d.active and d.required order by d.position, d.name) as docs
         from cohorts co join programs p on p.tenant_id = co.tenant_id and p.id = co.program_id
         where co.id = $1 and p.status = 'published'`,
        [cohortId],
      )
    ).rows[0],
  );
  if (!info) notFound();

  const session = await getSession();
  const back = `/t/${slug}/inscricao/${cohortId}`;
  const price = priceParts(info);
  const meta = [`${info.program_name} · ${info.name}`, info.starts_on ? `começa em ${shortDate(`${info.starts_on}T12:00:00`)}` : null, price.main].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto flex max-w-[560px] flex-col gap-6 px-4 pt-8 pb-[72px] sm:px-8">
      <Link href={`/t/${slug}/cursos/${info.program_id}`} className="inline-flex min-h-11 items-center gap-1.5 self-start text-[15px] font-semibold text-brand-ink no-underline">
        <Icon name="arrowBack" size={20} />
        Voltar ao curso
      </Link>

      <ol aria-label="Etapas" className="m-0 grid list-none grid-cols-4 gap-1.5 p-0">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === 0 ? "step" : undefined} className="flex flex-col gap-1.5">
            <span className={`h-1 rounded-sm ${i === 0 ? "bg-brand" : "bg-line"}`} />
            <span className={`text-xs ${i === 0 ? "font-bold text-brand-ink" : "font-semibold text-ink-subtle"}`}>{s}</span>
          </li>
        ))}
      </ol>

      {!info.is_open ? (
        <div role="status" className="flex flex-col items-start gap-2 rounded-[20px] bg-canvas px-6 py-8">
          <Icon name="calendar" size={32} className="text-brand" />
          <strong className="text-lg">Inscrições fechadas</strong>
          <span className="text-[15px] text-ink-muted">Esta {labels.cohort.singular.toLowerCase()} não está recebendo inscrições agora.</span>
          <Link href={`/t/${slug}/cursos/${info.program_id}`} className="mt-1 font-semibold">Ver outras {labels.cohort.plural.toLowerCase()}</Link>
        </div>
      ) : session ? (
        <div className="flex flex-col gap-5">
          <div>
            <h1 className="m-0 font-display text-[30px] leading-[1.1] font-[650] tracking-[-0.02em]">Confirme sua inscrição</h1>
            <p className="mt-1.5 mb-0 text-[15px] text-ink-muted">{meta}</p>
          </div>
          <p className="m-0 text-[15px]">
            Você vai se inscrever como <strong>{session.user.name}</strong> ({session.user.email}).
          </p>
          <NextStep docs={info.docs} />
          <ActionForm action={enrollAction.bind(null, slug, cohortId)} submitLabel="Confirmar inscrição" pendingLabel="Inscrevendo..." submitClassName={bigCta} className="flex flex-col gap-3" />
        </div>
      ) : (
        <div className="flex flex-col gap-[22px]">
          <div>
            <h1 className="m-0 font-display text-[30px] leading-[1.1] font-[650] tracking-[-0.02em]">Crie sua conta para se inscrever</h1>
            <p className="mt-1.5 mb-0 text-[15px] text-ink-muted">{meta}</p>
          </div>
          <SignupForm action={signUpAndEnrollAction.bind(null, slug, cohortId)} privacyHref={`/t/${slug}/privacidade`} />
          <p className="m-0 text-center text-[15px] text-ink-muted">
            Já tem conta? <Link href={`/login?voltar=${encodeURIComponent(back)}`} className="font-semibold">Entrar e continuar</Link>
          </p>
          <NextStep docs={info.docs} />
        </div>
      )}
    </div>
  );
}

function NextStep({ docs }: { docs: string[] }) {
  if (docs.length === 0) return null;
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl bg-canvas p-[18px]">
      <strong className="text-[15px]">Depois: enviar {docs.length} {docs.length === 1 ? "documento" : "documentos"}</strong>
      <span className="text-sm text-ink-muted">{docs.join(", ")}. O pagamento abre quando todos estiverem enviados.</span>
    </div>
  );
}
