# 001 · Painel master e cursos: plano

## Modelo de dados (migration 0004)

| Tabela | Uso |
| --- | --- |
| `announcements` | Avisos da instituição |
| `programs` | Cursos (pós-graduações): nome, descrição, carga horária, situação |
| `program_modules` | Grade do curso: posição, nome, ementa, carga horária, professor padrão |
| `cohorts` | Turmas: curso, nome, datas, situação |
| `cohort_modules` | Cópia da grade na turma, com datas e professor próprios |
| `enrollments` | Matrícula do aluno na turma (origem: manual, planilha, vitrine) |
| `invites` (+ `name`, `cohort_id`) | Convite de equipe ou de aluno; o de aluno já carrega a turma |

Todas com `tenant_id` e RLS forçado (o teste da Constituição cobre automaticamente).

## Regras no servidor

- `src/lib/services/*`: funções que recebem a conexão já com contexto (`withContext`), testáveis sem o Next.
- Convite: token aleatório de 32 bytes; só o hash SHA-256 vai para o banco. Busca pelo hash com `app.invite_lookup` (papel `pos_reader`), porque quem aceita ainda não tem contexto de instituição. O aceite roda com o contexto da instituição do convite.
- Turma a partir da grade: cópia em uma transação; `cohort_modules.program_module_id` guarda a origem.
- Cobrança estimada: função pura em `services/billing.ts`, por curso publicado.
- Acesso de suporte: master sem vínculo na instituição entra como administrador e cada página registra `support_access` em `audit_log`.

## Telas

- Master: `/master`, `/master/nova`, `/master/[slug]`.
- Instituição: `/t/[slug]/admin` com Configurações, Equipe, Avisos, Cursos (grade e turmas) e Turma (módulos e alunos).
- Público: `/t/[slug]/convite/[token]`.

Formulários com Server Actions e `useActionState` para mostrar erro ou confirmação no próprio formulário.
