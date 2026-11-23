-- 0008 · Sprint 5: avaliações, notas, frequência do curso e certificado

alter table programs add column min_grade numeric(4,2) not null default 7.0 check (min_grade between 0 and 10);
alter table programs add column min_frequency_percent integer not null default 80 check (min_frequency_percent between 0 and 100);

create table assessments (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants (id) on delete cascade,
  cohort_id         uuid not null,
  cohort_module_id  uuid not null,
  title             text not null check (length(title) between 2 and 140),
  weight            numeric(6,2) not null default 1 check (weight > 0),
  max_score         numeric(6,2) not null default 10 check (max_score > 0),
  due_on            date,
  created_by        text references "user" ("id") on delete set null,
  created_at        timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, cohort_module_id, cohort_id) references cohort_modules (tenant_id, id, cohort_id) on delete cascade
);
create index assessments_cohort_idx on assessments (tenant_id, cohort_id, cohort_module_id);

create table grades (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants (id) on delete cascade,
  assessment_id  uuid not null,
  enrollment_id  uuid not null,
  score          numeric(6,2) not null check (score >= 0),
  graded_by      text references "user" ("id") on delete set null,
  updated_at     timestamptz not null default now(),
  unique (assessment_id, enrollment_id),
  foreign key (tenant_id, assessment_id) references assessments (tenant_id, id) on delete cascade,
  foreign key (tenant_id, enrollment_id) references enrollments (tenant_id, id) on delete cascade
);
create index grades_enrollment_idx on grades (tenant_id, enrollment_id);

create table certificate_settings (
  tenant_id     uuid primary key references tenants (id) on delete cascade,
  signer_name   text not null default '',
  signer_title  text not null default '',
  footer_text   text not null default ''
);

create table certificates (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants (id) on delete cascade,
  enrollment_id      uuid not null,
  code               text not null unique,
  student_name       text not null,
  program_name       text not null,
  cohort_name        text not null,
  period_text        text not null default '',
  workload_hours     integer,
  final_grade        numeric(4,2) not null,
  frequency_percent  numeric(5,1) not null,
  signer_name        text not null default '',
  signer_title       text not null default '',
  footer_text        text not null default '',
  issued_at          timestamptz not null default now(),
  revoked_at         timestamptz,
  revoked_reason     text,
  unique (tenant_id, id),
  foreign key (tenant_id, enrollment_id) references enrollments (tenant_id, id) on delete cascade
);
-- no máximo um certificado válido por inscrição
create unique index certificates_one_active on certificates (enrollment_id) where revoked_at is null;

do $$
declare t text;
begin
  foreach t in array array['assessments', 'grades', 'certificate_settings', 'certificates'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format(
      'create policy %I on %I for all using (tenant_id = app.current_tenant() or app.is_master()) with check (tenant_id = app.current_tenant() or app.is_master())',
      t || '_tenant', t);
    execute format('grant select, insert, update, delete on %I to pos_app', t);
  end loop;
end $$;
