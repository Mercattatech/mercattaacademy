-- 0012 · Vídeos gravados por módulo (recurso opcional "aulas_gravadas")
-- O vídeo pertence ao módulo do curso (program_modules): vale para todas as turmas do curso.
-- O arquivo fica no armazenamento privado (S3/MinIO); aqui só o registro.
-- status: 'uploading' (registrado, arquivo ainda sendo enviado) e 'ready' (conferido e liberado).

create table module_videos (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants (id) on delete cascade,
  module_id     uuid not null,
  position      integer not null check (position > 0),
  title         text not null check (length(title) between 2 and 160),
  description   text not null default '',
  storage_key   text not null,
  content_type  text not null,
  size_bytes    bigint not null check (size_bytes > 0),
  status        text not null default 'uploading' check (status in ('uploading', 'ready')),
  uploaded_by   text references "user" ("id") on delete set null,
  created_at    timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, module_id) references program_modules (tenant_id, id) on delete cascade
);
create index module_videos_module_idx on module_videos (tenant_id, module_id, position);
create index module_videos_pending_idx on module_videos (created_at) where status = 'uploading';

alter table module_videos enable row level security;
alter table module_videos force row level security;
create policy module_videos_tenant on module_videos for all
  using (tenant_id = app.current_tenant() or app.is_master())
  with check (tenant_id = app.current_tenant() or app.is_master());
grant select, insert, update, delete on module_videos to pos_app;
