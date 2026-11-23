# 001 · Painel master e cursos: tarefas

- [x] Migration 0004: avisos, cursos, grade, turmas, módulos da turma, matrículas, convites com turma
- [x] Chaves compostas com `tenant_id`: o banco recusa ligar dados de instituições diferentes
- [x] Trava no banco: instituição edita marca e links, mas não situação, plano ou endereço
- [x] Convites com token guardado só como hash, validade de 7 dias, renovação sem duplicar
- [x] Matrícula: conta existente entra na hora; nova recebe convite e entra ao aceitar
- [x] Planilha CSV (vírgula ou ponto e vírgula, com ou sem cabeçalho) com relatório de linhas inválidas
- [x] Painel master: cadastrar, editar, suspender, reativar, excluir (exclusão lógica com confirmação)
- [x] Painel master: recursos opcionais, estimativa de cobrança, gerar cobrança do mês, marcar como paga
- [x] Acesso de suporte com aviso na tela e registro na auditoria
- [x] Área da instituição: visão geral, configurações (marca, links, rótulos), equipe, avisos
- [x] Cursos e grade: cadastrar, publicar, adicionar, editar, reordenar e excluir módulos
- [x] Turmas: abrir a partir da grade, datas e professor por módulo, aviso de datas invertidas
- [x] Aceite de convite: criar senha, entrar com conta existente, convite usado ou vencido
- [x] Formulários mantêm o que foi digitado quando há erro
- [x] Testes: 32 contra Postgres real (isolamento, convites, grade, turma, matrícula, CSV, cobrança)
- [x] Teste de ponta a ponta no navegador: master cria instituição, admin aceita, monta curso, abre turma, matricula, master cobra, suspende e reativa
