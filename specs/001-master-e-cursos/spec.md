# 001 · Painel master e cursos (Sprint 1)

Requisitos: RF-01 (instituição e portal), RF-02 (cursos e grade), RF-03 (turmas e matrícula), RF-13 (painel master e administração).

## Painel master (RF-13)

- Como master, quero cadastrar uma instituição com nome, endereço (slug), plano e e-mail do administrador. **Aceite**: a instituição nasce ativa, com assinatura no plano, rótulos padrão e recursos opcionais desligados; o administrador recebe convite por e-mail.
- Como master, quero editar nome, cor e links da instituição. **Aceite**: o endereço (slug) não muda depois de criado.
- Como master, quero suspender (com motivo), reativar e excluir. **Aceite**: suspensa mostra aviso e bloqueia o acesso; excluir exige digitar o endereço da instituição e é exclusão lógica (dados preservados); toda ação vai para a auditoria.
- Como master, quero ligar e desligar recursos opcionais por instituição. **Aceite**: a mudança vale no próximo carregamento.
- Como master, quero conferir os pagamentos da instituição. **Aceite**: estimativa do mês por curso publicado (R$ 300,00 até 100 alunos ativos, mais R$ 3,00 por aluno excedente; valores fictícios), lista de cobranças com situação, gerar a cobrança do mês e marcar como paga. A integração automática com o Asaas da plataforma fica para depois.
- Como master, quero entrar na área da instituição como suporte. **Aceite**: cada acesso fica registrado na auditoria.

## Instituição e portal (RF-01, RF-14)

- Como administrador, quero configurar cor, links (site e redes) e rótulos acadêmicos. **Aceite**: links no rodapé do portal; rótulos aparecem no menu e nas telas.
- Como coordenação, quero publicar avisos gerais. **Aceite**: aparecem no início do aluno, do mais novo para o mais antigo.

## Equipe e convites (RF-13)

- Como administrador, quero convidar pessoas da equipe por e-mail com um perfil. **Aceite**: convite expira em 7 dias; quem já tem conta entra direto; quem não tem cria nome e senha ao aceitar.
- Como administrador, quero remover o acesso de alguém. **Aceite**: o vínculo some; a conta da pessoa continua existindo para outras instituições.

## Cursos e grade (RF-02)

- Como coordenação, quero cadastrar quantos cursos (pós-graduações) quiser. **Aceite**: nome, descrição, carga horária e situação (rascunho, publicado, arquivado).
- Como coordenação, quero montar a grade de módulos. **Aceite**: nome, ementa, carga horária e professor padrão; reordenar para cima e para baixo; excluir módulo.

## Turmas e matrícula (RF-03)

- Como coordenação, quero abrir uma turma a partir da grade. **Aceite**: a turma recebe cópia dos módulos (editável só nela) com datas e professor por módulo; mudar a grade depois não altera turmas existentes.
- Como secretaria, quero matricular alunos um a um. **Aceite**: quem já tem conta é matriculado na hora e avisado por e-mail; quem não tem recebe convite e é matriculado ao aceitar.
- Como secretaria, quero matricular por planilha (CSV com nome e e-mail). **Aceite**: aceita vírgula ou ponto e vírgula; linhas inválidas ou repetidas aparecem num relatório sem impedir as válidas.

## Fora deste sprint

Vitrine e inscrição pelo aluno (Sprint 2), cobrança automática pelo Asaas (Sprint 3 em diante), mini CV de professores (Sprint 6).
