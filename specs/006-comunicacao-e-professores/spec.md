# 006 · Comunicação e professores

Requisitos: RF-10 e RF-12. Sprint 6.

## Objetivo

A instituição fala com os alunos (avisos por turma e notificações), os alunos conversam sobre cada aula (comentários), todos conhecem os professores (mini CV e módulos) e o aluno tem um canal direto com a secretaria (atendimento).

## Histórias e critérios de aceite

1. **Avisos por turma.** Coordenação e secretaria publicam um aviso para todos ou para uma turma. Cada aluno vê só os avisos gerais e os da sua turma. Quem publica pode marcar "enviar também por e-mail".
2. **Notificações.** Quem recebe um aviso, uma nota, um certificado, uma resposta do atendimento ou uma gravação nova vê na central de notificações, com contador de não lidas no início. Dá para marcar uma como lida ou todas.
3. **Comentários por aula.** Na página da aula, alunos liberados e equipe da aula escrevem comentários (até 2.000 caracteres). O professor da aula é avisado dos comentários de alunos. O autor apaga o próprio comentário; coordenação e professor da aula apagam qualquer um.
4. **Professores.** Cada professor tem mini CV (título, apresentação, link opcional) e escolhe se aparece. O aluno vê a página Professores com quem dá aula nas suas turmas e os módulos de cada um. Professor edita o próprio perfil; coordenação e administração editam o de qualquer um.
5. **Atendimento.** O aluno abre uma conversa com a secretaria (assunto e mensagem), acompanha as respostas e a conversa pode ser encerrada. A secretaria vê todas as conversas, responde e encerra. Nova mensagem do aluno notifica a secretaria; resposta da equipe notifica o aluno. Aluno escrevendo em conversa encerrada a reabre.

## Regras

- Aviso por turma: só alunos com inscrição ativa e acesso liberado naquela turma recebem a notificação.
- Comentários só para quem tem acesso à aula (aluno liberado na turma ou equipe da aula).
- Perfil de professor só aparece ao aluno se o professor der aula em alguma turma dele e deixar o perfil visível.
- O aluno só vê as próprias conversas de atendimento. A equipe de atendimento é secretaria, coordenação e administração.
- Texto sempre escapado na tela (sem HTML). Quebras de linha preservadas.

## Fora do escopo

Respostas em fio nos comentários, menções, anexos no atendimento, foto do professor, fórum da turma (recurso opcional), preferências de notificação, envio de e-mail das notificações em lote por agendamento.

## Questões em aberto

- Se o atendimento precisa de categorias e prazo (SLA) de resposta.
- Se o aviso por e-mail deve respeitar um limite diário por instituição (custo do Resend).
