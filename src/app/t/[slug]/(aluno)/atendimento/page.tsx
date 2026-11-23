import Link from "next/link";
import { Icon } from "@/components/icon";
import { BackHeader, Chip, Empty, primaryBtn, Screen, ScreenTitle, SectionTitle } from "@/components/student-ui";
import { withContext } from "@/lib/db";
import { agoText } from "@/lib/format";
import { requireMember } from "@/lib/guards";
import { listThreads } from "@/lib/services/support";

/** Atendimento (tela 13 do protótipo). */
export default async function SupportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await requireMember(slug, `/t/${slug}/atendimento`);
  // aqui cada pessoa vê só as próprias conversas, inclusive a equipe (a fila geral fica em /admin/atendimento)
  const threads = await withContext({ tenantId: m.tenant.id, userId: m.userId }, (c) => listThreads(c, m.userId, ["aluno"]));

  return (
    <>
      <BackHeader href={`/t/${slug}/mais`} title="Atendimento" />
      <Screen>
        <ScreenTitle size="md" sub="A secretaria responde por aqui. Você também recebe um aviso nas notificações.">Como podemos ajudar?</ScreenTitle>
        <Link href={`/t/${slug}/atendimento/novo`} className={primaryBtn}>
          <Icon name="plus" />
          Abrir chamado
        </Link>
        <div className="flex flex-col gap-1.5">
          <SectionTitle>Seus chamados</SectionTitle>
          {threads.length === 0 ? (
            <div className="mt-2"><Empty icon="chat" title="Nenhum chamado ainda">Dúvidas sobre aulas, documentos ou pagamentos? Abra um chamado.</Empty></div>
          ) : (
            <div className="mt-1 flex flex-col">
              {threads.map((t) => (
                <Link key={t.id} href={`/t/${slug}/atendimento/${t.id}`} className="flex items-center justify-between gap-2 border-b border-line py-3.5 text-ink no-underline last:border-b-0 hover:bg-white/40">
                  <span className="min-w-0">
                    <span className="text-[15px] font-semibold">{t.subject}</span>
                    <br />
                    <span className="text-[13px] text-ink-muted">Atualizado {agoText(t.last_message_at)}</span>
                  </span>
                  {t.status === "closed" ? (
                    <Chip tone="muted" icon="check">Resolvido</Chip>
                  ) : t.last_staff ? (
                    <Chip tone="brand" icon="chat">Respondido</Chip>
                  ) : (
                    <Chip tone="warning" icon="clock">Aguardando</Chip>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </Screen>
    </>
  );
}
