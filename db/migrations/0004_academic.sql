-- 0004 · Sprint 1: avisos, cursos, grade, turmas, matrículas e convites de aluno

create table announcements (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants (id) on delete cascade,
  title        text not null check (length(title) between 1 and 160),
  body         text not null default '',
  created_by   text references "user" ("id") on delete set null,
  published_at timestamptz not null default now()
);
create index announcements_tenant_idx on announcements (tenant_id, published_at desc);

create table programs (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants (id) on delete cascade,
  name           text not null check (length(name) between 2 and 160),
  description    text not null default '',
  workload_hours integer check (workload_hours is null or workload_hours > 0),
  status         text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tenant_id, id)
);
create index programs_tenant_idx on programs (tenant_id, status);

create table program_modules (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants (id) on delete cascade,
  program_id         uuid not null,
  position           integer not null check (position > 0),
  name               text not null check (length(name) between 2 and 160),
  syllabus           text not null default '',
  workload_hours     integer check (workload_hours is null or workload_hours > 0),
  default_teacher_id text references "user" ("id") on delete set null,
  unique (tenant_id, id),
  foreign key (tenant_id, program_id) references programs (tenant_id, id) on delete cascade,
  constraint program_modules_position_uniq unique (program_id, position) deferrable initially deferred
);

create table cohorts (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants (id) on delete cascade,
  program_id uuid not null,
  name       text not null check (length(name) between 2 and 120),
  starts_on  date,
  ends_on    date,
  status     text not null default 'planned' check (status in ('planned', 'open', 'running', 'closed')),
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, program_id) references programs (tenant_id, id) on delete restrict,
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index cohorts_program_idx on cohorts (tenant_id, program_id);

create table cohort_modules (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants (id) on delete cascade,
  cohort_id         uuid not null,
  program_module_id uuid,
  position          integer not null check (position > 0),
  name              text not null,
  syllabus          text not null default '',
  workload_hours    integer,
  teacher_id        text references "user" ("id") on delete set null,
  starts_on         date,
  ends_on           date,
  unique (cohort_id, position),
  foreign key (tenant_id, cohort_id) references cohorts (tenant_id, id) on delete cascade,
  foreign key (tenant_id, program_module_id) references program_modules (tenant_id, id) on delete set null (program_module_id),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create table enrollments (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants (id) on delete cascade,
  cohort_id  uuid not null,
  user_id    text not null references "user" ("id") on delete cascade,
  status     text not null default 'active' check (status in ('active', 'canceled', 'completed')),
  source     text not null default 'manual' check (source in ('manual', 'csv', 'vitrine')),
  created_at timestamptz not null default now(),
  unique (cohort_id, user_id),
  foreign key (tenant_id, cohort_id) references cohorts (tenant_id, id) on delete cascade
);
create index enrollments_tenant_idx on enrollments (tenant_id, status);

-- Convite de aluno já leva a turma; convite de equipe não.
alter table invites add column name text;
alter table invites add column cohort_id uuid;
alter table invites add constraint invites_cohort_fk foreign key (tenant_id, cohort_id) references cohorts (tenant_id, id) on delete cascade;
alter table invites add column source text not null default 'manual' check (source in ('manual', 'csv', 'vitrine'));
alter table invites add column revoked_at timestamptz;
-- Um convite em aberto por e-mail, perfil e turma.
create unique index invites_open_uniq on invites (tenant_id, lower(email), role, coalesce(cohort_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where accepted_at is null and revoked_at is null;

-- Quem aceita ainda não tem contexto de instituição: busca segura pelo hash do token.
create or replace function app.invite_lookup(p_token_hash text)
returns table (id uuid, tenant_id uuid, tenant_slug text, tenant_name text, email text, name text,
               role text, cohort_id uuid, expires_at timestamptz, accepted_at timestamptz, revoked_at timestamptz)
language sql stable security definer set search_path = public, app as $$
  select i.id, i.tenant_id, t.slug, t.name, i.email, i.name, i.role, i.cohort_id, i.expires_at, i.accepted_at, i.revoked_at
  from invites i join tenants t on t.id = i.tenant_id
  where i.token_hash = p_token_hash and t.status = 'active'
$$;
grant select on invites to pos_reader;
grant usage, create on schema app to pos_reader;
alter function app.invite_lookup(text) owner to pos_reader;
revoke create on schema app from pos_reader;

-- RLS: tudo dentro da própria instituição (ou master).
do $$
declare t text;
begin
  foreach t in array array['announcements', 'programs', 'program_modules', 'cohorts', 'cohort_modules', 'enrollments'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format(
      'create policy %I on %I for all using (tenant_id = app.current_tenant() or app.is_master()) with check (tenant_id = app.current_tenant() or app.is_master())',
      t || '_tenant', t);
    execute format('grant select, insert, update, delete on %I to pos_app', t);
  end loop;
end $$;

grant execute on function app.invite_lookup(text) to pos_app;

-- A instituição edita a própria marca, links e nome; situação, plano e endereço só o master.
create or replace function app.tenants_guard() returns trigger
language plpgsql as $$
begin
  if not app.is_master() and (
       new.status is distinct from old.status
    or new.plan_id is distinct from old.plan_id
    or new.slug is distinct from old.slug
    or new.suspended_at is distinct from old.suspended_at
    or new.suspended_reason is distinct from old.suspended_reason) then
    raise exception 'Somente o master altera situação, plano ou endereço da instituição' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger tenants_guard before update on tenants for each row execute function app.tenants_guard();
create policy tenants_self_update on tenants for update
  using (id = app.current_tenant()) with check (id = app.current_tenant());
