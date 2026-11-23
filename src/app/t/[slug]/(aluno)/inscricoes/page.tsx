import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Icon } from "@/components/icon";
import { BackHeader, Chip, Empty, Group, inputCls, primaryBtn, Screen, ScreenTitle, SectionTitle } from "@/components/student-ui";
import { priceText } from "@/components/vitrine";
import { withContext } from "@/lib/db";
import { shortDate } from "@/lib/format";
import { formatBRL } from "@/lib/services/billing";
import type { Stage } from "@/lib/services/documents";
import type { PaymentStatus } from "@/lib/services/payments";
import { getSession } from "@/lib/session";
import { getLabels, resolveTenant } from "@/lib/tenant";
import { payAction } from "./pay-actions";
import { btn } from "@/components/ui";

type Doc = { type_id: string; name: string; required: boolean; status: "pending" | "sent" | null; file_name: string | null; rejected_reason: string | null; sent_at: Date | null; approved: boolean };
type Pay = { id: string; installment_no: number; installments: number; amount_cents: number; status: PaymentStatus };
type Enr = { id: string; stage: Stage; cohort_name: string; program_name: string; price_cents: number | null; max_installments: number; created_at: Date; stage_changed_at: Date; docs: Doc[]; payments: Pay[] };

const STAGES: Stage[] = ["documents", "payment", "released"];

