import { ActionForm } from "@/components/action-form";
import { Icon } from "@/components/icon";
import { BackHeader, Card, Screen, SectionTitle, secondaryBtn } from "@/components/student-ui";
import { requireMember } from "@/lib/guards";
import { getSession } from "@/lib/session";
import { requestDeletionAction } from "./actions";
import { ProfileForm } from "./profile-form";
import { btn } from "@/components/ui";

/** Meus dados (tela 14 do protótipo): perfil, cópia dos dados e pedido de exclusão (LGPD). */
export default async function MyDataPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await requireMember(slug, `/t/${slug}/meus-dados`);
  const session = await getSession();

  return (
    <>
      <BackHeader href={`/t/${slug}/mais`} title="Meus dados" />
      <Screen>
        <ProfileForm name={m.userName} email={session?.user.email ?? ""} />

        <Card className="flex flex-col gap-3">
          <SectionTitle>Baixar meus dados</SectionTitle>
          <p className="m-0 text-sm text-ink-muted">
            Um arquivo com seu perfil, inscrições, documentos enviados (só os nomes), pagamentos, notas, presenças, certificados, comentários e conversas de atendimento.
          </p>
          <a href={`/t/${slug}/meus-dados/exportar`} download className={secondaryBtn}>
            <Icon name="download" />
            Baixar arquivo (JSON)
          </a>
        </Card>

        <details className="group rounded-[20px] bg-surface">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 [&::-webkit-details-marker]:hidden">
            <Icon name="trash" className="text-ink-muted" />
            <span className="flex-1 text-[15px] font-semibold">Pedir a exclusão da minha conta</span>
            <Icon name="chevronRight" className="text-ink-subtle transition-transform group-open:rotate-90" />
          </summary>
          <div className="flex flex-col gap-3 px-5 pb-5">
            <p className="m-0 text-sm text-ink-muted">
              Você tem direito de saber o que a {m.tenant.name} guarda sobre você e de pedir a exclusão. O pedido vai para a secretaria, que responde pelo Atendimento. Certificados emitidos, pagamentos e registros de auditoria podem precisar ser mantidos por obrigação legal.
            </p>
            <ActionForm
              action={requestDeletionAction.bind(null, slug)}
              submitLabel="Enviar pedido de exclusão"
              submitClassName={btn("dangerOutline", "lg", "flex w-full")}
              className="flex flex-col gap-3"
            >
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input type="checkbox" name="confirm" className="size-5 accent-[var(--color-brand)]" />
                Quero pedir a exclusão da minha conta e dos meus dados.
              </label>
            </ActionForm>
          </div>
        </details>
      </Screen>
    </>
  );
}
