# 002 · Plano técnico

## Dados (migration 0005)

- `programs`: `price_cents`, `payment_note` (texto livre, ex.: "À vista ou primeira parcela"), `summary`.
- `cohorts`: `enrollment_opens_on`, `enrollment_closes_on`.
- `document_types`: lista por instituição (nome, obrigatório, ativo, posição). Padrão de 5 itens criado com a instituição e retroativo para as existentes.
- `enrollments.stage`: `documents` | `payment` | `released`. Existentes e manuais são `released`.
- `student_documents`: um por (matrícula, tipo), com `status` (`pending` | `sent`), chave do arquivo, tipo, tamanho e motivo da última recusa.
- `notifications`: aviso dentro da plataforma (para aluno e para a secretaria), com leitura.
- RLS forçado e chave composta com `tenant_id` em tudo.

## Armazenamento

Interface `storage` com dois motores: S3 (MinIO na VPS) quando `S3_ENDPOINT` existe, e pasta local `.storage/` em desenvolvimento. Chave: `<tenant_id>/<enrollment_id>/<tipo>-<uuid>`. Sem URL pública: download em `/t/[slug]/arquivos/[documentId]`, que confere sessão e perfil.

## Telas

- Público: `/t/[slug]` (vitrine), `/t/[slug]/cursos/[id]`, `/t/[slug]/inscricao/[cohortId]` (cadastro ou login e inscrição).
- Aluno: `/t/[slug]/inscricoes` (etapas e envio de documentos).
- Equipe: `/t/[slug]/admin/inscricoes` (filtro por turma e etapa, conferência) e `/admin/documentos` (lista obrigatória); preço, resumo e período nas telas de curso e turma existentes.

## Decisões

- Envio por Server Action com FormData, validação por assinatura do arquivo (PDF, JPEG, PNG).
- Aviso à secretaria: notificação para cada pessoa com perfil de secretaria ou administração, mais contador no menu.
