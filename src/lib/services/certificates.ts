import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { audit } from "./audit";
import { notify } from "./documents";
import { formatDay } from "../format";

export type CertificateRow = {
  id: string; code: string; enrollment_id: string; student_name: string; program_name: string; cohort_name: string; period_text: string;
  workload_hours: number | null; final_grade: string; frequency_percent: string; signer_name: string; signer_title: string; footer_text: string;
  issued_at: Date; revoked_at: Date | null; revoked_reason: string | null;
};

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O/1/I para ler no papel
export function newCertificateCode(): string {
  const bytes = randomBytes(12);
  let out = "";
  for (let i = 0; i < 12; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}
export const formatCode = (code: string) => code.replace(/(.{4})(?=.)/g, "$1-");
export const normalizeCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, "");

export async function getSettings(c: PoolClient) {
  const r = (await c.query<{ signer_name: string; signer_title: string; footer_text: string }>("select signer_name, signer_title, footer_text from certificate_settings")).rows[0];
  return r ?? { signer_name: "", signer_title: "", footer_text: "" };
}

export async function saveSettings(c: PoolClient, tenantId: string, s: { signerName: string; signerTitle: string; footerText: string }) {
  await c.query(
    `insert into certificate_settings (tenant_id, signer_name, signer_title, footer_text) values ($1, $2, $3, $4)
     on conflict (tenant_id) do update set signer_name = excluded.signer_name, signer_title = excluded.signer_title, footer_text = excluded.footer_text`,
    [tenantId, s.signerName, s.signerTitle, s.footerText],
  );
}

/** Emite o certificado da inscrição com os dados do curso. Não emite de novo se já há um válido. */
export async function issueCertificate(
  c: PoolClient,
  input: { tenantId: string; enrollmentId: string; finalGrade: number; frequencyPercent: number; actorId: string | null },
): Promise<{ created: boolean; id: string }> {
  await c.query("select pg_advisory_xact_lock(hashtext($1))", [`cert:${input.enrollmentId}`]);
  // Qualquer certificado já emitido (mesmo anulado) impede nova emissão automática: anular é decisão da equipe.
  const cur = (await c.query<{ id: string }>("select id from certificates where enrollment_id = $1 order by revoked_at is not null limit 1", [input.enrollmentId])).rows[0];
  if (cur) return { created: false, id: cur.id };
  const d = (await c.query<{ user_id: string; student: string; program: string; cohort: string; starts_on: string | null; ends_on: string | null; hours: number | null }>(
    `select e.user_id, u.name as student, p.name as program, co.name as cohort, co.starts_on::text, co.ends_on::text,
            coalesce(p.workload_hours, (select sum(workload_hours)::int from cohort_modules where cohort_id = co.id)) as hours
     from enrollments e join "user" u on u.id = e.user_id join cohorts co on co.tenant_id = e.tenant_id and co.id = e.cohort_id
     join programs p on p.tenant_id = co.tenant_id and p.id = co.program_id where e.id = $1`, [input.enrollmentId])).rows[0];
  const settings = await getSettings(c);
  const period = d.starts_on && d.ends_on ? `de ${formatDay(d.starts_on)} a ${formatDay(d.ends_on)}` : "";
  const { rows } = await c.query<{ id: string }>(
    `insert into certificates (tenant_id, enrollment_id, code, student_name, program_name, cohort_name, period_text, workload_hours, final_grade, frequency_percent, signer_name, signer_title, footer_text)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning id`,
    [input.tenantId, input.enrollmentId, newCertificateCode(), d.student, d.program, d.cohort, period, d.hours, input.finalGrade, input.frequencyPercent, settings.signer_name, settings.signer_title, settings.footer_text],
  );
  await audit(c, { tenantId: input.tenantId, actorUserId: input.actorId, action: "certificate_issued", entity: "certificate", entityId: rows[0].id });
  await notify(c, { tenantId: input.tenantId, userId: d.user_id, kind: "certificate_issued", message: `Seu certificado de "${d.program}" está pronto.`, href: "/notas", enrollmentId: input.enrollmentId });
  return { created: true, id: rows[0].id };
}

export async function revokeCertificate(c: PoolClient, input: { tenantId: string; certificateId: string; reason: string; actorId: string }): Promise<boolean> {
  const n = await c.query("update certificates set revoked_at = now(), revoked_reason = $2 where id = $1 and revoked_at is null", [input.certificateId, input.reason]);
  if (n.rowCount) await audit(c, { tenantId: input.tenantId, actorUserId: input.actorId, action: "certificate_revoked", entity: "certificate", entityId: input.certificateId, data: { reason: input.reason } });
  return (n.rowCount ?? 0) > 0;
}

export async function certificateByCode(c: PoolClient, rawCode: string): Promise<CertificateRow | null> {
  const code = normalizeCode(rawCode);
  if (code.length !== 12) return null;
  return (await c.query<CertificateRow>("select * from certificates where code = $1", [code])).rows[0] ?? null;
}

/** Certificado para baixar: o dono (aluno) ou a equipe. */
export async function certificateForDownload(c: PoolClient, id: string, userId: string, isStaff: boolean): Promise<CertificateRow | null> {
  const r = (await c.query<CertificateRow & { owner: string }>(
    `select ce.*, e.user_id as owner from certificates ce join enrollments e on e.tenant_id = ce.tenant_id and e.id = ce.enrollment_id where ce.id = $1`, [id])).rows[0];
  if (!r) return null;
  return isStaff || r.owner === userId ? r : null;
}

export async function listCertificates(c: PoolClient): Promise<(CertificateRow & { cohort_name: string })[]> {
  return (await c.query<CertificateRow>("select * from certificates order by issued_at desc limit 300")).rows;
}
