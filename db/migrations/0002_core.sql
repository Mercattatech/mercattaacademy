-- 0002 · Núcleo multi-instituição (Sprint 0)
-- Regras da Constituição aplicadas aqui:
--   * toda tabela de instituição tem tenant_id e RLS forçado (FORCE);
--   * o contexto vem de app.tenant_id / app.user_id / app.is_master,
--     gravados por transação em src/lib/db.ts (withContext).

create extension if not exists pgcrypto;
create schema if not exists app;

-- ---------------------------------------------------------------- contexto
create or replace function app.current_tenant() returns uuid
language sql stable as $$
  select nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

create or replace function app.current_user_id() returns text
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')
$$;

create or replace function app.is_master() returns boolean
language sql stable as $$
  select coalesce(current_setting('app.is_master', true), '') = 'on'
$$;

-- ---------------------------------------------------------------- plataforma
create table plans (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  price_per_course_cents integer not null check (price_per_course_cents >= 0),
  included_students      integer not null check (included_students >= 0),
  extra_student_cents    integer not null check (extra_student_cents >= 0),
  active                 boolean not null default true,
  created_at             timestamptz not null default now()
);

create table tenants (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$'),
  name             text not null,
  status           text not null default 'active' check (status in ('active', 'suspended', 'deleted')),
  plan_id          uuid references plans (id),
  brand            jsonb not null default '{}'::jsonb,   -- { "primary": "#...", "logoUrl": "..." }
  links            jsonb not null default '{}'::jsonb,   -- { "site": "...", "instagram": "..." }
  suspended_at     timestamptz,
  suspended_reason text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Quem é master da plataforma. Sem políticas: só funções SECURITY DEFINER leem.
create table platform_admins (
  user_id    text primary key references "user" ("id") on delete cascade,
  created_at timestamptz not null default now()
);

create table memberships (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants (id) on delete cascade,
  user_id    text not null references "user" ("id") on delete cascade,
  role       text not null check (role in ('admin', 'coordenacao', 'professor', 'secretaria', 'financeiro', 'aluno', 'tutor')),
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id, role)
);
create index memberships_user_idx on memberships (user_id);

create table invites (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants (id) on delete cascade,
  email       text not null,
  role        text not null check (role in ('admin', 'coordenacao', 'professor', 'secretaria', 'financeiro', 'aluno', 'tutor')),
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  accepted_at timestamptz,
  created_by  text references "user" ("id"),
  created_at  timestamptz not null default now()
);
create index invites_tenant_idx on invites (tenant_id);

-- ---------------------------------------------------------------- recursos ativáveis
create table features (
  key            text primary key,
  name           text not null,
  description    text not null default '',
  kind           text not null check (kind in ('core', 'optional')),
  default_config jsonb not null default '{}'::jsonb,
  sort_order     integer not null default 0
);

create table tenant_features (
  tenant_id   uuid not null references tenants (id) on delete cascade,
  feature_key text not null references features (key),
  enabled     boolean not null default false,
  config      jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (tenant_id, feature_key)
);

create table tenant_labels (
  tenant_id uuid not null references tenants (id) on delete cascade,
  label_key text not null check (label_key in ('program', 'cohort', 'module', 'lesson')),
  singular  text not null,
  plural    text not null,
  primary key (tenant_id, label_key)
);

-- ---------------------------------------------------------------- cobrança da plataforma
create table subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null unique references tenants (id) on delete cascade,
  plan_id             uuid not null references plans (id),
  status              text not null default 'active' check (status in ('active', 'past_due', 'canceled')),
  billing_customer_id text,           -- cliente no Asaas da plataforma
  started_at          timestamptz not null default now(),
  canceled_at         timestamptz
);

