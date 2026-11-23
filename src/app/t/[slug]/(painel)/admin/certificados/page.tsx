import { ActionForm } from "@/components/action-form";
import { btnDanger, btnOutline, btnText, EmptyBox, inputCls, PageHead, panelCls, tableCls, tableWrap, Tag, tdCls, thCls, trCls } from "@/components/admin-ui";
import { Icon } from "@/components/icon";
import { cx, Field } from "@/components/ui";
import { withContext } from "@/lib/db";
import { shortDate } from "@/lib/format";
import { requireStaff } from "@/lib/guards";
import { formatCode, getSettings, listCertificates } from "@/lib/services/certificates";
import { revokeAction, saveSettingsAction } from "./actions";

/** Certificados (protótipo): tabela com média, frequência, situação e código. */
export default async function CertificatesAdminPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireStaff(slug, ["secretaria"], `/t/${slug}/admin/certificados`);
  const isAdmin = ctx.roles.includes("admin");
  const { settings, list } = await withContext({ tenantId: ctx.tenant.id, userId: ctx.userId }, async (c) => ({ settings: await getSettings(c), list: await listCertificates(c) }));
  const valid = list.filter((c) => !c.revoked_at).length;
  const num = (v: unknown, d = 1) => Number(v).toFixed(d).replace(".", ",");

  return (
    <div className="flex flex-col gap-6">
      <PageHead
        title="Certificados"
        sub={`Saem sozinhos quando o aluno cumpre a nota e a frequência do curso. ${valid} ${valid === 1 ? "válido" : "válidos"} emitidos.`}
        tag={!settings.signer_name ? <Tag tone="warn" icon="warning">Sem assinatura</Tag> : undefined}
      />

      {list.length === 0 ? (
        <EmptyBox icon="award" title="Nenhum certificado emitido ainda">
          Quando uma turma termina e o aluno atinge a média e a frequência mínimas, o certificado aparece aqui com o código de verificação.
        </EmptyBox>
      ) : (
        <div className={tableWrap}>
          <table className={tableCls}>
            <thead>
              <tr>
                <th scope="col" className={thCls}>Aluno</th>
                <th scope="col" className={thCls}>Média</th>
                <th scope="col" className={thCls}>Frequência</th>
                <th scope="col" className={thCls}>Certificado</th>
                <th scope="col" className={`${thCls} text-right`}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className={trCls}>
                  <td className={tdCls}>
                    <strong className="font-semibold">{c.student_name}</strong>
                    <br />
                    <span className="text-[13px] text-ink-subtle">{c.program_name} · {c.cohort_name} · {shortDate(c.issued_at)}</span>
                  </td>
                  <td className={`${tdCls} tabular-nums`}>{num(c.final_grade)}</td>
                  <td className={`${tdCls} tabular-nums`}>{num(c.frequency_percent, 0)}%</td>
                  <td className={tdCls}>
                    <div className="flex flex-col items-start gap-1">
                      {c.revoked_at ? <Tag tone="bad" icon="cancel">Anulado</Tag> : <Tag tone="ok" icon="verified">Emitido</Tag>}
                      <span className="font-mono text-xs text-ink-subtle">{formatCode(c.code)}</span>
                      {c.revoked_at && c.revoked_reason && <span className="text-[13px] text-ink-muted">{c.revoked_reason}</span>}
                    </div>
                  </td>
                  <td className={`${tdCls} text-right`}>
                    <div className="flex flex-col items-end gap-1">
                      <a href={`/t/${slug}/certificados/${c.id}`} className={btnText}>
                        <Icon name="download" size={18} />
                        Baixar PDF
                      </a>
                      {isAdmin && !c.revoked_at && (
                        <details className="group text-left">
                          <summary className="inline-flex h-10 cursor-pointer list-none items-center rounded-[9px] px-2.5 text-sm font-semibold text-danger hover:bg-danger-soft [&::-webkit-details-marker]:hidden">Anular</summary>
                          <ActionForm
                            action={revokeAction.bind(null, slug, c.id)}
                            submitLabel="Confirmar anulação"
                            confirm="Anular este certificado? A conferência pública passa a mostrar como anulado."
                            submitClassName={btnDanger}
                            className="mt-2 flex w-64 flex-col gap-2"
                          >
                            <label className="sr-only" htmlFor={`r-${c.id}`}>Motivo da anulação</label>
                            <input id={`r-${c.id}`} name="reason" placeholder="Motivo" required className={inputCls} />
                          </ActionForm>
                        </details>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <details className={`group ${panelCls}`} open={!settings.signer_name && isAdmin}>
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 [&::-webkit-details-marker]:hidden">
          <Icon name="edit" size={20} className="text-ink-muted" />
          <span className="flex-1 text-base font-semibold">Assinatura e rodapé</span>
          <span className="hidden text-sm text-ink-muted sm:inline">{settings.signer_name ? `${settings.signer_name}, ${settings.signer_title}` : "Não definida"}</span>
          <Icon name="chevronRight" size={20} className="text-ink-subtle transition-transform group-open:rotate-90" />
        </summary>
        <div className="border-t border-line px-5 py-5">
          {isAdmin ? (
            <ActionForm action={saveSettingsAction.bind(null, slug)} submitLabel="Salvar" submitClassName={cx(btnOutline, "self-start")} className="grid max-w-2xl gap-4 sm:grid-cols-2">
              <Field label="Nome de quem assina" name="signerName" id="c-name" defaultValue={settings.signer_name} maxLength={120} />
              <Field label="Cargo" name="signerTitle" id="c-title" defaultValue={settings.signer_title} maxLength={120} />
              <div className="sm:col-span-2">
                <Field label="Texto do rodapé (opcional)" name="footerText" id="c-foot" defaultValue={settings.footer_text} maxLength={140} hint="Ex.: autorização, portaria ou credenciamento da instituição." />
              </div>
            </ActionForm>
          ) : (
            <p className="m-0 text-[15px] text-ink-muted">A administração define quem assina os certificados.</p>
          )}
        </div>
      </details>
    </div>
  );
}
