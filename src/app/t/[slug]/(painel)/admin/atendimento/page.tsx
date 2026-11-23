import { ActionForm } from "@/components/action-form";
import { btnOutline, btnPrimary, EmptyBox, Initials, labelCls, PageHead, Pill, QueueItem, Tag, textareaCls } from "@/components/admin-ui";
import { withContext } from "@/lib/db";
import { agoText } from "@/lib/format";
import { requireStaff } from "@/lib/guards";
import { getThread, listThreads, type ThreadRow } from "@/lib/services/support";
import { replyAction, statusAction } from "../../../(aluno)/atendimento/actions";
import { cx } from "@/components/ui";

function threadTag(t: ThreadRow) {
  if (t.status === "closed") return <Tag tone="muted" icon="check" small>Resolvido</Tag>;
  return t.last_staff ? <Tag tone="ok" icon="chat" small>Respondido</Tag> : <Tag tone="warn" icon="clock" small>Novo</Tag>;
}

/** Atendimento (protótipo): chamados à esquerda, conversa e resposta à direita. */
export default async function AdminSupportPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ situacao?: string; chamado?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireStaff(slug, ["secretaria", "coordenacao"], `/t/${slug}/admin/atendimento`);
  const base = `/t/${slug}/admin/atendimento`;
  const status = sp.situacao === "closed" ? "closed" : sp.situacao === "all" ? "all" : "open";

  const { threads, current } = await withContext({ tenantId: ctx.tenant.id, userId: ctx.userId }, async (c) => {
    const threads = await listThreads(c, ctx.userId, ctx.roles, status);
    const id = sp.chamado && /^[0-9a-f-]{36}$/i.test(sp.chamado) ? sp.chamado : (threads.find((t) => !t.last_staff) ?? threads[0])?.id;
    return { threads, current: id ? await getThread(c, id, ctx.userId, ctx.roles) : null };
  });
  const waiting = threads.filter((t) => t.status === "open" && !t.last_staff).length;
  const href = (id: string) => `${base}?${new URLSearchParams({ ...(status !== "open" ? { situacao: status } : {}), chamado: id })}`;
  const tk = current?.thread;
  const closed = tk?.status === "closed";

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        title="Atendimento"
        sub={status === "open" ? (waiting ? `${waiting} ${waiting === 1 ? "chamado esperando" : "chamados esperando"} resposta da equipe.` : "Nenhum chamado esperando resposta.") : "Chamados dos alunos."}
      />
      <nav aria-label="Situação" className="flex flex-wrap gap-1.5">
        <Pill href={base} active={status === "open"} label="Abertos" />
        <Pill href={`${base}?situacao=closed`} active={status === "closed"} label="Resolvidos" />
        <Pill href={`${base}?situacao=all`} active={status === "all"} label="Todos" />
      </nav>

      {threads.length === 0 && !tk ? (
        <EmptyBox icon="support" success={status === "open"} title={status === "open" ? "Nenhum chamado aberto." : "Nenhum chamado aqui."}>
          Quando um aluno abrir um chamado, ele aparece aqui e a equipe recebe um aviso.
        </EmptyBox>
      ) : (
        <div className="flex flex-wrap items-start gap-5">
          <ol aria-label="Chamados" className="m-0 flex max-w-full flex-[1_1_240px] list-none flex-col gap-0.5 rounded-2xl border border-line bg-surface p-1.5">
            {threads.map((t) => (
              <QueueItem key={t.id} href={href(t.id)} current={t.id === tk?.id}>
                <span className="text-[15px] font-semibold text-ink">{t.subject}</span>
                <span className="text-[13px] text-ink-muted">{t.student} · {agoText(t.last_message_at)}</span>
                <span className="mt-1">{threadTag(t)}</span>
              </QueueItem>
            ))}
          </ol>

          {tk && current && (
            <section aria-labelledby="tk-t" className="flex min-w-0 flex-[999_1_400px] flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 id="tk-t" className="m-0 font-sans text-[19px] font-semibold">{tk.subject}</h2>
                  <p className="mt-0.5 mb-0 text-sm text-ink-muted">{tk.student} · aberto {agoText(tk.created_at)}</p>
                </div>
                {threadTag(tk)}
              </div>

              <ol aria-label="Mensagens" className="m-0 flex list-none flex-col gap-3 p-0">
                {current.messages.map((m) => (
                  <li key={m.id} className={`flex gap-2.5 ${m.staff ? "flex-row-reverse" : ""}`}>
                    <Initials name={m.author} />
                    <div className={`max-w-[52ch] px-3.5 py-3 text-[15px] whitespace-pre-line break-words ${m.staff ? "rounded-[14px_4px_14px_14px] bg-brand-soft" : "rounded-[4px_14px_14px_14px] bg-canvas"}`}>
                      {m.body}
                      <div className="mt-1.5 text-xs text-ink-subtle">
                        {m.staff ? `${m.author} · equipe` : m.author} · {agoText(m.created_at)}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>

              <ActionForm
                key={tk.id}
                action={replyAction.bind(null, slug, tk.id)}
                submitLabel="Enviar resposta"
                pendingLabel="Enviando..."
                resetOnSuccess
                submitClassName={cx(btnPrimary, "self-end")}
                className="flex flex-col gap-3"
              >
                <label className={labelCls}>
                  {closed ? "Escrever de novo (reabre o chamado)" : "Sua resposta"}
                  <textarea name="body" rows={4} maxLength={4000} required placeholder="Responda de forma simples. O aluno recebe por e-mail e no app." className={textareaCls} />
                </label>
              </ActionForm>
              <ActionForm
                key={`${tk.id}-${tk.status}`}
                action={statusAction.bind(null, slug, tk.id, closed ? "open" : "closed")}
                submitLabel={closed ? "Reabrir chamado" : "Marcar como resolvido"}
                pendingLabel="Salvando..."
                submitClassName={cx(btnOutline, "self-end")}
                className="-mt-1 flex flex-col gap-2 border-t border-line pt-4"
              />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
