import { ActionForm } from "@/components/action-form";
import { BackHeader, inputCls, primaryBtn, Screen, ScreenTitle, textareaCls } from "@/components/student-ui";
import { requireMember } from "@/lib/guards";
import { openThreadAction } from "../actions";

/** Abrir um chamado com a secretaria. */
export default async function NewThreadPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireMember(slug, `/t/${slug}/atendimento/novo`);
  return (
    <>
      <BackHeader href={`/t/${slug}/atendimento`} title="Atendimento" />
      <Screen>
        <ScreenTitle size="md" sub="Conte o que aconteceu. Se for sobre um documento ou pagamento, diga qual.">Abrir chamado</ScreenTitle>
        <ActionForm action={openThreadAction.bind(null, slug)} submitLabel="Enviar" pendingLabel="Enviando..." submitClassName={primaryBtn} className="flex flex-col gap-[18px]">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Assunto
            <input name="subject" required minLength={3} maxLength={140} placeholder="Ex.: Dúvida sobre a carga horária" className={inputCls} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Mensagem
            <textarea name="body" rows={6} maxLength={4000} required className={textareaCls} />
          </label>
        </ActionForm>
      </Screen>
    </>
  );
}
