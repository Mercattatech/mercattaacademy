-- 0009 · Sprint 6: avisos por turma, comentários por aula, professores e atendimento

alter table announcements add column cohort_id uuid;
alter table announcements add foreign key (tenant_id, cohort_id) references cohorts (tenant_id, id) on delete cascade;

create table lesson_comments (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants (id) on delete cascade,
  lesson_id   uuid not null,
  user_id     text not null references "user" ("id") on delete cascade,
  body        text not null check (length(body) between 1 and 2000),
  created_at  timestamptz not null default now(),
  foreign key (tenant_id, lesson_id) references lessons (tenant_id, id) on delete cascade
);
create index lesson_comments_lesson_idx on lesson_comments (tenant_id, lesson_id, created_at);

create table teacher_profiles (
  tenant_id   uuid not null references tenants (id) on delete cascade,
  user_id     text not null references "user" ("id") on delete cascade,
  headline    text not null default '' check (length(headline) <= 120),
  bio         text not null default '' check (length(bio) <= 2000),
  link_url    text check (link_url is null or link_url ~ '^https?://'),
  visible     boolean not null default true,
  updated_at  timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create table support_threads (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants (id) on delete cascade,
  user_id          text not null references "user" ("id") on delete cascade,
  subject          text not null check (length(subject) between 3 and 140),
  status           text not null default 'open' check (status in ('open', 'closed')),
  created_at       timestamptz not null default now(),
  last_message_at  timestamptz not null default now(),
  unique (tenant_id, id)
);
create index support_threads_idx on support_threads (tenant_id, status, last_message_at desc);

create table support_messages (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants (id) on delete cascade,
  thread_id   uuid not null,
  author_id   text not null references "user" ("id") on delete cascade,
  staff       boolean not null default false,
  body        text not null check (length(body) between 1 and 4000),
  created_at  timestamptz not null default now(),
  foreign key (tenant_id, thread_id) references support_threads (tenant_id, id) on delete cascade
);
create index support_messages_thread_idx on support_messages (tenant_id, thread_id, created_at);

do $$
declare t text;
begin
  foreach t in array array['lesson_comments', 'teacher_profiles', 'support_threads', 'support_messages'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format(
      'create policy %I on %I for all using (tenant_id = app.current_tenant() or app.is_master()) with check (tenant_id = app.current_tenant() or app.is_master())',
      t || '_tenant', t);
    execute format('grant select, insert, update, delete on %I to pos_app', t);
  end loop;
end $$;
