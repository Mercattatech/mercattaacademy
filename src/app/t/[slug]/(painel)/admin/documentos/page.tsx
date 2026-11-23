import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { btnOutline, btnPrimary, btnText, EmptyBox, inputCls, labelCls, PageHead, Pill, QueueItem } from "@/components/admin-ui";
import { Icon } from "@/components/icon";
import { withContext } from "@/lib/db";
import { sinceText } from "@/lib/format";
import { requireStaff } from "@/lib/guards";
import { addDocumentTypeAction, approveDocumentAction, rejectDocumentAction, updateDocumentTypeAction } from "../inscricoes/actions";
import { RefuseDialog } from "./refuse-dialog";
import { cx } from "@/components/ui";

type QueueDoc = { id: string; enrollment_id: string; student: string; cohort: string; type_name: string; file_name: string; content_type: string; sent_at: Date };

/** Documentos (protótipo): fila de aprovação à esquerda, documento aberto à direita. Aba com a lista de documentos exigidos. */
export default async function DocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ doc?: string; inscricao?: string; aba?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireStaff(slug, ["secretaria"], `/t/${slug}/admin/documentos`);
  const base = `/t/${slug}/admin/documentos`;
  const tab = sp.aba === "exigidos" ? "exigidos" : "fila";
  const enrollmentId = sp.inscricao && /^[0-9a-f-]{36}$/i.test(sp.inscricao) ? sp.inscricao : null;

  const data = await withContext({ tenantId: ctx.tenant.id, userId: ctx.userId }, async (c) => ({
    queue: (
      await c.query<QueueDoc>(
        `select d.id, d.enrollment_id, u.name as student, co.name as cohort, t.name as type_name, d.file_name, d.content_type, d.sent_at
         from student_documents d
         join document_types t on t.tenant_id = d.tenant_id and t.id = d.document_type_id
         join enrollments e on e.tenant_id = d.tenant_id and e.id = d.enrollment_id
         join "user" u on u.id = e.user_id join cohorts co on co.tenant_id = e.tenant_id and co.id = e.cohort_id
         where d.status = 'sent' and d.approved_at is null and ($1::uuid is null or d.enrollment_id = $1)
         order by d.sent_at, t.position limit 200`,
        [enrollmentId],
      )
    ).rows,
    enrollment: enrollmentId
      ? (
          await c.query<{ student: string; docs: { name: string; status: string | null; approved: boolean; reason: string | null }[] }>(
            `select u.name as student,
                    coalesce((select json_agg(json_build_object('name', t.name, 'status', d.status, 'approved', d.approved_at is not null, 'reason', d.rejected_reason) order by t.position)
                              from document_types t left join student_documents d on d.document_type_id = t.id and d.enrollment_id = e.id
                              where t.active), '[]') as docs
             from enrollments e join "user" u on u.id = e.user_id where e.id = $1`,
            [enrollmentId],
          )
        ).rows[0] ?? null
      : null,
    types: tab === "exigidos"
      ? (await c.query<{ id: string; name: string; required: boolean; active: boolean }>("select id, name, required, active from document_types order by position")).rows
      : [],
  }));

  const queue = data.queue;
  const doc = queue.find((d) => d.id === sp.doc) ?? queue[0] ?? null;
  const pos = doc ? queue.indexOf(doc) + 1 : 0;
  const next = doc ? (queue[pos] ?? null) : null;
  const href = (id: string) => `${base}?${new URLSearchParams({ ...(enrollmentId ? { inscricao: enrollmentId } : {}), doc: id })}`;
  const fileUrl = doc ? `/t/${slug}/arquivos/${doc.id}` : "";
  const isImage = doc?.content_type.startsWith("image/");

  const sub =
    tab === "exigidos"
      ? "O que o aluno precisa enviar para seguir ao pagamento."
      : queue.length === 0
        ? "Nada esperando aprovação."
        : `${queue.length} ${queue.length === 1 ? "documento aguardando" : "documentos aguardando"} aprovação, do mais antigo para o mais novo.`;

  return (
    <div className="flex flex-col gap-5">
      <PageHead title="Documentos" sub={sub} />
      <nav aria-label="Seção" className="flex flex-wrap gap-1.5">
        <Pill href={base} active={tab === "fila"} label="Fila de aprovação" count={tab === "fila" && !enrollmentId ? queue.length : undefined} />
        <Pill href={`${base}?aba=exigidos`} active={tab === "exigidos"} label="Documentos exigidos" />
      </nav>

      {tab === "fila" && (
        <>
          {data.enrollment && (
            <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-base">Documentos de {data.enrollment.student}</strong>
                <Link href={base} className={btnText}>Ver fila completa</Link>
              </div>
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {data.enrollment.docs.map((d) => (
                  <li key={d.name} className="flex items-center gap-1.5 rounded-lg bg-canvas px-2.5 py-1.5 text-sm">
                    <Icon
                      name={d.approved ? "checkCircle" : d.status === "sent" ? "clock" : d.reason ? "error" : "emptyStep"}
                      size={16}
                      className={d.approved ? "text-success" : d.status === "sent" ? "text-warning" : d.reason ? "text-danger" : "text-ink-subtle"}
                    />
                    {d.name}
                    <span className="text-ink-subtle">· {d.approved ? "aprovado" : d.status === "sent" ? "em análise" : d.reason ? "recusado" : "não enviado"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!doc ? (
            <EmptyBox
              icon="checkCircle"
              success
              title="Fila vazia. Todos os documentos foram revisados."
              action={<Link href={`/t/${slug}/admin/inscricoes`} className={btnOutline}>Ver inscrições</Link>}
            >
              Novos envios aparecem aqui automaticamente.
            </EmptyBox>
          ) : (
            <div className="flex flex-wrap items-start gap-5">
              <ol aria-label="Fila de aprovação" className="m-0 flex max-w-full flex-[1_1_240px] list-none flex-col gap-0.5 rounded-2xl border border-line bg-surface p-1.5">
                {queue.map((d) => (
                  <QueueItem key={d.id} href={href(d.id)} current={d.id === doc.id}>
                    <span className="text-[15px] font-semibold text-ink">{d.student}</span>
                    <span className="text-[13px] text-ink-muted">{d.type_name}</span>
                    <span className="text-xs text-ink-subtle">Enviado {sinceText(d.sent_at)}</span>
                  </QueueItem>
                ))}
              </ol>

              <section aria-labelledby="doc-t" className="flex min-w-0 flex-[999_1_400px] flex-col overflow-hidden rounded-2xl border border-line bg-surface">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
                  <div>
                    <h2 id="doc-t" className="m-0 font-sans text-[19px] font-semibold">{doc.type_name}</h2>
                    <p className="mt-0.5 mb-0 text-sm text-ink-muted">
                      {doc.student} · {doc.cohort} · enviado {sinceText(doc.sent_at)}
                    </p>
                  </div>
                  <span className="text-[13px] text-ink-subtle">{pos} de {queue.length}</span>
                </div>
                <div className="mx-5 mt-4 flex h-[400px] items-center justify-center overflow-hidden rounded-xl bg-[repeating-linear-gradient(135deg,#ECECE9_0_10px,#F4F4F2_10px_20px)]">
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fileUrl} alt={`${doc.type_name} de ${doc.student}`} className="max-h-full max-w-full object-contain" />
                  ) : (
                    <div className="flex flex-col items-center gap-3 px-6 text-center">
                      <Icon name="file" size={40} className="text-ink-subtle" />
                      <span className="rounded-md bg-surface px-2 py-1 font-mono text-xs text-ink-subtle">{doc.file_name}</span>
                      <a href={fileUrl} target="_blank" rel="noreferrer" className={btnOutline}>Abrir o PDF</a>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 px-5 py-4">
                  <a href={fileUrl} target="_blank" rel="noreferrer" className={cx(btnText, "h-11 text-[15px]")}>
                    <Icon name="external" size={20} />
                    Abrir em tamanho real
                  </a>
                  <span className="flex-1" />
                  <RefuseDialog key={`r-${doc.id}`} action={rejectDocumentAction.bind(null, slug, doc.id)} docLabel={`${doc.type_name} de ${doc.student}`} />
                  <ActionForm
                    key={`a-${doc.id}`}
                    action={approveDocumentAction.bind(null, slug, doc.id)}
                    submitLabel="Aprovar"
                    pendingLabel="Aprovando..."
                    submitClassName={btnPrimary}
                    className="flex flex-col items-end gap-1"
                  />
                </div>
                {next && (
                  <p className="m-0 border-t border-line px-5 py-3 text-[13px] text-ink-subtle">
                    Próximo: <Link href={href(next.id)} className="font-semibold">{next.student}, {next.type_name}</Link>
                  </p>
                )}
              </section>
            </div>
          )}
        </>
      )}

      {tab === "exigidos" && (
        <div className="flex max-w-[760px] flex-col gap-6">
          <p className="m-0 text-[15px] text-ink-muted">
            O aluno só chega à etapa de pagamento depois de enviar todos os documentos obrigatórios e ativos. Documentos desativados deixam de ser pedidos, mas os já enviados continuam guardados.
          </p>
          <ul className="m-0 flex list-none flex-col rounded-2xl border border-line bg-surface p-0">
            {data.types.map((t, i) => (
              <li key={t.id} className={`px-5 py-4 ${i ? "border-t border-line" : ""}`}>
                <ActionForm action={updateDocumentTypeAction.bind(null, slug, t.id)} submitLabel="Salvar" submitClassName={btnOutline} className="flex flex-wrap items-end gap-4">
                  <label className={`${labelCls} min-w-[220px] flex-1`}>
                    Nome
                    <input name="name" defaultValue={t.name} required className={inputCls} />
                  </label>
                  <label className="flex h-11 items-center gap-2 text-sm font-semibold">
                    <input type="checkbox" name="required" defaultChecked={t.required} className="size-5 accent-[var(--color-brand)]" /> Obrigatório
                  </label>
                  <label className="flex h-11 items-center gap-2 text-sm font-semibold">
                    <input type="checkbox" name="active" defaultChecked={t.active} className="size-5 accent-[var(--color-brand)]" /> Ativo
                  </label>
                </ActionForm>
              </li>
            ))}
          </ul>
          <section aria-labelledby="novo" className="flex flex-col gap-3">
            <h2 id="novo" className="m-0 font-sans text-lg font-semibold">Adicionar documento</h2>
            <ActionForm action={addDocumentTypeAction.bind(null, slug)} submitLabel="Adicionar" resetOnSuccess submitClassName={btnPrimary} className="flex flex-wrap items-end gap-3">
              <label className={`${labelCls} min-w-[220px] flex-1`}>
                Nome
                <input name="name" required placeholder="Ex.: Diploma de graduação" className={inputCls} />
              </label>
            </ActionForm>
          </section>
        </div>
      )}
    </div>
  );
}
