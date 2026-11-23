# Plataforma de Cursos: guia de instalação

Este pacote tem o código completo da plataforma. Há dois caminhos de instalação. Escolha um.

| | A. VPS completa | B. Vercel + banco na VPS |
|---|---|---|
| Onde roda o app | Na VPS (Docker) | Na Vercel |
| Banco e arquivos | Na mesma VPS | Numa VPS (Docker) |
| HTTPS dos subdomínios | Automático (Caddy) | Vercel (exige o DNS na Vercel) |
| Mais indicado para | Começar simples, custo fixo, um fornecedor só | Quem já usa a Vercel e quer escalar o app |

O banco **precisa** ser um Postgres 16 em que você tenha acesso de superusuário, porque o isolamento entre instituições usa papéis próprios (`pos_owner`, `pos_app`). Bancos gerenciados que não deixam criar papéis não servem sem adaptação.

## O que você precisa ter antes

- Um domínio (ex.: `suaempresa.com.br`). As instituições ficam em `nome.suaempresa.com.br`.
- Uma VPS Linux (Ubuntu 22.04 ou 24.04, 2 vCPU, 4 GB de RAM e 40 GB de disco é um bom começo).
- Conta no **Resend** (e-mail) com o domínio verificado. Sem ela a plataforma funciona, mas convites e avisos não saem por e-mail.
- Opcional: conta no **Daily** (aulas ao vivo) e no **Asaas** de cada instituição (pagamentos).

Gere os segredos com `openssl rand -base64 32` (um para cada). Guarde todos num gerenciador de senhas.

---

## Caminho A: VPS completa

### 1. DNS

No painel do domínio, crie dois registros do tipo A apontando para o IP da VPS:

- `suaempresa.com.br`
- `*.suaempresa.com.br` (curinga)

O curinga já cobre `arquivos.suaempresa.com.br`, o endereço por onde o navegador envia e assiste os vídeos gravados. O nome `arquivos` é reservado: nenhuma instituição pode usá-lo.

### 2. Preparar a VPS

```bash
ssh usuario@IP_DA_VPS
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker
sudo ufw allow 22 && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```

Só as portas 22, 80 e 443 ficam abertas. O Postgres escuta apenas dentro da VPS.

### 3. Enviar o pacote

Do seu computador:

```bash
scp plataforma-de-cursos-*.zip usuario@IP_DA_VPS:~
```

Na VPS:

```bash
sudo apt-get install -y unzip
sudo mkdir -p /opt && sudo chown $USER /opt
unzip ~/plataforma-de-cursos-*.zip -d /opt
cd /opt/plataforma-de-cursos/deploy
```

### 4. Configurar

```bash
cp .env.vps.example .env.vps
nano .env.vps
```

Preencha tudo (domínio, e-mail para o certificado, senhas do banco e do MinIO, `BETTER_AUTH_SECRET`, `PAYMENT_SECRET`, Resend). Não use espaços nem aspas nas senhas.

> **Guarde o `PAYMENT_SECRET`.** Sem ele, as chaves do Asaas já salvas pelas instituições não abrem mais.

### 5. Subir

```bash
docker compose --env-file .env.vps -f docker-compose.vps.yml up -d --build
```

A primeira vez demora alguns minutos (compila o app). O banco e o bucket de arquivos são criados sozinhos.

### 6. Criar as tabelas e a conta master

```bash
docker compose --env-file .env.vps -f docker-compose.vps.yml --profile tools run --rm tools npm run db:migrate

docker compose --env-file .env.vps -f docker-compose.vps.yml --profile tools run --rm \
  -e MASTER_EMAIL=voce@suaempresa.com.br -e MASTER_PASSWORD='uma senha de 12+ caracteres' \
  tools npm run seed:master
```

**Não rode `db:seed` nem `db:seed:demo` em produção.** Eles criam instituição e usuários de demonstração com senha conhecida.

### 7. Conferir

```bash
curl https://suaempresa.com.br/api/health      # deve responder {"status":"ok",...}
docker compose --env-file .env.vps -f docker-compose.vps.yml logs -f app
```

