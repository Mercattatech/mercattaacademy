-- 0010 · Escolha de instituição após o login
-- Lista as instituições ativas em que a pessoa tem algum perfil. Roda como pos_reader
-- (ignora o RLS só aqui dentro), porque o RLS de memberships só enxerga uma instituição por vez.
-- Mesmo padrão de app.is_platform_admin: o servidor passa o id da sessão, nunca o cliente.

create or replace function app.my_institutions(p_user_id text)
returns table (slug text, name text, brand jsonb, roles text[])
language sql stable security definer
set search_path = public, app
as $$
  select t.slug, t.name, t.brand, array_agg(m.role order by m.role)
  from memberships m
  join tenants t on t.id = m.tenant_id
  where m.user_id = p_user_id and t.status = 'active'
  group by t.slug, t.name, t.brand
  order by t.name
$$;

grant select on memberships to pos_reader;
grant usage, create on schema app to pos_reader;
alter function app.my_institutions(text) owner to pos_reader;
revoke create on schema app from pos_reader;
grant execute on function app.my_institutions(text) to pos_app;
