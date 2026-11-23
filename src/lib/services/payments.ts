import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { AsaasError, createCharge, createCustomer, type AsaasEnv } from "../asaas";
import { decryptSecret } from "../crypto";
import { withContext } from "../db";
import { audit } from "./audit";
import { notify } from "./documents";

export type PaymentStatus = "pending" | "confirmed" | "overdue" | "refunded" | "canceled";
export const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  pending: "Aguardando", confirmed: "Confirmado", overdue: "Vencido", refunded: "Estornado", canceled: "Cancelado",
};

export const newWebhookToken = () => randomBytes(24).toString("hex");

export type CheckoutResult =
  | { ok: true; invoiceUrl: string; reused: boolean }
  | { ok: false; error: "not_configured" | "no_price" | "not_in_payment" | "bad_installments" | "asaas"; message?: string };

const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

/**
 * Gera a cobrança da inscrição na conta Asaas da instituição (ou reaproveita a que está em aberto).
 * Tudo sob um lock da inscrição, para clique duplo não gerar duas cobranças.
 */
export async function startCheckout(input: {
  tenantId: string; userId: string; enrollmentId: string; cpf: string; installments: number;
}): Promise<CheckoutResult> {
  return withContext({ tenantId: input.tenantId, userId: input.userId }, async (c): Promise<CheckoutResult> => {
    await c.query("select pg_advisory_xact_lock(hashtext($1))", [input.enrollmentId]);
    const enr = (
      await c.query<{ stage: string; price_cents: number | null; max_installments: number; program: string; cohort: string; name: string; email: string }>(
        `select e.stage, p.price_cents, p.max_installments, p.name as program, co.name as cohort, u.name, u.email
         from enrollments e join cohorts co on co.tenant_id = e.tenant_id and co.id = e.cohort_id
         join programs p on p.tenant_id = co.tenant_id and p.id = co.program_id
         join "user" u on u.id = e.user_id
         where e.id = $1 and e.user_id = $2 and e.status = 'active'`,
        [input.enrollmentId, input.userId],
      )
    ).rows[0];
    if (!enr || enr.stage !== "payment") return { ok: false, error: "not_in_payment" };
    if (!enr.price_cents) return { ok: false, error: "no_price" };
    const settings = (await c.query<{ api_key_enc: string; environment: AsaasEnv }>("select api_key_enc, environment from payment_settings")).rows[0];
    if (!settings) return { ok: false, error: "not_configured" };

    const open = (
      await c.query<{ invoice_url: string }>(
        `select invoice_url from payments where enrollment_id = $1 and installment_no = 1 and status in ('pending', 'overdue') and invoice_url is not null order by created_at desc limit 1`,
        [input.enrollmentId],
      )
    ).rows[0];
    if (open) return { ok: true, invoiceUrl: open.invoice_url, reused: true };

    if (!Number.isInteger(input.installments) || input.installments < 1 || input.installments > enr.max_installments) {
      return { ok: false, error: "bad_installments" };
    }

    const apiKey = decryptSecret(settings.api_key_enc);
    try {
      let customerId = (await c.query<{ asaas_customer_id: string }>("select asaas_customer_id from payment_customers where user_id = $1", [input.userId])).rows[0]?.asaas_customer_id;
      if (!customerId) {
        customerId = await createCustomer(settings.environment, apiKey, { name: enr.name, email: enr.email, cpf: input.cpf, reference: input.userId });
        await c.query("insert into payment_customers (tenant_id, user_id, asaas_customer_id) values ($1, $2, $3)", [input.tenantId, input.userId, customerId]);
      }
      const charge = await createCharge(settings.environment, apiKey, {
        customerId, totalCents: enr.price_cents, installments: input.installments, dueDate: isoDay(3),
        description: `${enr.program}, ${enr.cohort}`, reference: input.enrollmentId,
      });
      const perInstallment = Math.round(enr.price_cents / input.installments);
      await c.query(
        `insert into payments (tenant_id, enrollment_id, asaas_id, installment_no, installments, amount_cents, status, invoice_url, due_date)
         values ($1, $2, $3, 1, $4, $5, 'pending', $6, $7)`,
        [input.tenantId, input.enrollmentId, charge.id, input.installments, input.installments > 1 ? perInstallment : enr.price_cents, charge.invoiceUrl, charge.dueDate],
      );
      await audit(c, { tenantId: input.tenantId, actorUserId: input.userId, action: "payment_created", entity: "enrollment", entityId: input.enrollmentId, data: { installments: input.installments } });
      return { ok: true, invoiceUrl: charge.invoiceUrl, reused: false };
    } catch (error) {
      if (error instanceof AsaasError) return { ok: false, error: "asaas", message: error.message };
      throw error;
    }
  });
}

