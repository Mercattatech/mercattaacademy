# Piloto com o Instituto Bressane

## Dados a coletar com o instituto
- Logo (SVG ou PNG) e cores da marca
- Documentos exigidos na matrícula
- Cursos, turmas, valores e formas de pagamento
- Quem assina o certificado (nome e cargo) e modelo desejado
- Responsável pelos dados pessoais (e-mail para o aviso de privacidade)
- Conta Asaas e conta Daily da instituição
- Lista da equipe com perfil de cada pessoa

## Antes do dia
- [ ] `npm run check:env` sem erros
- [ ] Domínio e curinga funcionando, `npm run smoke` verde
- [ ] Backup diário e monitor de `/api/health` ativos
- [ ] Asaas em produção, webhook cadastrado, uma cobrança real de teste paga e conciliada
- [ ] Daily: aula de teste com presença e gravação
- [ ] Certificado de teste emitido e verificado em `/verificar/<código>`
- [ ] Texto de Privacidade revisado pelo jurídico do instituto
- [ ] Equipe treinada: secretaria (documentos, atendimento), financeiro, professores (aulas, notas)

## Dia da abertura
- [ ] Publicar cursos e turmas
- [ ] Acompanhar `/api/health` e Atendimento durante o dia
- [ ] Conferir as primeiras matrículas de ponta a ponta

## Primeira semana
- [ ] Revisar Auditoria e pagamentos pendentes
- [ ] Coletar dúvidas da secretaria e dos alunos
- [ ] Reunião de balanço no fim da semana
