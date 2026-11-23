-- 0006 · Sprint 3: pagamento pelo Asaas de cada instituição

alter table programs add column max_installments integer not null default 1 check (max_installments between 1 and 12);

-- Chave do Asaas da instituição (cifrada pela aplicação) e token do webhook.
create table payment_settings (
  tenant_id     uuid primary key references tenants (id) on delete cascade,
  api_key_enc   text not null,
  environment   text not null default 'sandbox' check (environment in ('sandbox', 'production')),
  webhook_token text not null,
  updated_at    timestamptz not null default now()
);

create table payment_customers (
  tenant_id         uuid not null references tenants (id) on delete cascade,
  user_id           text not null references "user" ("id") on delete cascade,
  asaas_customer_id text not null,
  primary key (tenant_id, user_id)
);

create table payments (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants (id) on delete cascade,
  enrollment_id   uuid not null,
  asaas_id        text not null,
  installment_no  integer not null default 1 check (installment_no >= 1),
  installments    integer not null default 1 check (installments between 1 and 12),
  amount_cents    integer not null check (amount_cents > 0),
  status          text not null default 'pending' check (status in ('pending', 'confirmed', 'overdue', 'refunded', 'canceled')),
  invoice_url     text,
  due_date        date,
  paid_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, asaas_id),
  foreign key (tenant_id, enrollment_id) references enrollments (tenant_id, id) on delete cascade
);
create index payments_enrollment_idx on payments (tenant_id, enrollment_id);
create index payments_status_idx on payments (tenant_id, status, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['payment_settings', 'payment_customers', 'payments'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format(
      'create policy %I on %I for all using (tenant_id = app.current_tenant() or app.is_master()) with check (tenant_id = app.current_tenant() or app.is_master())',
      t || '_tenant', t);
    execute format('grant select, insert, update, delete on %I to pos_app', t);
  end loop;
end $$;
