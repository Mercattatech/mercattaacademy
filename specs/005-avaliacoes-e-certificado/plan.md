# Plano técnico · 005

- Migration 0008: `programs.min_grade`, `programs.min_frequency_percent`; tabelas `assessments`, `grades`, `certificates`, `certificate_settings`, todas com RLS forçado pelo mesmo laço das anteriores.
- `src/lib/services/grades.ts`: permissão por módulo, CRUD de avaliação, lançamento de notas em lote, `standingFor` (cálculo puro e testável), `cohortReport`, `evaluateCohort` (emite certificados).
- `src/lib/services/certificates.ts`: emissão idempotente (unique por inscrição ativa), anulação, busca por código.
- `src/lib/certificate-pdf.ts`: PDF em A4 paisagem com `pdf-lib` e QR com `qrcode`.
- Telas: `/notas` (aluno), `/admin/avaliacoes` e `/admin/avaliacoes/[id]`, `/admin/notas` (relatório), `/admin/certificados`, `/verificar/[code]` (público), `/certificados/[id]` (PDF).
- Gatilhos de `evaluateCohort`: salvar notas e fechar presença.