Abra `https://suaempresa.com.br/login` e entre com a conta master. A primeira abertura de cada endereço novo demora alguns segundos, porque o Caddy emite o certificado na hora.

### 8. Rotina

- **Backup diário** (guarda 14 dias): `crontab -e` e adicione

  ```
  30 3 * * * ENV_FILE=.env.vps COMPOSE_FILE=docker-compose.vps.yml /opt/plataforma-de-cursos/deploy/backup.sh >> /var/log/plataforma-backup.log 2>&1
  ```

  Copie `/var/backups/pos-saas` para **fora** da VPS (outro servidor ou bucket). Backup só na mesma máquina não protege de defeito no disco.
- **Limpeza diária**: `0 4 * * * cd /opt/plataforma-de-cursos/deploy && docker compose --env-file .env.vps -f docker-compose.vps.yml --profile tools run --rm tools npx tsx scripts/maintenance.ts`
- **Atualizar a versão**: envie o novo .zip, descompacte por cima (mantenha o `.env.vps`), rode o passo 5 de novo e depois o `db:migrate` do passo 6.
- **Restaurar o banco**: `docker compose --env-file .env.vps -f docker-compose.vps.yml exec -T postgres pg_restore -U postgres -d pos_saas --clean --if-exists < arquivo.dump`

---

## Caminho B: Vercel + banco e arquivos numa VPS

### 1. Banco e arquivos na VPS

Siga os passos 1 a 6 de [docs/DEPLOY.md](docs/DEPLOY.md), seção 1 (Postgres, PgBouncer com TLS e MinIO atrás de HTTPS). Os arquivos estão em `deploy/` (`docker-compose.prod.yml`, `.env.prod.example`). No fim você terá:

- `DATABASE_URL` (papel `pos_app`, pelo PgBouncer, porta 6432, com `?sslmode=require`);
- `DATABASE_OWNER_URL` (papel `pos_owner`, direto no Postgres, só para migrations);
- o endereço público do MinIO (`S3_ENDPOINT`) e o bucket `pos-saas`.

### 2. Tabelas e conta master (do seu computador, com túnel SSH)

```bash
ssh -L 5433:127.0.0.1:5432 usuario@IP_DA_VPS      # deixe aberto
npm install
DATABASE_OWNER_URL=postgres://pos_owner:SENHA@localhost:5433/pos_saas npm run db:migrate
DATABASE_URL=postgres://pos_app:SENHA@localhost:5433/pos_saas \
DATABASE_OWNER_URL=postgres://pos_owner:SENHA@localhost:5433/pos_saas \
BETTER_AUTH_SECRET=... BETTER_AUTH_URL=https://suaempresa.com.br \
MASTER_EMAIL=voce@suaempresa.com.br MASTER_PASSWORD='12+ caracteres' npm run seed:master
```

Use o mesmo `BETTER_AUTH_SECRET` da Vercel. **Não rode `db:seed`.**

### 3. Projeto na Vercel

1. Envie o código para um repositório (GitHub, GitLab ou Bitbucket) e importe na Vercel. Framework: Next.js. Comando de build e saída: os padrões. Versão do Node: 22.
2. Em **Settings, Environment Variables**, cadastre (ambiente Production):

   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | do passo 1 |
   | `ROOT_DOMAIN` | `suaempresa.com.br` |
   | `BETTER_AUTH_URL` | `https://suaempresa.com.br` |
   | `BETTER_AUTH_SECRET` | segredo longo |
   | `PAYMENT_SECRET` | segredo longo (guarde!) |
   | `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | do MinIO |
   | `RESEND_API_KEY`, `EMAIL_FROM` | do Resend |
   | `DAILY_API_KEY`, `DAILY_WEBHOOK_SECRET` | opcional, para aulas ao vivo |

3. **Settings, Functions**: escolha a região mais próxima da VPS (para VPS no Brasil, São Paulo, `gru1`).
4. **Settings, Domains**: adicione `suaempresa.com.br` e `*.suaempresa.com.br`. O curinga só funciona com o DNS do domínio nos nameservers da Vercel (a tela mostra quais).
5. Publique (Deploy).

### 4. Conferir e rotina

```bash
npm run check:env                                  # antes de publicar, com as variáveis no .env local de produção
npm run smoke -- https://suaempresa.com.br
```

Backup: `deploy/backup.sh` na VPS (ver `docs/DEPLOY.md`). Limpeza diária: agende na VPS, com Node instalado, `DATABASE_OWNER_URL=postgres://pos_owner:SENHA@127.0.0.1:5432/pos_saas npx tsx scripts/maintenance.ts`.

