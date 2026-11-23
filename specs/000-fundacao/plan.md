# 000 · Fundação: plano

## Decisões

- **Banco**: Postgres 16 numa VPS (no lugar do Supabase). Isolamento por RLS forçado, contexto por transação em `app.tenant_id`, `app.user_id`, `app.is_master` (`src/lib/db.ts`).
- **Papéis**: `pos_owner` (migrations), `pos_app` (app, sujeito ao RLS), `pos_reader` (BYPASSRLS, dono só de `resolve_tenant` e `is_platform_admin`).
- **Login**: Better Auth com o mesmo Postgres; tabelas globais `user`, `session`, `account`, `verification`. Papéis por instituição em `memberships`.
- **Instituição pela URL**: `src/middleware.ts` reescreve `<slug>.ROOT_DOMAIN/...` para `/t/<slug>/...`.
- **Recursos**: catálogo em `features` (núcleo e opcionais), estado por instituição em `tenant_features`, checagem em `app.feature_enabled()` e no menu (`src/lib/menu.ts`).
- **Visual**: Literata nos títulos, Atkinson Hyperlegible no texto, fontes empacotadas via @fontsource; cor da instituição em `--brand`.
- **Migrations**: SQL puro numerado em `db/migrations`, aplicado por `npm run db:migrate`.

- **Hospedagem** (12/11/2026): app na Vercel; Postgres e arquivos na VPS. Conexão da Vercel pelo PgBouncer (modo transaction) com SSL; poucas conexões por instância (`DATABASE_POOL_MAX`).
- **Arquivos** (12/11/2026): MinIO na VPS, acessado pelo protocolo S3; bucket privado, links temporários assinados. Implementação no Sprint 2.

- **E-mail** (12/11/2026): Resend, por `src/lib/email.ts`. Remetente com o nome da instituição e endereço do domínio da plataforma; respostas vão para o e-mail da secretaria. Sem chave, só registra no console.
