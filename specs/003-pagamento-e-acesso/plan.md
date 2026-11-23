# 003 · Plano técnico

## Dados (migration 0006)

- `payment_settings`: uma linha por instituição, com chave Asaas cifrada, ambiente e token do webhook.
- `programs.max_installments` (1 a 12, padrão 1).
- `payment_customers`: id do cliente no Asaas por aluno.
- `payments`: cobranças e parcelas (id Asaas, valor, situação, link, vencimento, pago em), ligadas à inscrição.
- RLS forçado e chave composta com `tenant_id`.

## Integração

- `lib/crypto.ts`: cifra a chave com `PAYMENT_SECRET`.
- `lib/asaas.ts`: cliente fino do Asaas v3 (cliente, cobrança, parcelamento, teste de conexão). `ASAAS_BASE_URL` permite apontar para um simulador nos testes.
- `lib/services/payments.ts`: iniciar cobrança (idempotente) e tratar o webhook.
- `/api/webhooks/asaas/[slug]`: confere o token, grava o evento e libera o acesso.

## Telas

- Aluno: bloco "Pagar" na etapa Pagamento de `/inscricoes`.
- Instituição: `/admin/pagamentos` (conexão com Asaas para a administração e lista de cobranças para a secretaria e o financeiro); parcelas máximas no formulário do curso.

## Decisões

- Cobrança com `billingType: UNDEFINED`, para o aluno escolher Pix, boleto ou cartão no link do Asaas.
- `externalReference` = id da inscrição, para o webhook achar a inscrição.
- Liberar acesso é uma transação só: cobrança confirmada, etapa e aviso juntos.
