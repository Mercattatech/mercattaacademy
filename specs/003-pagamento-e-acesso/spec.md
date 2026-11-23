# 003 · Pagamento e liberação de acesso

Requisito: RF-11. Sprint 3.

## Objetivo

Quando o aluno conclui os documentos, ele paga a inscrição na conta Asaas da própria instituição.
Confirmado o pagamento, o acesso é liberado sem ninguém clicar em nada.

## Histórias e critérios de aceite

1. **Conexão com o Asaas.** A administração informa a chave de API do Asaas da instituição e escolhe Sandbox (teste) ou Produção. A tela testa a conexão antes de salvar, mostra o endereço do webhook e o token para colar no painel do Asaas. A chave nunca é exibida de novo depois de salva.
2. **Pagar.** Na etapa Pagamento, o aluno informa o CPF e escolhe à vista ou parcelado (até o máximo que o curso permite). Recebe o link da cobrança do Asaas, onde paga por Pix, boleto ou cartão. Clicar de novo reaproveita a cobrança em aberto.
3. **Liberação automática.** Quando o Asaas avisa que o pagamento (à vista) ou a primeira parcela foi confirmado, a inscrição vai para Acesso liberado, o aluno recebe aviso na plataforma e por e-mail e a secretaria vê o pagamento como confirmado.
4. **Parcelas seguintes.** As demais parcelas só atualizam o histórico. Atraso ou estorno de uma parcela não tira o acesso (decisão a revisar com o cliente).
5. **Lista de pagamentos.** Secretaria e financeiro veem as cobranças por situação (aguardando, confirmada, vencida, estornada), com aluno, valor e turma.
6. **Sem Asaas configurado.** O aluno vê que o pagamento será combinado com a secretaria, e a liberação manual do Sprint 2 continua funcionando.
7. **Segurança.** O webhook só é aceito com o token da instituição. Chamada repetida do Asaas não duplica nada. Cada instituição usa só a própria chave.

## Regras

- O valor cobrado é o do curso. À vista cobra o valor total; parcelado cobra N parcelas iguais (arredondamento na última) pelo Asaas.
- O CPF vai direto ao Asaas e não é guardado na plataforma. Guardamos só o identificador do cliente no Asaas.
- A chave de API fica cifrada no banco (AES-256-GCM) com um segredo do servidor.
- Isolamento por instituição continua no banco (RLS e chaves compostas).

## Fora do escopo

Cobrança da assinatura da plataforma pelo Asaas da plataforma (continua manual). Cupom e desconto. Reembolso feito pela plataforma (a instituição estorna no Asaas). Nota fiscal.

## Questões em aberto

- Suspender o acesso por inadimplência das parcelas seguintes?
- Prazo de vencimento da primeira cobrança (padrão: 3 dias).
- Registro automático do webhook no Asaas (hoje a instituição cola o endereço e o token uma vez).
