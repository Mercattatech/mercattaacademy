import { notFound } from "next/navigation";
import { Icon } from "@/components/icon";
import { withContext } from "@/lib/db";
import { formatNumber, shortDate } from "@/lib/format";
import { certificateByCode, formatCode } from "@/lib/services/certificates";
import { resolveTenant } from "@/lib/tenant";
import { VerifyForm } from "../verify-form";
import { PrivacyNote, VerifyIntro } from "../verify-ui";

export const metadata = { title: "Conferir certificado", robots: { index: false } };

/** Resultado da conferência (protótipo): faixa verde (válido) ou vermelha (anulado) e só os dados necessários. */
export default async function VerifyPage({ params }: { params: Promise<{ slug: string; code: string }> }) {
  const { slug, code } = await params;
  const tenant = await resolveTenant(slug);
  if (!tenant) notFound();
  const decoded = decodeURIComponent(code).trim().toUpperCase();
  const cert = await withContext({ tenantId: tenant.id }, (c) => certificateByCode(c, decoded));
  const revoked = !!cert?.revoked_at;
  const field = "border-b border-line py-3.5";

  return (
    <>
      <VerifyIntro />
      <VerifyForm slug={slug} initial={cert ? formatCode(cert.code) : decoded} />

      {!cert ? (
        <section role="alert" className="flex flex-col gap-2.5 rounded-[20px] bg-surface p-6">
          <Icon name="search" size={32} className="text-ink-muted" />
          <strong className="text-lg">Não encontramos este código</strong>
          <span className="text-[15px] text-ink-muted">
            Não há certificado com o código <span className="font-mono text-ink">{decoded}</span> nesta instituição. Confira se digitou como está no papel, com letras e hífens.
          </span>
        </section>
      ) : (
        <section role="status" aria-label="Resultado" className="overflow-hidden rounded-[20px] bg-surface">
          <div className={`flex items-center gap-3.5 px-6 py-5 ${revoked ? "bg-danger-soft" : "bg-success-soft"}`}>
            <span aria-hidden="true" className={`flex size-12 shrink-0 items-center justify-center rounded-full bg-surface ${revoked ? "text-danger" : "text-success"}`}>
              <Icon name={revoked ? "cancel" : "verified"} size={28} strong />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className={`font-display text-[22px] font-[650] ${revoked ? "text-danger" : "text-success"}`}>{revoked ? "Certificado anulado" : "Certificado válido"}</span>
              <span className="text-sm text-ink">
                {revoked ? "O código existe, mas o certificado não tem mais validade." : `Emitido por ${tenant.name} e registrado na plataforma.`}
              </span>
            </span>
          </div>
          <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-x-8 px-6 pt-2 pb-5">
            <div className={field}><dt className="text-[13px] text-ink-subtle">Nome</dt><dd className="m-0 mt-0.5 text-lg font-semibold">{cert.student_name}</dd></div>
            <div className={field}><dt className="text-[13px] text-ink-subtle">Curso</dt><dd className="m-0 mt-0.5 text-base">{cert.program_name}</dd></div>
            <div className={field}><dt className="text-[13px] text-ink-subtle">Turma</dt><dd className="m-0 mt-0.5 text-base">{cert.cohort_name}{cert.period_text ? `, ${cert.period_text}` : ""}</dd></div>
            {cert.workload_hours ? <div className={field}><dt className="text-[13px] text-ink-subtle">Carga horária</dt><dd className="m-0 mt-0.5 text-base">{cert.workload_hours} horas</dd></div> : null}
            <div className={field}><dt className="text-[13px] text-ink-subtle">Média final</dt><dd className="m-0 mt-0.5 text-base">{formatNumber(cert.final_grade)}</dd></div>
            <div className={field}><dt className="text-[13px] text-ink-subtle">Emitido por</dt><dd className="m-0 mt-0.5 text-base">{tenant.name}, em {shortDate(cert.issued_at)}</dd></div>
            <div className="py-3.5"><dt className="text-[13px] text-ink-subtle">Código</dt><dd className="m-0 mt-0.5 font-mono text-base">{formatCode(cert.code)}</dd></div>
          </dl>
          {revoked && cert.revoked_at && (
            <p className="m-0 px-6 pb-5 text-sm text-ink-muted">
              Este certificado foi anulado pela instituição em {shortDate(cert.revoked_at)} e não tem validade. Para dúvidas, fale com a secretaria da instituição.
            </p>
          )}
        </section>
      )}
      <PrivacyNote />
    </>
  );
}
