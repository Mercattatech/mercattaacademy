import type { PoolClient } from "pg";
import { audit } from "./audit";

export type Stage = "documents" | "payment" | "released";
export const STAGE_LABELS: Record<Stage, string> = { documents: "Documentos", payment: "Pagamento", released: "Acesso liberado" };

export async function notify(
  c: PoolClient,
  n: { tenantId: string; userId: string; kind: string; message: string; href?: string; enrollmentId?: string },
) {
  await c.query(
    `insert into notifications (tenant_id, user_id, kind, message, href, enrollment_id) values ($1, $2, $3, $4, $5, $6)`,
    [n.tenantId, n.userId, n.kind, n.message, n.href ?? null, n.enrollmentId ?? null],
  );
}

/** Avisa quem trabalha na secretaria (secretaria e administração). */
export async function notifySecretariat(
  c: PoolClient,
  n: { tenantId: string; kind: string; message: string; href: string; enrollmentId: string },
) {
  const { rows } = await c.query<{ user_id: string }>(
    `select distinct user_id from memberships where tenant_id = $1 and role in ('secretaria', 'admin')`,
    [n.tenantId],
  );
  for (const r of rows) await notify(c, { ...n, userId: r.user_id });
}

export type EnrollmentOpenError = "not_found" | "closed";

/**
 * Inscrição pela vitrine: só em turma aberta, de curso publicado, dentro do período.
 * Nasce na etapa Documentos. Repetir a inscrição devolve a que já existe.
 */
export async function startEnrollment(
  c: PoolClient,
  input: { tenantId: string; cohortId: string; userId: string },
): Promise<{ ok: true; enrollmentId: string; created: boolean } | { ok: false; error: EnrollmentOpenError }> {
  const cohort = (
    await c.query<{ id: string; open: boolean }>(
      `select co.id,
              (co.status = 'open' and p.status = 'published'
               and (co.enrollment_opens_on is null or co.enrollment_opens_on <= current_date)
               and (co.enrollment_closes_on is null or co.enrollment_closes_on >= current_date)) as open
       from cohorts co join programs p on p.tenant_id = co.tenant_id and p.id = co.program_id
       where co.id = $1`,
      [input.cohortId],
    )
  ).rows[0];
  if (!cohort) return { ok: false, error: "not_found" };

  const existing = (
    await c.query<{ id: string; status: string }>(`select id, status from enrollments where cohort_id = $1 and user_id = $2`, [input.cohortId, input.userId])
  ).rows[0];
  if (existing && existing.status !== "canceled") return { ok: true, enrollmentId: existing.id, created: false };
  if (!cohort.open) return { ok: false, error: "closed" };

  await c.query(`insert into memberships (tenant_id, user_id, role) values ($1, $2, 'aluno') on conflict do nothing`, [input.tenantId, input.userId]);
  const { rows } = await c.query<{ id: string }>(
    `insert into enrollments (tenant_id, cohort_id, user_id, source, stage)
     values ($1, $2, $3, 'vitrine', 'documents')
     on conflict (cohort_id, user_id) do update set status = 'active', stage = 'documents', stage_changed_at = now()
     returning id`,
    [input.tenantId, input.cohortId, input.userId],
  );
  const enrollmentId = rows[0].id;
  await advanceStage(c, input.tenantId, enrollmentId, null);
  return { ok: true, enrollmentId, created: true };
}

/** Documentos obrigatórios ainda sem arquivo enviado. */
export async function missingDocuments(c: PoolClient, enrollmentId: string): Promise<{ id: string; name: string }[]> {
  const { rows } = await c.query<{ id: string; name: string }>(
    `select t.id, t.name from document_types t
     where t.active and t.required
       and not exists (select 1 from student_documents d
                       where d.enrollment_id = $1 and d.document_type_id = t.id and d.status = 'sent')
     order by t.position`,
    [enrollmentId],
  );
  return rows;
}

/**
 * Move Documentos <-> Pagamento conforme o que falta. Acesso liberado não volta.
 * Quando conclui os documentos, a secretaria é avisada.
 */
export async function advanceStage(c: PoolClient, tenantId: string, enrollmentId: string, studentName: string | null) {
  const enr = (await c.query<{ stage: Stage }>(`select stage from enrollments where id = $1 for update`, [enrollmentId])).rows[0];
  if (!enr || enr.stage === "released") return;
  const missing = await missingDocuments(c, enrollmentId);
  const next: Stage = missing.length === 0 ? "payment" : "documents";
  if (next === enr.stage) return;
  await c.query(`update enrollments set stage = $2, stage_changed_at = now() where id = $1`, [enrollmentId, next]);
  if (next === "payment" && studentName) {
    await notifySecretariat(c, {
      tenantId,
      kind: "documents_complete",
      message: `${studentName} enviou todos os documentos obrigatórios.`,
      href: `/admin/inscricoes?etapa=payment`,
      enrollmentId,
    });
  }
}

