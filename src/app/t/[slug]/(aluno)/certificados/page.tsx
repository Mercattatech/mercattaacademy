import { notFound, redirect } from "next/navigation";
import { Icon } from "@/components/icon";
import { Card, Chip, Empty, primaryBtn, Screen, ScreenTitle, SectionTitle } from "@/components/student-ui";
import { withContext } from "@/lib/db";
import { shortDate } from "@/lib/format";
import { boletimsFor } from "@/lib/services/grades";
import { getSession } from "@/lib/session";
import { resolveTenant } from "@/lib/tenant";
import { tenantUrl } from "@/lib/urls";
import { CopyLink } from "./copy-link";
import { cx } from "@/components/ui";

/** Certificados emitidos e progresso até o próximo (tela 09 do protótipo). */
export default async function CertificatesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await resolveTenant(slug);
  if (!tenant) notFound();
  const session = await getSession();
  if (!session) redirect(`/login?voltar=${encodeURIComponent(`/t/${slug}/certificados`)}`);
  const list = await withContext({ tenantId: tenant.id, userId: session.user.id }, (c) => boletimsFor(c, session.user.id));

  const issued = list.filter((b) => b.certificate);
  const inProgress = list.filter((b) => !b.certificate);

  return (
    <Screen>
      <ScreenTitle>Certificados</ScreenTitle>

      {list.length === 0 && (
        <Empty icon="award" title="Nenhum certificado ainda">
          O certificado é emitido quando você conclui o curso com nota e frequência no mínimo exigido.
        </Empty>
      )}

      {inProgress.map((b) => {
        const total = b.standing.modules.length;
        const done = b.standing.modules.filter((m) => m.complete).length;
        const pct = total ? Math.round((done / total) * 100) : 0;
        return (
          <div key={b.enrollmentId} className="flex flex-col gap-2 rounded-[20px] border-[1.5px] border-dashed border-line-strong p-5">
            <Icon name="award" size={28} className="text-brand" />
            <strong className="text-base">{b.program}</strong>
            <span className="text-sm text-ink-muted">
              {b.standing.situation === "failed"
                ? "Você não atingiu o mínimo exigido. Fale com a coordenação para saber os próximos passos."
                : `Seu certificado aparece aqui ao concluir o curso.${total && total > done ? ` Falta${total - done > 1 ? "m" : ""} ${total - done} módulo${total - done > 1 ? "s" : ""} com nota.` : ""}`}
            </span>
            {total > 0 && (
              <>
                <div className="mt-1.5 h-2 rounded bg-sunken">
                  <span className="block h-full rounded bg-brand" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[13px] text-ink-subtle">{done} de {total} módulos concluídos</span>
              </>
            )}
          </div>
        );
      })}

      {issued.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <SectionTitle>Disponíveis</SectionTitle>
          {issued.map((b) => {
            const cert = b.certificate!;
            return (
              <Card key={b.enrollmentId} className="flex flex-col gap-3.5">
                <div>
                  {cert.revoked ? <Chip tone="danger" icon="cancel" small>Anulado</Chip> : <Chip tone="success" icon="verified" small>Emitido</Chip>}
                  <h3 className="mt-2 mb-0 font-sans text-[17px] font-semibold leading-[1.3] tracking-normal">{b.program}</h3>
                  <p className="mt-1 mb-0 text-sm text-ink-muted">{b.cohort} · emitido em {shortDate(cert.issuedAt)}</p>
                  <p className="mt-1 mb-0 font-mono text-[13px] text-ink-subtle">Código {cert.code}</p>
                </div>
                {cert.revoked ? (
                  <p className="m-0 text-sm">Este certificado foi anulado. Fale com a secretaria pelo Atendimento.</p>
                ) : (
                  <>
                    <a href={`/t/${slug}/certificados/${cert.id}`} className={cx(primaryBtn, "h-[52px] rounded-xl text-base font-semibold")}>
                      <Icon name="download" />
                      Baixar PDF
                    </a>
                    <CopyLink url={tenantUrl(slug, `/verificar/${cert.code}`)} />
                  </>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </Screen>
  );
}