const STATUS_BY_EVENT: Record<string, PaymentStatus> = {
  PAYMENT_CONFIRMED: "confirmed", PAYMENT_RECEIVED: "confirmed", PAYMENT_RECEIVED_IN_CASH: "confirmed",
  PAYMENT_OVERDUE: "overdue",
  PAYMENT_REFUNDED: "refunded", PAYMENT_CHARGEBACK_REQUESTED: "refunded",
  PAYMENT_DELETED: "canceled",
};

export type AsaasWebhook = {
  event?: string;
  payment?: { id?: string; value?: number; externalReference?: string; invoiceUrl?: string; dueDate?: string; installmentNumber?: number };
};

export type WebhookOutcome = {
  handled: boolean;
  released?: { email: string; name: string; program: string };
};

/** Aplica um evento do Asaas. Idempotente: repetir o mesmo evento não muda nada. */
export async function applyAsaasEvent(c: PoolClient, tenantId: string, body: AsaasWebhook): Promise<WebhookOutcome> {
  const status = body.event ? STATUS_BY_EVENT[body.event] : undefined;
  const p = body.payment;
  if (!status || !p?.id || !p.externalReference || !/^[0-9a-f-]{36}$/i.test(p.externalReference)) return { handled: false };

  const enr = (
    await c.query<{ id: string; stage: string; user_id: string; name: string; email: string; program: string }>(
      `select e.id, e.stage, e.user_id, u.name, u.email, pr.name as program
       from enrollments e join "user" u on u.id = e.user_id
       join cohorts co on co.tenant_id = e.tenant_id and co.id = e.cohort_id
       join programs pr on pr.tenant_id = co.tenant_id and pr.id = co.program_id
       where e.id = $1 for update of e`,
      [p.externalReference],
    )
  ).rows[0];
  if (!enr) return { handled: false };

  const sibling = (await c.query<{ installments: number }>("select max(installments)::int as installments from payments where enrollment_id = $1", [enr.id])).rows[0];
  const cents = Math.round((p.value ?? 0) * 100);
  const no = p.installmentNumber ?? 1;
  const before = (await c.query<{ status: PaymentStatus }>("select status from payments where asaas_id = $1", [p.id])).rows[0]?.status;

  await c.query(
    `insert into payments (tenant_id, enrollment_id, asaas_id, installment_no, installments, amount_cents, status, invoice_url, due_date, paid_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, case when $7 = 'confirmed' then now() end)
     on conflict (tenant_id, asaas_id) do update
       set status = excluded.status, updated_at = now(),
           paid_at = case when excluded.status = 'confirmed' then coalesce(payments.paid_at, now()) else payments.paid_at end`,
    [tenantId, enr.id, p.id, no, sibling?.installments ?? 1, Math.max(cents, 1), status, p.invoiceUrl ?? null, p.dueDate ?? null],
  );

  // Libera o acesso na primeira confirmação (à vista ou primeira parcela).
  if (status === "confirmed" && before !== "confirmed" && no === 1 && enr.stage !== "released") {
    await c.query("update enrollments set stage = 'released', stage_changed_at = now() where id = $1", [enr.id]);
    await notify(c, { tenantId, userId: enr.user_id, kind: "access_released", message: "Pagamento confirmado. Seu acesso está liberado!", href: "/inscricoes", enrollmentId: enr.id });
    await audit(c, { tenantId, actorUserId: null, action: "access_released_by_payment", entity: "enrollment", entityId: enr.id, data: { asaasId: p.id } });
    return { handled: true, released: { email: enr.email, name: enr.name, program: enr.program } };
  }
  return { handled: true };
}
