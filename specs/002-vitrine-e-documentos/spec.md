# 002 · Vitrine, inscrição e documentos

Requisitos: RF-15 (vitrine e inscrição) e RF-08 (secretaria e documentos). Sprint 2.

## Objetivo

Uma pessoa de fora chega ao endereço da instituição, vê os cursos com valor e turmas abertas, se inscreve,
envia os documentos exigidos e acompanha o que falta. A secretaria confere os documentos e vê as inscrições por etapa.
O pagamento em si é o Sprint 3: aqui a etapa de pagamento só abre quando os documentos obrigatórios estão enviados.

## Histórias e critérios de aceite

1. **Vitrine pública.** Qualquer pessoa vê, sem entrar, os cursos publicados com resumo, carga horária, valor e forma de pagamento (à vista ou primeira parcela, como a instituição definir). A página do curso mostra os módulos e as turmas com inscrição aberta e o período.
2. **Inscrição.** Quem não tem conta cria uma (nome, e-mail, senha) na própria inscrição; quem tem conta entra. A inscrição nasce na etapa "Documentos" e fica pendente. Inscrever-se duas vezes na mesma turma não duplica.
3. **Acompanhamento.** O aluno vê três etapas, Documentos, Pagamento e Acesso liberado, e o que falta em cada uma.
4. **Envio de documentos.** O aluno envia cada documento obrigatório em PDF, JPG ou PNG (até 4 MB). Quando todos os obrigatórios estão enviados, a etapa de pagamento abre e a secretaria é avisada.
5. **Lista obrigatória.** A secretaria configura a lista por instituição. Padrão: Diploma, CNH, RG, Comprovante de endereço e Histórico escolar. Cada item pode ser obrigatório ou opcional, ativo ou desativado.
6. **Conferência.** A secretaria abre cada documento. Se estiver errado, recusa com motivo: o arquivo é apagado, o documento volta a Pendente, a etapa volta para Documentos e o aluno recebe aviso (na plataforma e por e-mail) com o motivo. Não há fluxo de correção.
7. **Inscrições por turma e etapa.** A secretaria filtra por turma e por etapa e vê quem concluiu a etapa de documentos.
8. **Quem decide a inscrição.** O curso tem período de inscrição por turma (abre e fecha). Fora do período, a turma não aparece como aberta.

## Regras

- Documentos ficam em armazenamento privado, nunca com link público. O download passa por uma rota que confere perfil (aluno vê só os seus; secretaria e administração veem os da instituição). Toda abertura por equipe vai para a auditoria (LGPD).
- A vitrine só mostra curso publicado e turma com inscrição aberta, e só dados públicos.
- A matrícula na turma (acesso ao conteúdo) só vale com a etapa "Acesso liberado". Matrículas feitas pela secretaria (Sprint 1) já nascem liberadas.
- Isolamento por instituição continua no banco (RLS e chaves compostas com tenant_id).
- Um arquivo por documento por aluno. Tipo e tamanho validados no servidor, pelo conteúdo do arquivo e não só pela extensão.

## Fora do escopo

Pagamento Asaas e liberação automática (Sprint 3). Fluxo de correção de documento (decisão do cliente: recusar = apagar com motivo). Fila de aprovação de inscrição pela instituição.

## Questões em aberto

- Limite de tamanho (4 MB, por causa do limite da Vercel; envio direto ao armazenamento libera arquivos maiores) e prazo de guarda dos documentos de quem não conclui a matrícula, a combinar com a instituição.
- Texto de consentimento LGPD exibido no envio, a revisar com o jurídico do cliente.