/** Linha do tempo da matrícula: documentos, pagamento, acesso liberado. */
function Steps({ e, missing, rejected }: { e: Enr; missing: number; rejected: number }) {
  const at = STAGES.indexOf(e.stage);
  const required = e.docs.filter((d) => d.required);
  const sent = required.filter((d) => d.status === "sent").length;
  const paid = e.payments.find((p) => p.status === "confirmed");
  const text: Record<Stage, [string, string, string]> = {
    documents: [
      `${required.length} de ${required.length} enviados`,
      `${sent} de ${required.length} enviados${rejected ? ` · ${rejected} precisa${rejected > 1 ? "m" : ""} de novo arquivo` : missing ? ` · falta${missing > 1 ? "m" : ""} ${missing}` : ""}`,
      "Depois do pagamento",
    ],
    payment: [paid ? `Confirmado · ${formatBRL(paid.amount_cents)}` : "Pago", e.payments.some((p) => p.status === "pending" || p.status === "overdue") ? "Cobrança gerada, aguardando confirmação" : "Falta pagar para liberar o acesso", "Depois da confirmação do pagamento"],
    released: ["Acesso liberado", `Liberado em ${shortDate(e.stage_changed_at)}`, "Liberado quando o pagamento for confirmado"],
  };
  const labels: Record<Stage, string> = { documents: "Documentos", payment: "Pagamento da matrícula", released: "Acesso ao curso" };
  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {STAGES.map((s, i) => {
        const done = i < at || e.stage === "released";
        const current = !done && i === at;
        const last = i === STAGES.length - 1;
        const detail = done ? text[s][0] : current ? text[s][1] : text[s][2];
        return (
          <li key={s} aria-current={current ? "step" : undefined} className="grid grid-cols-[28px_1fr] gap-3">
            <span className="flex flex-col items-center">
              <Icon name={done ? "checkCircle" : current ? "currentStep" : "emptyStep"} size={26} className={done ? "text-success" : current ? "text-brand" : "text-line-strong"} />
              {!last && <span className={`min-h-[18px] w-0.5 flex-1 ${done ? "bg-success" : "bg-line"}`} />}
            </span>
            <span className={last ? "" : "pb-4"}>
              <strong className="text-[15px] font-semibold">{labels[s]}</strong>
              <br />
              <span className="text-sm text-ink-subtle">{s === "released" && done ? text.released[1] : detail}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default async function MyEnrollmentsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await resolveTenant(slug);
  if (!tenant) notFound();
  const session = await getSession();
  if (!session) redirect(`/login?voltar=${encodeURIComponent(`/t/${slug}/inscricoes`)}`);
  const labels = await getLabels(tenant.id);

  const { enrollments, payConfigured } = await withContext({ tenantId: tenant.id, userId: session.user.id }, async (c) => {
    const rows = (
      await c.query<Omit<Enr, "docs" | "payments">>(
        `select e.id, e.stage, co.name as cohort_name, p.name as program_name, p.price_cents, p.max_installments, e.created_at, e.stage_changed_at
         from enrollments e join cohorts co on co.tenant_id = e.tenant_id and co.id = e.cohort_id
         join programs p on p.tenant_id = co.tenant_id and p.id = co.program_id
         where e.user_id = $1 and e.status <> 'canceled' and e.source = 'vitrine' order by e.created_at desc`,
        [session.user.id],
      )
    ).rows;
    const enrollments: Enr[] = [];
    for (const r of rows) {
      const docs = (
        await c.query<Doc>(
          `select t.id as type_id, t.name, t.required, d.status, d.file_name, d.rejected_reason, d.sent_at, d.approved_at is not null as approved
           from document_types t left join student_documents d on d.document_type_id = t.id and d.enrollment_id = $1
           where t.active order by t.position`,
          [r.id],
        )
      ).rows;
      const payments = (
        await c.query<Pay>(`select id, installment_no, installments, amount_cents, status from payments where enrollment_id = $1 order by installment_no, created_at`, [r.id])
      ).rows;
      enrollments.push({ ...r, docs, payments });
    }
    const payConfigured = ((await c.query("select 1 from payment_settings")).rowCount ?? 0) > 0;
    return { enrollments, payConfigured };
  });

  return (
    <>
      <BackHeader href={`/t/${slug}/mais`} title="Matrícula" />
      <Screen>
        {enrollments.length === 0 && (
          <>
            <ScreenTitle size="md">Matrícula e documentos</ScreenTitle>
            <Empty icon="assignment" title="Nenhuma inscrição pela vitrine">
              Se você se inscreveu pelo site, ela aparece aqui.{" "}
              <Link href={`/t/${slug}/cursos`} className="font-semibold text-brand-ink underline">Ver {labels.program.plural.toLowerCase()}</Link>
            </Empty>
          </>
        )}

        {enrollments.map((e, idx) => {
          const required = e.docs.filter((d) => d.required);
          const missing = required.filter((d) => d.status !== "sent").length;
          const rejectedDocs = e.docs.filter((d) => d.status === "pending" && d.rejected_reason);
          const others = e.docs.filter((d) => !rejectedDocs.includes(d));
          const canSend = (d: Doc) => e.stage !== "released" || d.status !== "sent";
          const docHref = (d: Doc) => `/t/${slug}/inscricoes/${e.id}/documento/${d.type_id}`;
          const title =
            e.stage === "documents"
              ? `Falta${missing > 1 ? "m" : ""} ${missing} documento${missing > 1 ? "s" : ""}`
              : e.stage === "payment"
                ? "Falta o pagamento"
                : "Matrícula completa";
          const sub =
            e.stage === "documents"
              ? "Depois disso, sua matrícula segue para o pagamento."
              : e.stage === "payment"
                ? payConfigured
                  ? "Documentos completos. Pague para liberar o acesso."
                  : "Documentos completos. A secretaria vai combinar a forma de pagamento com você."
                : "Seu acesso ao curso está liberado.";
          const openPay = e.payments.some((p) => p.status === "pending" || p.status === "overdue");

          return (
            <section key={e.id} aria-labelledby={`enr-${e.id}`} className={`flex flex-col gap-6 ${idx > 0 ? "border-t border-line pt-8" : ""}`}>
              <div>
                <p className="m-0 mb-1.5 text-[13px] font-semibold text-brand-ink">{e.program_name} · {e.cohort_name}</p>
                <h1 id={`enr-${e.id}`} className="m-0 font-display text-[28px] font-[650] leading-[1.1] tracking-[-0.02em]">{title}</h1>
                <p className="mt-1.5 text-[15px] text-ink-muted">{sub}</p>
              </div>

              <Steps e={e} missing={missing} rejected={rejectedDocs.length} />

              {(e.stage === "payment" || e.payments.length > 0) && (
                <div className="flex flex-col gap-2.5">
                  <SectionTitle>Pagamento</SectionTitle>
                  {e.payments.length > 0 && (
                    <Group>
                      {e.payments.map((p) => (
                        <div key={p.id} className="flex min-h-[52px] items-center justify-between gap-2 border-t border-line px-4 py-3.5 first:border-t-0">
                          <span className="text-[15px]">{p.installments > 1 ? `Parcela ${p.installment_no} de ${p.installments}` : "À vista"} · {formatBRL(p.amount_cents)}</span>
                          {p.status === "confirmed" ? <Chip tone="success" icon="checkCircle">Pago</Chip> : p.status === "overdue" ? <Chip tone="danger" icon="warning">Em atraso</Chip> : p.status === "pending" ? <Chip tone="warning" icon="clock">A pagar</Chip> : <Chip tone="muted">{p.status === "refunded" ? "Estornado" : "Cancelado"}</Chip>}
                        </div>
                      ))}
                    </Group>
                  )}
                  {openPay && (
                    <Link href={`/t/${slug}/pagamentos`} className={primaryBtn}>
                      <Icon name="payments" />
                      Ver cobrança e pagar
                    </Link>
                  )}
                  {e.stage === "payment" && payConfigured && e.price_cents != null && !openPay && e.payments.every((p) => p.status !== "confirmed") && (
                    <ActionForm
                      action={payAction.bind(null, slug, e.id)}
                      submitLabel="Ir para o pagamento"
                      pendingLabel="Gerando cobrança..."
                      submitClassName={primaryBtn}
                      className="flex flex-col gap-4 rounded-[20px] bg-surface p-5"
                    >
                      <p className="m-0 text-sm text-ink-muted">Valor: <strong className="text-ink">{priceText(e.price_cents)}</strong></p>
                      <label className="flex flex-col gap-1.5 text-sm font-semibold">
                        CPF
                        <input name="cpf" inputMode="numeric" autoComplete="off" required placeholder="000.000.000-00" className={inputCls} />
                        <span className="text-[13px] font-normal text-ink-subtle">Usado só para emitir a cobrança no Asaas. Não guardamos o seu CPF.</span>
                      </label>
                      {e.max_installments > 1 && (
                        <label className="flex flex-col gap-1.5 text-sm font-semibold">
                          Como pagar
                          <select name="installments" className={inputCls}>
                            <option value="1">À vista, {formatBRL(e.price_cents)}</option>
                            {Array.from({ length: e.max_installments - 1 }, (_, i) => i + 2).map((n) => (
                              <option key={n} value={n}>{n}x de {formatBRL(Math.round(e.price_cents! / n))}</option>
                            ))}
                          </select>
                          <span className="text-[13px] font-normal text-ink-subtle">O acesso é liberado quando o pagamento à vista ou a primeira parcela for confirmado.</span>
                        </label>
                      )}
                    </ActionForm>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-2.5">
                <SectionTitle>Seus documentos</SectionTitle>
                <p className="m-0 -mt-1 text-[13px] text-ink-subtle">PDF, JPG ou PNG, até 4 MB cada.</p>
                <Group>
                  {rejectedDocs.map((d) => (
                    <div key={d.type_id} className="flex flex-col gap-3 border-t border-line bg-danger-soft p-4 first:border-t-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[15px] font-semibold">{d.name}</span>
                        <Chip tone="danger" icon="cancel" onWhite>Recusado</Chip>
                      </div>
                      <p role="alert" className="m-0 text-sm text-ink"><strong>Motivo:</strong> {d.rejected_reason}</p>
                      <Link href={docHref(d)} className={btn("primary", "lg", "flex")}>
                        Enviar novo arquivo
                      </Link>
                    </div>
                  ))}
                  {others.map((d) => {
                    const chip =
                      d.status === "sent" ? (d.approved ? <Chip tone="success" icon="checkCircle">Aprovado</Chip> : <Chip tone="brand" icon="clock">Em análise</Chip>) : <Chip tone="warning" icon="upload">{d.required ? "Enviar" : "Opcional"}</Chip>;
                    const inner = (
                      <>
                        <span className="flex min-w-0 flex-col">
                          <span className="text-[15px]">{d.name}{d.required ? "" : " (opcional)"}</span>
                          {d.status === "sent" && d.file_name && <span className="truncate text-[13px] text-ink-subtle">{d.file_name}{d.sent_at ? ` · ${shortDate(d.sent_at)}` : ""}</span>}
                        </span>
                        {chip}
                      </>
                    );
                    const cls = "flex min-h-[52px] items-center justify-between gap-2 border-t border-line px-4 py-3.5 first:border-t-0";
                    return canSend(d) ? (
                      <Link key={d.type_id} href={docHref(d)} className={`${cls} text-ink no-underline hover:bg-canvas`}>{inner}</Link>
                    ) : (
                      <div key={d.type_id} className={cls}>{inner}</div>
                    );
                  })}
                </Group>
              </div>
            </section>
          );
        })}
      </Screen>
    </>
  );
}
