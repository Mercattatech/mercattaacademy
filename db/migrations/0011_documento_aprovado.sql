-- 0011 · Aprovação de documentos pela secretaria
-- Um documento enviado fica "em análise" até a secretaria aprovar ou recusar.
-- Reenviar um arquivo volta o documento para análise (approved_at = null).

alter table student_documents add column approved_at timestamptz;
alter table student_documents add column approved_by text references "user" ("id") on delete set null;
alter table student_documents add constraint student_documents_approved_sent check (approved_at is null or status = 'sent');

create index student_documents_review_idx on student_documents (tenant_id, sent_at) where status = 'sent' and approved_at is null;
