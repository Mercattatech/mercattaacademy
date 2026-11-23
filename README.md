# pos-saas

Plataforma SaaS de pós-graduação e cursos. Primeiro cliente: Instituto Bressane.
A especificação completa está no Spec SDD (Claude Docs); aqui ficam o código e os specs por requisito.

## O que existe no Sprint 0

- Next.js 15 (App Router, TypeScript, Tailwind) e Postgres puro, pensado para rodar numa VPS.
- Login por e-mail e senha (Better Auth).
- Instituições isoladas no banco por RLS: o app conecta como `pos_app`, que não enxerga dados de outra instituição.
- Instituição identificada pelo subdomínio: `bressane.localhost:3000` em desenvolvimento.
- Recursos ativáveis por instituição (`features`, `tenant_features`) e rótulos personalizáveis (Módulo ou Disciplina).
- Painel master inicial (lista de instituições) e menu do aluno montado pelos recursos ligados.
- Testes de isolamento rodando contra um Postgres real.

## O que existe no Sprint 1

- Painel master: cadastrar instituição (com convite ao administrador), editar, suspender, reativar, excluir,
  ligar recursos opcionais, ver a estimativa de cobrança, gerar a cobrança do mês e marcar como paga.
- Acesso de suporte à área da instituição, com aviso na tela e registro na auditoria.
- Área da instituição (`/admin`): configurações, equipe e convites, avisos, cursos com grade de módulos,
  turmas com datas e professores, matrícula um a um ou por planilha CSV.
- Aceite de convite: a pessoa cria a senha, ou entra com a conta que já tem.
- Sem `RESEND_API_KEY`, os e-mails não saem: o link do convite aparece na própria tela para você testar.

## O que existe no Sprint 2 e no Sprint 3

- Vitrine pública com cursos, valores e turmas abertas; inscrição com criação de conta; envio de documentos
  (PDF, JPG ou PNG, até 4 MB) e conferência pela secretaria, com recusa por motivo.
- Pagamento pelo Asaas de cada instituição (à vista ou parcelado), com liberação automática do acesso pelo webhook.
  A administração conecta a chave em `/admin/pagamentos` e cola o endereço e o token do webhook no painel do Asaas.
- Defina `PAYMENT_SECRET` no `.env` (cifra a chave do Asaas). Para testar sem o Asaas real, use `ASAAS_BASE_URL`.

## O que existe no Sprint 4

- Aulas ao vivo por videoconferência (Daily), com a sala dentro da plataforma, chat, compartilhamento de tela e gravação em nuvem.
- Coordenação agenda por módulo da turma (horário de Brasília); o professor da aula inicia e encerra; PDFs de apoio por aula.
- Presença automática pelo tempo conectado (mínimo configurável por curso, padrão 75%), com ajuste do professor antes de fechar.
- Gravação anexada sozinha quando fica pronta; o aluno liberado é avisado e assiste na plataforma.
- Agenda do aluno com filtro por módulo e endereço de calendário (.ics) secreto para Google Agenda.

Para ligar: crie uma conta no Daily, preencha `DAILY_API_KEY` e `DAILY_WEBHOOK_SECRET` no `.env` e, com a plataforma publicada, rode
`npm run video:webhook -- https://seu-dominio`. A gravação em nuvem é um recurso pago do Daily.

## O que existe no Sprint 5

- Avaliações por módulo da turma (peso e nota máxima) e lançamento de notas em uma tela por avaliação, pelo professor do módulo ou pela coordenação.
- Boletim do aluno em `/notas`: nota de cada avaliação, média do módulo, média final, frequência e situação (em andamento, aprovado, reprovado, com o motivo).
- Relatório da turma em `/admin/notas` para coordenação, secretaria e professores.
- Regras por curso: nota mínima (padrão 7,0) e frequência mínima (padrão 80%), no formulário do curso.
- Certificado emitido sozinho ao ficar aprovado (ao lançar nota ou fechar presença), em PDF A4 com QR code, e conferência pública em `/verificar/<código>`.
- Assinatura (nome e cargo) e rodapé em `/admin/certificados`; a administração pode anular um certificado com motivo.

## O que existe no Sprint 6

- Avisos para todos ou para uma turma, com opção de enviar também por e-mail, e central de notificações com contador de não lidas no início.
- Comentários em cada aula, com o professor destacado; o professor é avisado dos comentários dos alunos.
- Página Professores com mini CV e módulos de cada um (o professor edita o próprio perfil; coordenação edita qualquer um).
- Atendimento: o aluno abre conversa com a secretaria, que responde e encerra pela fila em `/admin/atendimento`.

## Rodar no Windows

Pré-requisitos: Node.js 22 ou mais novo e um Postgres 16 local, por um dos dois caminhos abaixo.

### Caminho A: Docker Desktop (mais simples)

```powershell
docker compose up -d
```

Isso sobe o Postgres na porta 5432 já com os papéis e o banco `pos_saas`, e o MinIO (arquivos) nas
portas 9000 e 9001. Senha do superusuário do Postgres: `postgres`.

### Caminho B: instalador do PostgreSQL

1. Baixe o PostgreSQL 16 para Windows em postgresql.org/download/windows e instale (anote a senha do usuário `postgres`).
2. Na pasta do projeto, no PowerShell:

```powershell
$psql = "C:\Program Files\PostgreSQL\16\bin\psql.exe"
& $psql -U postgres -f db\setup\roles.sql
& $psql -U postgres -f db\setup\database.sql
```

