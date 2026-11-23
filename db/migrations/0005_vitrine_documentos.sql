-- 0005 · Sprint 2: vitrine, inscrição, documentos da secretaria e avisos

alter table programs add column summary text not null default '';
alter table programs add column price_cents integer check (price_cents is null or price_cents >= 0);
alter table programs add column payment_note text not null default 'À vista ou primeira parcela';

alter table cohorts add column enrollment_opens_on date;
alter table cohorts add column enrollment_closes_on date;
alter table cohorts add constraint cohorts_enrollment_window_ck
  check (enrollment_closes_on is null or enrollment_opens_on is null or enrollment_closes_on >= enrollment_opens_on);

-- Lista de documentos exigidos, por instituição.
create table document_types (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants (id) on delete cascade,
  name       text not null check (length(name) between 2 and 80),
  required   boolean not null default true,
  active     boolean not null default true,
  position   integer not null default 1,
  unique (tenant_id, id)
);
create index document_types_tenant_idx on document_types (tenant_id, position);

create or replace function app.seed_document_types(p_tenant uuid) returns void
language sql as $$
  insert into document_types (tenant_id, name, position) values
    (p_tenant, 'Diploma', 1), (p_tenant, 'CNH', 2), (p_tenant, 'RG', 3),
    (p_tenant, 'Comprovante de endereço', 4), (p_tenant, 'Histórico escolar', 5)
$$;

-- Etapa da inscrição: documentos, pagamento, acesso liberado. Matrículas anteriores já estão liberadas.
alter table enrollments add column stage text not null default 'released' check (stage in ('documents', 'payment', 'released'));
alter table enrollments add column stage_changed_at timestamptz not null default now();
alter table enrollments add constraint enrollments_tenant_id_id_key unique (tenant_id, id);
create index enrollments_stage_idx on enrollments (tenant_id, cohort_id, stage);

create table student_documents (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants (id) on delete cascade,
  enrollment_id    uuid not null,
  document_type_id uuid not null,
  status           text not null default 'pending' check (status in ('pending', 'sent')),
  storage_key      text,
  file_name        text,
  content_type     text,
  size_bytes       integer,
  rejected_reason  text,
  sent_at          timestamptz,
  updated_at       timestamptz not null default now(),
  unique (enrollment_id, document_type_id),
  unique (tenant_id, id),
  foreign key (tenant_id, enrollment_id) references enrollments (tenant_id, id) on delete cascade,
  foreign key (tenant_id, document_type_id) references document_types (tenant_id, id) on delete restrict,
  check ((status = 'sent') = (storage_key is not null))
);

-- Avisos dentro da plataforma (aluno e secretaria).
create table notifications (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants (id) on delete cascade,
  user_id       text not null references "user" ("id") on delete cascade,
  kind          text not null,
  message       text not null,
  href          text,
  enrollment_id uuid,
  read_at       timestamptz,
  created_at    timestamptz not null default now(),
  foreign key (tenant_id, enrollment_id) references enrollments (tenant_id, id) on delete cascade
);
create index notifications_user_idx on notifications (tenant_id, user_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['document_types', 'student_documents', 'notifications'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format(
      'create policy %I on %I for all using (tenant_id = app.current_tenant() or app.is_master()) with check (tenant_id = app.current_tenant() or app.is_master())',
      t || '_tenant', t);
    execute format('grant select, insert, update, delete on %I to pos_app', t);
  end loop;
end $$;

-- Instituições que já existem recebem a lista padrão.
select app.seed_document_types(id) from tenants;
grant execute on function app.seed_document_types(uuid) to pos_app;
