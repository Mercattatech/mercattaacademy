# 004 · Aulas, aula ao vivo, presença, gravação e calendário

Requisitos: RF-04, RF-05 e RF-09. Sprint 4.

## Objetivo

A coordenação agenda as aulas de cada módulo. O professor dá a aula ao vivo dentro da plataforma, com a tela e o PDF compartilhados. A presença sai do tempo conectado, a gravação aparece sozinha na aula e o aluno acompanha tudo em um calendário que também vai para o Google Agenda.

## Histórias e critérios de aceite

1. **Agendar.** Coordenação e administração criam aulas de um módulo da turma com título, data, hora, duração e professor. A aula aparece no módulo e no calendário. Também podem editar e cancelar.
2. **Materiais.** O professor anexa PDFs à aula antes ou depois do encontro. O aluno lê no navegador ou baixa.
3. **Estados.** O aluno vê Agendada, Ao vivo agora ou Gravada (e Encerrada, quando não houve gravação, e Cancelada).
4. **Aula ao vivo.** O professor inicia a aula pela plataforma. Os alunos com acesso liberado entram com um clique, com áudio, vídeo e chat, e o professor compartilha a tela com o PDF. A gravação na nuvem começa quando o professor entra.
5. **Presença automática.** Cada aluno acumula o tempo conectado. A presença exige um mínimo de porcentagem da aula, configurável por curso (padrão 75%).
6. **Fechar presença.** Depois de encerrar a aula, o professor vê o tempo de cada aluno, ajusta presença ou falta e fecha. Fechada, não muda mais.
7. **Gravação.** Ao fim da transmissão, a gravação é anexada sozinha à aula e o aluno é avisado. O aluno assiste no navegador.
8. **Calendário.** O aluno tem uma agenda geral das aulas, filtrável por módulo (mesma fonte dos dados). Ele baixa um arquivo .iCal ou assina o endereço pessoal no Google Agenda.

## Regras

- Só entra na sala quem tem a inscrição com acesso liberado na turma da aula, ou a equipe da instituição. O link de entrada é gerado no servidor para cada pessoa e expira.
- Professor gerencia as próprias aulas. Coordenação e administração gerenciam todas.
- O horário é o de Brasília. A aula de uma turma só aparece para quem está nela.
- A presença usa o tempo da aula realizada (do início ao fim), não o previsto.
- O endereço do calendário pessoal é secreto e pode ser trocado.

## Fora do escopo

Provas e vencimentos no calendário (entram nos Sprints 5 e 6 pela mesma fonte). Lembrete por e-mail. Chat salvo na plataforma. Relatório de faltas por turma (Sprint 5).

## Questões em aberto

- Provedor definitivo de vídeo: o MVP usa o Daily, atrás de uma interface, para trocar por LiveKit ou Zoom se o custo por hora pedir.
- Conta de vídeo única da plataforma ou por instituição (hoje única, o custo entra no preço por curso).
- Prazo de guarda das gravações (LGPD).