---

## Vídeos gravados por módulo

1. Em `/master`, abra a instituição e ligue o recurso **Aulas gravadas em blocos**.
2. No painel da instituição, **Pós-graduações**, abra o curso. Cada módulo ganha o botão **Vídeos**.
3. Lá a coordenação envia os vídeos (MP4, WebM ou MOV, até 2 GB cada), com título e descrição, e pode reordenar, renomear e excluir.
4. O aluno com acesso liberado vê os vídeos em **Mais, Vídeos gravados**. O sistema marca **Assistido** ao chegar a 90% do vídeo e retoma de onde o aluno parou.
5. Na tela **Vídeos** do módulo, a seção **Quem assistiu** mostra, por aluno, o que já foi assistido.

O arquivo vai **direto do navegador para o MinIO** (S3), por link assinado e temporário, sem passar pelo servidor do app. Por isso:

- O MinIO precisa ser alcançável pelo navegador por HTTPS. Na VPS completa isso já vem pronto (`arquivos.SEUDOMINIO`). No caminho B, é o `S3_ENDPOINT` público; se o app alcança o MinIO por outro endereço, informe o público em `S3_PUBLIC_ENDPOINT`.
- O bucket é privado. O aluno assiste por um link que vence em 1 hora.
- Vídeo é pesado: dimensione o disco da VPS (o backup espelha também os vídeos).
- Envios abandonados (aba fechada no meio) são limpos pela rotina diária de manutenção.

## Depois de instalar (os dois caminhos)

1. **Primeira instituição**: entre em `/master`, **Nova instituição**, informe o nome, o endereço (slug) e o e-mail do administrador. Ele recebe o convite por e-mail (sem Resend, o link aparece na tela).
2. **Aulas ao vivo (Daily)**: registre o webhook uma vez, com as variáveis do Daily no ambiente: `npm run video:webhook -- https://suaempresa.com.br`.
3. **Pagamentos (Asaas)**: em cada instituição, **Admin, Pagamentos**: cole a chave e cadastre o webhook mostrado na tela. Teste primeiro no Sandbox.
4. **Monitoramento**: aponte um monitor externo (UptimeRobot, Better Stack) para `/api/health`.
5. **Privacidade**: o texto da página de privacidade é um modelo e precisa de revisão jurídica.

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Subdomínio não abre ou dá erro de certificado | Faltou o registro A curinga, ou o nome ainda não foi cadastrado como instituição no `/master` |
| `/api/health` responde 503 | Banco inacessível ou variável faltando. Veja `docker compose ... logs app` (ou os logs da Vercel) |
| "permission denied" nas telas | As migrations não rodaram, ou `DATABASE_URL` está com o papel errado (precisa ser `pos_app`) |
| Chave do Asaas deixou de abrir | O `PAYMENT_SECRET` mudou. Volte ao valor original |
| Upload de documento falha | Bucket `pos-saas` não existe, ou as chaves `S3_*` estão erradas |
| E-mails não chegam | Domínio não verificado no Resend, ou `EMAIL_FROM` de outro domínio |
| Login volta para a tela de login | `BETTER_AUTH_URL` e `ROOT_DOMAIN` não batem com o endereço real |

Mais detalhes de operação em [docs/OPERACAO.md](docs/OPERACAO.md) e [docs/DEPLOY.md](docs/DEPLOY.md).
