# Plano técnico · 006

- Migration 0009: `announcements.cohort_id`; tabelas `lesson_comments`, `teacher_profiles`, `support_threads`, `support_messages` (RLS forçado).
- `src/lib/services/communication.ts`: avisos (publicar, listar por visibilidade), notificações, comentários, professores.
- `src/lib/services/support.ts`: atendimento.
- Telas: `/notificacoes`, `/professores`, `/atendimento`, `/atendimento/[id]`, `/admin/professores`, `/admin/professores/[userId]`, `/admin/atendimento`; avisos admin ganha turma e e-mail; aula ganha comentários.
