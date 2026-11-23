# Plano técnico · 007

- `next.config.ts`: `headers()` com os cabeçalhos de segurança.
- `src/lib/env.ts`: `checkEnv(env)` puro e testável. Usado por `scripts/check-env.ts` e por `/api/health`.
- `src/app/api/health/route.ts`, `src/app/not-found.tsx`, `src/app/error.tsx`, `src/app/global-error.tsx`.
- `src/lib/services/privacy.ts`: `exportMyData`. Rotas `/meus-dados` (tela e `/meus-dados/exportar`), `/privacidade`.
- `src/app/t/[slug]/admin/auditoria/page.tsx`.
- `scripts/maintenance.ts`, `scripts/smoke.ts`.
- `docs/DEPLOY.md`, `docs/OPERACAO.md`, `docs/PILOTO.md`.