/** Registra o arquivo enviado. Devolve a chave do arquivo antigo (se havia) para apagar do armazenamento. */
export async function recordDocument(
  c: PoolClient,
  input: { tenantId: string; enrollmentId: string; typeId: string; storageKey: string; fileName: string; contentType: string; size: number },
): Promise<{ previousKey: string | null }> {
  const prev = (
    await c.query<{ storage_key: string | null }>(
      `select storage_key from student_documents where enrollment_id = $1 and document_type_id = $2`,
      [input.enrollmentId, input.typeId],
    )
  ).rows[0];
  await c.query(
    `insert into student_documents (tenant_id, enrollment_id, document_type_id, status, storage_key, file_name, content_type, size_bytes, sent_at, rejected_reason, updated_at)
     values ($1, $2, $3, 'sent', $4, $5, $6, $7, now(), null, now())
     on conflict (enrollment_id, document_type_id) do update
       set status = 'sent', storage_key = excluded.storage_key, file_name = excluded.file_name,
           content_type = excluded.content_type, size_bytes = excluded.size_bytes,
           sent_at = now(), rejected_reason = null, approved_at = null, approved_by = null, updated_at = now()`,
    [input.tenantId, input.enrollmentId, input.typeId, input.storageKey, input.fileName, input.contentType, input.size],
  );
  return { previousKey: prev?.storage_key ?? null };
}

/**
 * Recusa: o arquivo é apagado, o documento volta a Pendente com o motivo,
 * a inscrição volta para Documentos (se ainda não liberada) e o aluno é avisado.
 * Devolve a chave a apagar do armazenamento e os dados para o e-mail.
 */
export async function rejectDocument(
  c: PoolClient,
  input: { tenantId: string; documentId: string; reason: string; actorId: string },
): Promise<{ storageKey: string; studentEmail: string; studentName: string; documentName: string; enrollmentId: string } | null> {
  const doc = (
    await c.query<{ storage_key: string | null; enrollment_id: string; type_name: string; user_id: string; email: string; name: string; stage: Stage }>(
      `select d.storage_key, d.enrollment_id, t.name as type_name, e.user_id, u.email, u.name, e.stage
       from student_documents d
       join document_types t on t.tenant_id = d.tenant_id and t.id = d.document_type_id
       join enrollments e on e.tenant_id = d.tenant_id and e.id = d.enrollment_id
       join "user" u on u.id = e.user_id
       where d.id = $1 and d.status = 'sent' for update of d`,
      [input.documentId],
    )
  ).rows[0];
  if (!doc || !doc.storage_key) return null;

  await c.query(
    `update student_documents set status = 'pending', storage_key = null, file_name = null, content_type = null,
            size_bytes = null, sent_at = null, rejected_reason = $2, approved_at = null, approved_by = null, updated_at = now() where id = $1`,
    [input.documentId, input.reason],
  );
  if (doc.stage === "payment") {
    await c.query(`update enrollments set stage = 'documents', stage_changed_at = now() where id = $1`, [doc.enrollment_id]);
  }
  await notify(c, {
    tenantId: input.tenantId,
    userId: doc.user_id,
    kind: "document_rejected",
    message: `Seu documento "${doc.type_name}" foi recusado: ${input.reason}. Envie outro arquivo.`,
    href: `/inscricoes`,
    enrollmentId: doc.enrollment_id,
  });
  await audit(c, {
    tenantId: input.tenantId,
    actorUserId: input.actorId,
    action: "document_rejected",
    entity: "student_document",
    entityId: input.documentId,
    data: { reason: input.reason, document: doc.type_name },
  });
  return { storageKey: doc.storage_key, studentEmail: doc.email, studentName: doc.name, documentName: doc.type_name, enrollmentId: doc.enrollment_id };
}

/** Aprovação: o documento enviado sai da fila de análise e o aluno é avisado. Devolve false se já foi revisado ou recusado. */
export async function approveDocument(c: PoolClient, input: { tenantId: string; documentId: string; actorId: string }): Promise<boolean> {
  const row = (
    await c.query<{ type_name: string; user_id: string; enrollment_id: string }>(
      `update student_documents d set approved_at = now(), approved_by = $2, updated_at = now()
       from document_types t, enrollments e
       where d.id = $1 and d.status = 'sent' and d.approved_at is null
         and t.tenant_id = d.tenant_id and t.id = d.document_type_id
         and e.tenant_id = d.tenant_id and e.id = d.enrollment_id
       returning t.name as type_name, e.user_id, e.id as enrollment_id`,
      [input.documentId, input.actorId],
    )
  ).rows[0];
  if (!row) return false;
  await notify(c, {
    tenantId: input.tenantId,
    userId: row.user_id,
    kind: "document_approved",
    message: `Seu documento "${row.type_name}" foi aprovado.`,
    href: `/inscricoes`,
    enrollmentId: row.enrollment_id,
  });
  await audit(c, {
    tenantId: input.tenantId,
    actorUserId: input.actorId,
    action: "document_approved",
    entity: "student_document",
    entityId: input.documentId,
    data: { document: row.type_name },
  });
  return true;
}
