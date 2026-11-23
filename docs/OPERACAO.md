# Operação

## Backup e restauração
- Diário: `pg_dump -Fc -h <host> -U pos_owner pos_saas > pos_saas_$(date +%F).dump`. Guarde fora da VPS, 14 dias no mínimo.
- Arquivos: espelhe o bucket do MinIO (`mc mirror`) para outro local.
- Restauração: crie o banco vazio com os papéis, depois `pg_restore -d pos_saas --no-owner --role=pos_owner arquivo.dump`. Teste a restauração uma vez por mês.

## Migrations
Sempre faça backup antes. `npm run migrate` aplica só as pendentes. Migrations já aplicadas nunca são editadas: crie uma nova.

## Manutenção diária
Agende `npm run maintenance` (cron na VPS ou GitHub Actions). Remove notificações lidas há mais de 180 dias e convites vencidos há mais de 30.

## Troca de segredos
- `BETTER_AUTH_SECRET`: ao trocar, todos precisam entrar de novo.
- `PAYMENT_SECRET`: ao trocar, as chaves do Asaas salvas deixam de abrir. Cada instituição cola a chave de novo em Pagamentos.
- Senhas do banco: altere no Postgres e no `DATABASE_URL`, depois publique de novo.

## Incidentes
1. Confira `/api/health` e os logs da Vercel.
2. Banco fora: veja `systemctl status postgresql` e o espaço em disco.
3. Pagamentos não liberam acesso: confira o webhook no painel do Asaas (entregas com erro) e o token.
4. Aula sem presença: confira o webhook do Daily e `DAILY_WEBHOOK_SECRET`.
5. Registre o que houve e a correção. A tela Admin, Auditoria mostra quem mexeu em quê.

## LGPD
Pedidos de exclusão chegam como conversa em Atendimento. Certificados emitidos, pagamentos e auditoria podem exigir guarda legal: responda explicando o que foi apagado e o que foi mantido.
