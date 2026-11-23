-- Rodar UMA vez por servidor, como superusuário (postgres), antes das migrations.
-- Cria os dois papéis do sistema:
--   pos_owner: dono das tabelas; usado só para rodar migrations.
--   pos_app:   usado pelo app; sem BYPASSRLS, sujeito a todas as políticas.
--   pos_reader: sem login; dono só das funções de leitura segura (resolve_tenant,
--               is_platform_admin), que precisam ignorar o RLS dentro delas.
-- Troque as senhas em produção (VPS).

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'pos_reader') then
    create role pos_reader nologin bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'pos_owner') then
    create role pos_owner login password 'pos_owner_dev';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'pos_app') then
    create role pos_app login password 'pos_app_dev' nobypassrls;
  end if;
end $$;

-- pos_owner precisa pertencer a pos_reader para transferir a ele as funções.
grant pos_reader to pos_owner;
