# 004 · Plano técnico

## Dados (migration 0007)

- `programs.min_attendance_percent` (padrão 75).
- `lessons`: módulo da turma, horário, duração, professor, estado, sala, início e fim reais, presença fechada, gravação.
- `lesson_materials`: PDFs no armazenamento privado.
- `attendance` (tempo e ajuste do professor) e `attendance_sessions` (uma linha por entrada, para não contar duas vezes o mesmo aviso).
- `calendar_tokens`: endereço secreto do calendário de cada pessoa.
- Funções seguras `app.lesson_by_room` e `app.calendar_owner`, para o webhook e o calendário acharem a instituição antes de existir contexto.

## Vídeo

`lib/video.ts` é a interface: criar sala, gerar entrada, encerrar sala, link da gravação, conferir webhook. O adaptador atual é o Daily (sala privada, gravação na nuvem, chat e compartilhamento de tela, embutido por iframe). `DAILY_BASE_URL` aponta para um simulador nos testes.

Webhook `/api/webhooks/daily`, com assinatura HMAC: `participant.left` soma o tempo, `meeting.ended` encerra a aula e `recording.ready-to-download` anexa a gravação.

## Telas

- Equipe: `/admin/aulas` (lista e agendamento), `/admin/aulas/[id]` (materiais, iniciar e encerrar, presença).
- Aluno: `/aulas` (agenda por módulo e endereço do calendário), `/aula/[id]` (sala, materiais, gravação).
- `/agenda/[token]` entrega o .ics. `/materiais/[id]` entrega o PDF só a quem pode.

## Decisões

- Link de entrada por pessoa (token do Daily com o id do usuário), assim o webhook sabe de quem é cada tempo.
- Link da gravação gerado na hora de assistir (expira), sem copiar o vídeo.
- Presença final = ajuste do professor, senão tempo mínimo atingido.
