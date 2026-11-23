-- 0013 · Progresso do aluno nos vídeos gravados
-- Uma linha por aluno e vídeo: onde parou (para retomar) e quando concluiu.
-- "Assistido" = chegou a 90% do vídeo ou ao fim; depois de concluído, não volta atrás.

create table module_video_progress (
  tenant_id        uuid not null references tenants (id) on delete cascade,
  video_id         uuid not null,
  user_id          text not null references "user" ("id") on delete cascade,
  position_seconds integer not null default 0 check (position_seconds >= 0),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  completed_at     timestamptz,
  updated_at       timestamptz not null default now(),
  primary key (video_id, user_id),
  foreign key (tenant_id, video_id) references module_videos (tenant_id, id) on delete cascade
);
create index module_video_progress_user_idx on module_video_progress (tenant_id, user_id);

alter table module_video_progress enable row level security;
alter table module_video_progress force row level security;
create policy module_video_progress_tenant on module_video_progress for all
  using (tenant_id = app.current_tenant() or app.is_master())
  with check (tenant_id = app.current_tenant() or app.is_master());
grant select, insert, update, delete on module_video_progress to pos_app;
