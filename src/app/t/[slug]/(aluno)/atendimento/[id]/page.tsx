import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { BackHeader, Chip, Screen, textareaCls } from "@/components/student-ui";
import { withContext } from "@/lib/db";
import { agoText } from "@/lib/format";
import { requireMember } from "@/lib/guards";
import { getThread, isSupportStaff } from "@/lib/services/support";
import { replyAction, statusAction } from "../actions";
import { btn } from "@/components/ui";

/** Conversa de atendimento: mensagens em balões, resposta embaixo. */
export default async function ThreadPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const m = await requireMember(slug, `/t/${slug}/atendimento/${id}`);
  const data = await withContext({ tenantId: m.tenant.id, userId: m.userId }, (c) => getThread(c, id, m.userId, m.roles));
  if (!data) notFound();
  const { thread, messages } = data;
  const staff = isSupportStaff(m.roles);
  const closed = thread.status === "closed";

  return (
    <>
      <BackHeader href={staff && thread.user_id !== m.userId ? `/t/${slug}/admin/atendimento` : `/t/${slug}/atendimento`} title="Atendimento" />
      <Screen gap="gap-5">
        <div className="flex flex-col gap-2">
          {closed ? <Chip tone="muted" icon="check">Resolvido</Chip> : <Chip tone="brand" icon="chat">Aberto</Chip>}
          <h1 className="m-0 font-display text-2xl font-[650] leading-[1.15] tracking-[-0.015em]">{thread.subject}</h1>
          {staff && thread.user_id !== m.userId && <p className="m-0 text-sm text-ink-muted">Aluno: {thread.student}</p>}
        </div>

        <ol aria-label="Mensagens" className="m-0 flex list-none flex-col gap-3 p-0">
          {messages.map((msg) => {
            const mine = !msg.staff;
            return (
              <li key={msg.id} className={`flex flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
                <span className="px-1 text-xs text-ink-subtle">
                  <span className="font-semibold text-ink-muted">{msg.staff ? `${msg.author} · Secretaria` : msg.author}</span> · {agoText(msg.created_at)}
                </span>
                <p className={`m-0 max-w-[85%] rounded-2xl px-4 py-3 text-[15px] whitespace-pre-line break-words ${mine ? "rounded-br-md bg-brand text-on-brand" : "rounded-bl-md bg-surface text-ink"}`}>
                  {msg.body}
                </p>
              </li>
            );
          })}
        </ol>

        <ActionForm
          action={replyAction.bind(null, slug, thread.id)}
          submitLabel="Enviar"
          pendingLabel="Enviando..."
          resetOnSuccess
          submitClassName={btn("primary", "lg", "flex w-full")}
          className="flex flex-col gap-3"
        >
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            {closed ? "Escrever de novo (reabre o chamado)" : "Sua mensagem"}
            <textarea name="body" rows={3} maxLength={4000} required className={textareaCls} />
          </label>
        </ActionForm>
        <ActionForm
          action={statusAction.bind(null, slug, thread.id, closed ? "open" : "closed")}
          submitLabel={closed ? "Reabrir chamado" : "Marcar como resolvido"}
          submitClassName={btn("text", "lg", "flex w-full")}
          className="-mt-3 flex flex-col"
        />
      </Screen>
    </>
  );
}
