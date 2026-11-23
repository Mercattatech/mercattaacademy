# Implantação

Arquitetura: app Next.js na Vercel, Postgres 16 e MinIO na VPS, e-mail pela Resend, pagamento pelo Asaas, vídeo pelo Daily.

## 1. Banco e arquivos (VPS, Docker)
Tudo em [deploy/](../deploy/): Postgres 16, PgBouncer (modo transaction, TLS) e MinIO atrás de Caddy (HTTPS automático).

1. DNS: crie um registro A para o subdomínio de arquivos (ex.: `arquivos.plataforma.com.br`) apontando para a VPS. Libere as portas 80, 443 e 6432 no firewall. **A 5432 não deve ser aberta**: o Postgres só escuta em `127.0.0.1`.
2. Copie `deploy/.env.prod.example` para `deploy/.env.prod` e preencha com senhas fortes (`openssl rand -base64 24`).
3. Certificado do PgBouncer em `deploy/certs/server.crt` e `server.key` (ex.: Let's Encrypt de um subdomínio como `db.plataforma.com.br`, ou autoassinado).
4. Suba: `cd deploy && docker compose --env-file .env.prod -f docker-compose.prod.yml up -d`. Na primeira subida os papéis `pos_owner`/`pos_app` e o banco `pos_saas` são criados já com as senhas do `.env.prod`.
5. Migrations, da sua máquina por túnel SSH (`ssh -L 5433:127.0.0.1:5432 usuario@vps`): `DATABASE_OWNER_URL=postgres://pos_owner:SENHA@localhost:5433/pos_saas npm run db:migrate`.
6. `DATABASE_URL` na Vercel: `postgres://pos_app:SENHA@db.plataforma.com.br:6432/pos_saas?sslmode=require`.
7. Master inicial (com o túnel aberto e `DATABASE_URL` do `pos_app` também apontando para ele): `MASTER_EMAIL=voce@empresa.com.br MASTER_PASSWORD='12+ caracteres' npm run seed:master`. **Não rode `npm run db:seed` em produção**, ele cria a instituição de demonstração Bressane e usuários `@bressane.local`.
8. Backup: `deploy/backup.sh` (dump do Postgres validado + espelho dos arquivos, guarda 14 dias). Agende no cron da VPS, ex.: `30 3 * * * /opt/pos-saas/deploy/backup.sh >> /var/log/pos-saas-backup.log 2>&1`, e copie `/var/backups/pos-saas` para fora da VPS. Restaurar o banco: `docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T postgres pg_restore -U postgres -d pos_saas --clean --if-exists < pos_saas-AAAAMMDD-HHMMSS.dump`.

## 2. Arquivos (MinIO)
Crie o bucket (privado por padrão) na VPS, dentro de `deploy/`:
`docker run --rm --network pos-saas_default --entrypoint sh minio/mc -c "mc alias set l http://minio:9000 USUARIO SENHA && mc mb --ignore-existing l/pos-saas"`.
Na Vercel: `S3_ENDPOINT=https://arquivos.plataforma.com.br`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`.

## 3. Vercel
1. Importe o repositório e preencha as variáveis de `.env.example`.
2. Gere segredos longos e aleatórios: `openssl rand -base64 32` para `BETTER_AUTH_SECRET` e `PAYMENT_SECRET`. **Guarde o PAYMENT_SECRET**: sem ele as chaves do Asaas salvas não abrem.
3. Domínio: adicione `plataforma.com.br` e o curinga `*.plataforma.com.br`. `ROOT_DOMAIN=plataforma.com.br`, `BETTER_AUTH_URL=https://plataforma.com.br`.
4. Antes de publicar: `npm run check:env` (sai com erro se algo crítico faltar).
5. Depois de publicar: `npm run smoke -- https://bressane.plataforma.com.br`.

## 4. E-mail (Resend)
Verifique o domínio (SPF e DKIM) e preencha `RESEND_API_KEY` e `EMAIL_FROM`.

## 5. Asaas
Em cada instituição: Admin, Pagamentos, cole a chave e escolha o ambiente. Cadastre o webhook mostrado na tela (URL e token). Teste primeiro no Sandbox.

## 6. Daily
Preencha `DAILY_API_KEY` e `DAILY_WEBHOOK_SECRET`. Registre o webhook com `npm run video:webhook -- https://plataforma.com.br`. Gravação na nuvem exige plano pago do Daily.

## 7. Monitoramento
Aponte um monitor externo (UptimeRobot, Better Stack) para `/api/health`. Retorna 200 quando o banco responde e a configuração está válida, 503 caso contrário.
