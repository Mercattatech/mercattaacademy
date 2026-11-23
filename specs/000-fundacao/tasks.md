# 000 · Fundação: tarefas

- [x] Projeto Next.js 15 com TypeScript e Tailwind
- [x] Papéis do banco e migrations 0001 (login), 0002 (núcleo com RLS), 0003 (catálogo de recursos e plano fictício)
- [x] `withContext` como única porta para dados de instituição
- [x] Funções seguras `resolve_tenant` e `is_platform_admin` com o papel `pos_reader`
- [x] Testes de isolamento contra Postgres real (14 testes, `npm test`)
- [x] Login por e-mail e senha
- [x] Middleware de subdomínio, 404 para inexistente, aviso para suspensa
- [x] Menu do aluno pelos recursos ligados e rótulos da instituição
- [x] Painel master: lista de instituições
- [x] Seed de desenvolvimento: master, Bressane e admin da Bressane
- [x] Postgres local no Windows (Docker ou instalador) documentado no README
- [x] Envio de e-mail pelo Resend (`src/lib/email.ts`), com 3 testes
