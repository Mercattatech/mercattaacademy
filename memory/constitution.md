# Constituição

Dez princípios que nenhuma feature, sprint ou atalho pode violar. Toda tarefa é checada contra eles.

1. **Vocabulário de cada instituição**: rótulos acadêmicos configuráveis por instituição (na Bressane: Pós-graduação, Turma, Módulo e Aula). Termos técnicos (SCORM, coorte, tenant) nunca aparecem para usuários.
2. **Núcleo comum, recursos ativáveis**: o que varia entre instituições vira recurso opcional ligado por configuração, nunca código separado por cliente.
3. **Isolamento por instituição no banco**: toda tabela de instituição tem `tenant_id` e RLS forçado no Postgres. O app conecta como `pos_app` e só consulta por `withContext`.
4. **Aula ao vivo é o centro**: agendar, transmitir, registrar presença e arquivar a gravação acontecem sem trabalho manual.
5. **Tudo dentro da plataforma**: notas, faltas, documentos, financeiro e calendário não dependem de sistemas externos para o aluno consultar.
6. **Matrícula só com documentação completa**: nenhuma matrícula é concluída com documento obrigatório faltando.
7. **Dinheiro do aluno vai direto à instituição**: cada instituição conecta a própria conta Asaas e a plataforma cobra só a assinatura da plataforma. O acesso libera com o pagamento à vista ou da primeira parcela; bloqueio por atraso posterior só com regra aprovada pela instituição.
8. **Dados pessoais sob LGPD**: documentos em armazenamento privado, acesso por perfil, toda ação da secretaria registrada em `audit_log`.
9. **Mobile-first e acessível**: toda tela nasce no celular e cumpre WCAG 2.1 AA.
10. **Spec antes do código**: nenhuma tarefa entra em sprint sem requisito, critério de aceite e impacto no modelo de dados escritos em `specs/`.
