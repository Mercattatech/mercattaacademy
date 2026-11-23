-- 0007 · Sprint 4: aulas, aula ao vivo, presença, gravação e calendário

alter table programs add column min_attendance_percent integer not null default 75 check (min_attendance_percent between 1 and 100);
alter table cohort_modules add constraint cohort_modules_tenant_id_id_cohort_key unique (tenant_id, id, cohort_id);

create table lessons (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants (id) on delete cascade,
  cohort_id         uuid not null,
  cohort_module_id  uuid not null,
  title             text not null check (length(title) between 2 and 140),
  starts_at         timestamptz not null,
  duration_minutes  integer not null default 120 check (duration_minutes between 15 and 480),
  teacher_id        text references "user" ("id") on delete set null,
  status            text not null default 'scheduled' check (status in ('scheduled', 'live', 'ended', 'canceled')),
  room_name         text unique,
  room_url          text,
  started_at        timestamptz,
  ended_at          timestamptz,
  presence_closed_at timestamptz,
  recording_id      text,
  recording_seconds integer,
  created_at        timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, cohort_module_id, cohort_id) references cohort_modules (tenant_id, id, cohort_id) on delete cascade
);
create index lessons_cohort_idx on lessons (tenant_id, cohort_id, starts_at);

create table lesson_materials (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants (id) on delete cascade,
  lesson_id    uuid not null,
  file_name    text not null,
  storage_key  text not null,
  size_bytes   integer not null,
  uploaded_by  text references "user" ("id") on delete set null,
  created_at   timestamptz not null default now(),
  foreign key (tenant_id, lesson_id) references lessons (tenant_id, id) on delete cascade
);
create index lesson_materials_lesson_idx on lesson_materials (tenant_id, lesson_id);

create table attendance (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants (id) on delete cascade,
  lesson_id      uuid not null,
  enrollment_id  uuid not null,
  seconds        integer not null default 0 check (seconds >= 0),
  override       boolean,            -- ajuste do professor: true presente, false falta, null automático
  present        boolean,            -- resultado final, só depois de fechar a presença
  unique (lesson_id, enrollment_id),
  foreign key (tenant_id, lesson_id) references lessons (tenant_id, id) on delete cascade,
  foreign key (tenant_id, enrollment_id) references enrollments (tenant_id, id) on delete cascade
);

-- Uma linha por entrada na sala (session_id do provedor): avisos repetidos não contam duas vezes.
create table attendance_sessions (
  tenant_id      uuid not null references tenants (id) on delete cascade,
  session_id     text not null,
  lesson_id      uuid not null,
  enrollment_id  uuid not null,
  seconds        integer not null check (seconds >= 0),
  primary key (tenant_id, session_id),
  foreign key (tenant_id, lesson_id) references lessons (tenant_id, id) on delete cascade,
  foreign key (tenant_id, enrollment_id) references enrollments (tenant_id, id) on delete cascade
);

create table calendar_tokens (
  tenant_id  uuid not null references tenants (id) on delete cascade,
  user_id    text not null references "user" ("id") on delete cascade,
  token      text not null unique,
  primary key (tenant_id, user_id)
);

do $$
declare t text;
begin
  foreach t in array array['lessons', 'lesson_materials', 'attendance', 'attendance_sessions', 'calendar_tokens'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format(
      'create policy %I on %I for all using (tenant_id = app.current_tenant() or app.is_master()) with check (tenant_id = app.current_tenant() or app.is_master())',
      t || '_tenant', t);
    execute format('grant select, insert, update, delete on %I to pos_app', t);
  end loop;
end $$;

-- Achar a instituição pela sala (webhook do vídeo) e pelo endereço do calendário, antes de existir contexto.
grant select on lessons, calendar_tokens to pos_reader;

create or replace function app.lesson_by_room(p_room text)
returns table (tenant_id uuid, lesson_id uuid)
language sql stable security definer set search_path = public, app
as $$ select l.tenant_id, l.id from lessons l where l.room_name = p_room $$;

create or replace function app.calendar_owner(p_token text)
returns table (tenant_id uuid, user_id text)
language sql stable security definer set search_path = public, app
as $$ select c.tenant_id, c.user_id from calendar_tokens c where c.token = p_token $$;

grant usage, create on schema app to pos_reader;
grant usage on schema public to pos_reader;
alter function app.lesson_by_room(text) owner to pos_reader;
alter function app.calendar_owner(text) owner to pos_reader;
revoke create on schema app from pos_reader;
grant execute on function app.lesson_by_room(text), app.calendar_owner(text) to pos_app;