### Depois, nos dois caminhos

```powershell
npm install
copy .env.example .env      # gere um BETTER_AUTH_SECRET novo: npx @better-auth/cli secret
npm run db:migrate
npm run db:seed
npm run dev
```

- Plataforma e painel master: http://localhost:3000/master
- Instituição de exemplo: http://bressane.localhost:3000 (Chrome e Edge resolvem `*.localhost` sozinhos)
- Logins do seed: `master@plataforma.local` e `admin@bressane.local`, ambos com a senha de `MASTER_PASSWORD` no `.env`.

### Testes de isolamento

Os testes criam um banco `pos_saas_test` do zero, então precisam do superusuário:

```powershell
$env:TEST_SUPERUSER_URL = "postgres://postgres:SUA_SENHA@localhost:5432/postgres"
npm test
```

## Banco de dados

| Papel | Uso | RLS |
| --- | --- | --- |
| `pos_owner` | Dono das tabelas; só roda migrations (`DATABASE_OWNER_URL`) | Sujeito (RLS forçado) |
| `pos_app` | Conexão do app (`DATABASE_URL`) | Sujeito a todas as políticas |
| `pos_reader` | Sem login; dono das funções `resolve_tenant` e `is_platform_admin` | Ignora o RLS só dentro delas |

Toda consulta a dados de instituição passa por `withContext` (`src/lib/db.ts`), que grava
`app.tenant_id`, `app.user_id` e `app.is_master` na transação. Sem contexto, o banco não devolve nada.

Migrations ficam em `db/migrations`, numeradas, e rodam em ordem com `npm run db:migrate`.
Toda tabela nova com `tenant_id` precisa de RLS forçado: o teste "Constituição" falha se faltar.

## Produção: app na Vercel, banco e arquivos na VPS

### Na VPS (Postgres, PgBouncer e MinIO)

1. Instale o Postgres 16 e rode `db/setup/roles.sql` e `db/setup/database.sql` como superusuário.
2. Troque as senhas de desenvolvimento: `alter role pos_owner password '...'; alter role pos_app password '...';`
3. Ative SSL no Postgres e libere a porta só para o que precisa acessar.
4. Instale o PgBouncer em modo `transaction` na frente do Postgres. A Vercel abre muitas conexões curtas;
   o PgBouncer junta tudo em poucas conexões reais. O `withContext` grava o contexto só dentro da
   transação, por isso funciona com esse modo.
5. Instale o MinIO (arquivos) com HTTPS e crie o bucket `pos-saas`, privado.

### Na Vercel

1. Importe o repositório e configure as variáveis do `.env.example`:
   - `DATABASE_URL`: papel `pos_app`, apontando para o PgBouncer, com `?sslmode=require`.
   - `BETTER_AUTH_URL` e `ROOT_DOMAIN`: o domínio da plataforma.
   - `S3_*`: endereço e chaves do MinIO.
   - `RESEND_API_KEY` e `EMAIL_FROM`: e-mail pelo Resend; verifique o domínio de envio no painel do Resend.
2. Escolha a região de funções mais próxima da VPS (para VPS no Brasil: São Paulo, `gru1`).
3. Domínios: adicione `seudominio.com.br` e `*.seudominio.com.br` ao projeto. O curinga exige que o
   DNS do domínio fique com a Vercel (nameservers da Vercel).
4. Migrations não rodam na Vercel: rode `npm run db:migrate` da sua máquina ou da VPS, com
   `DATABASE_OWNER_URL` apontando direto para o Postgres (sem PgBouncer), antes de publicar.

## Vídeos gravados por módulo

- Recurso opcional `aulas_gravadas` (o master liga por instituição). Em **Cursos**, cada módulo tem a tela **Vídeos**: a coordenação envia, renomeia, reordena e exclui.
- Upload direto do navegador ao S3/MinIO por link assinado (até 2 GB, MP4, WebM ou MOV), com barra de progresso. Sem S3 (desenvolvimento), grava na pasta `.storage`.
- Progresso por aluno: o player retoma de onde o aluno parou e marca **Assistido** ao chegar a 90% do vídeo (ou ao fim). A lista do aluno mostra "X de Y assistidos" por módulo; na tela Vídeos do módulo, a coordenação vê quem assistiu cada vídeo.
- O aluno com matrícula ativa e acesso liberado assiste em **Mais, Vídeos gravados**; o arquivo é privado e entregue por link que vence em 1 hora.

## Estrutura SDD

```
memory/constitution.md     princípios que nenhuma tarefa pode violar
specs/README.md            índice dos requisitos e status
specs/000-fundacao/        spec.md, plan.md, tasks.md do Sprint 0
db/migrations/             SQL versionado
tests/                     testes de isolamento e de critérios de aceite
```

## O que existe no Sprint 7 (estabilização e piloto)

- Cabeçalhos de segurança em todas as rotas e `/api/health` para monitoramento.
- `npm run check:env` confere o ambiente antes de publicar; `npm run smoke -- <url>` confere o site depois.
- Páginas de erro e 404 em português.
- Alunos e equipe: **Meus dados** (baixar JSON e pedir exclusão pelo Atendimento) e **Privacidade** (texto modelo, precisa de revisão jurídica).
- Admin, **Auditoria**: últimos 200 registros, com filtro por tipo.
- `npm run maintenance` para limpeza diária.
- Guias em `docs/`: DEPLOY, OPERACAO e PILOTO.