create table platform_invoices (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants (id) on delete cascade,
  period_start  date not null,
  period_end    date not null,
  courses       integer not null default 0,
  students      integer not null default 0,
  amount_cents  integer not null check (amount_cents >= 0),
  status        text not null default 'pending' check (status in ('pending', 'paid', 'overdue', 'canceled')),
  external_id   text,                 -- id da cobrança no Asaas da plataforma
  due_date      date not null,
  paid_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index platform_invoices_tenant_idx on platform_invoices (tenant_id, due_date desc);

-- ---------------------------------------------------------------- auditoria
create table audit_log (
  id            bigserial primary key,
  tenant_id     uuid references tenants (id) on delete set null,
  actor_user_id text,
  action        text not null,
  entity        text not null,
  entity_id     text,
  data          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index audit_log_tenant_idx on audit_log (tenant_id, created_at desc);

-- ---------------------------------------------------------------- funções públicas
-- Resolve a instituição pelo subdomínio ANTES de existir contexto.
-- Devolve só campos públicos (vitrine, login, tela de suspensão).
create or replace function app.resolve_tenant(p_slug text)
returns table (id uuid, slug text, name text, status text, brand jsonb, links jsonb)
language sql stable security definer
set search_path = public, app
as $$
  select t.id, t.slug, t.name, t.status, t.brand, t.links
  from tenants t
  where t.slug = lower(p_slug) and t.status <> 'deleted'
$$;

create or replace function app.is_platform_admin(p_user_id text) returns boolean
language sql stable security definer
set search_path = public, app
as $$
  select exists (select 1 from platform_admins where user_id = p_user_id)
$$;

-- As duas funções acima rodam como pos_reader (BYPASSRLS, só SELECT nestas tabelas):
-- ignoram o RLS apenas dentro delas, sem abrir nada para o resto da transação.
grant usage, create on schema app to pos_reader;
grant usage on schema public to pos_reader;
grant select on tenants, platform_admins to pos_reader;
alter function app.resolve_tenant(text) owner to pos_reader;
alter function app.is_platform_admin(text) owner to pos_reader;
revoke create on schema app from pos_reader;

-- Núcleo está sempre ligado; opcional depende de tenant_features.
create or replace function app.feature_enabled(p_key text) returns boolean
language sql stable as $$
  select coalesce(
    (select f.kind = 'core' from features f where f.key = p_key and f.kind = 'core'),
    (select tf.enabled from tenant_features tf
      where tf.tenant_id = app.current_tenant() and tf.feature_key = p_key),
    false)
$$;

-- ---------------------------------------------------------------- RLS
alter table plans             enable row level security;
alter table plans             force row level security;
alter table tenants           enable row level security;
alter table tenants           force row level security;
alter table platform_admins   enable row level security;
alter table platform_admins   force row level security;
alter table memberships       enable row level security;
alter table memberships       force row level security;
alter table invites           enable row level security;
alter table invites           force row level security;
alter table features          enable row level security;
alter table features          force row level security;
alter table tenant_features   enable row level security;
alter table tenant_features   force row level security;
alter table tenant_labels     enable row level security;
alter table tenant_labels     force row level security;
alter table subscriptions     enable row level security;
alter table subscriptions     force row level security;
alter table platform_invoices enable row level security;
alter table platform_invoices force row level security;
alter table audit_log         enable row level security;
alter table audit_log         force row level security;

-- Catálogos globais: todos leem, só o master altera.
create policy platform_admins_master on platform_admins for all using (app.is_master()) with check (app.is_master());
create policy plans_read    on plans    for select using (true);
create policy plans_master  on plans    for all    using (app.is_master()) with check (app.is_master());
create policy features_read   on features for select using (true);
create policy features_master on features for all    using (app.is_master()) with check (app.is_master());

-- Instituição: vê a si mesma; master vê e altera todas.
create policy tenants_own    on tenants for select using (id = app.current_tenant() or app.is_master());
create policy tenants_master on tenants for all    using (app.is_master()) with check (app.is_master());

-- Tabelas da instituição: leitura e escrita só dentro do próprio tenant.
create policy memberships_tenant on memberships for all
  using (tenant_id = app.current_tenant() or app.is_master())
  with check (tenant_id = app.current_tenant() or app.is_master());
create policy invites_tenant on invites for all
  using (tenant_id = app.current_tenant() or app.is_master())
  with check (tenant_id = app.current_tenant() or app.is_master());
create policy tenant_labels_tenant on tenant_labels for all
  using (tenant_id = app.current_tenant() or app.is_master())
  with check (tenant_id = app.current_tenant() or app.is_master());

-- Recursos e cobrança: a instituição lê os seus; só o master liga, desliga e cobra.
create policy tenant_features_read   on tenant_features   for select using (tenant_id = app.current_tenant() or app.is_master());
create policy tenant_features_master on tenant_features   for all    using (app.is_master()) with check (app.is_master());
create policy subscriptions_read     on subscriptions     for select using (tenant_id = app.current_tenant() or app.is_master());
create policy subscriptions_master   on subscriptions     for all    using (app.is_master()) with check (app.is_master());
create policy platform_invoices_read   on platform_invoices for select using (tenant_id = app.current_tenant() or app.is_master());
create policy platform_invoices_master on platform_invoices for all    using (app.is_master()) with check (app.is_master());

-- Auditoria: grava no próprio tenant; lê o próprio tenant; master lê tudo. Nunca altera nem apaga.
create policy audit_insert on audit_log for insert
  with check (tenant_id = app.current_tenant() or app.is_master());
create policy audit_read on audit_log for select
  using (tenant_id = app.current_tenant() or app.is_master());

-- ---------------------------------------------------------------- permissões do app
grant usage on schema app to pos_app;
grant execute on all functions in schema app to pos_app;
grant select, insert, update, delete on "user", "session", "account", "verification" to pos_app;
grant select, insert, update, delete on plans, tenants, memberships, invites, features,
  tenant_features, tenant_labels, subscriptions, platform_invoices to pos_app;
grant select, insert on audit_log to pos_app;
grant usage on sequence audit_log_id_seq to pos_app;
-- platform_admins: sem grant direto; acesso só via app.is_platform_admin().
