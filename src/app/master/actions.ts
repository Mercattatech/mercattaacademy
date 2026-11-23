"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/components/action-form";
import { withContext } from "@/lib/db";
import { sendInviteEmail } from "@/lib/emails";
import { requireMaster } from "@/lib/guards";
import { audit } from "@/lib/services/audit";
import { courseUsage } from "@/lib/services/academic";
import { estimateBilling } from "@/lib/services/billing";
import { createInvite } from "@/lib/services/invites";
import { createTenant, setFeature, setTenantStatus, validateSlug } from "@/lib/services/tenants";

const asMaster = (userId: string) => ({ master: true, userId });

async function tenantBySlug(userId: string, slug: string) {
  return withContext(asMaster(userId), async (c) =>
    (await c.query<{ id: string; name: string; slug: string; plan_id: string }>(
      "select id, name, slug, plan_id from tenants where slug = $1 and status <> 'deleted'",
      [slug],
    )).rows[0],
  );
}

const newTenantSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da instituição."),
  slug: z.string().trim().toLowerCase(),
  planId: z.string().uuid("Escolha um plano."),
  adminName: z.string().trim().optional(),
  adminEmail: z.string().trim().email("Informe um e-mail válido para o administrador."),
});

export async function createTenantAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { userId } = await requireMaster();
  const parsed = newTenantSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const slugError = validateSlug(parsed.data.slug);
  if (slugError) return { error: slugError };

  let created: { tenantId: string; inviteToken: string };
  try {
    created = await withContext(asMaster(userId), (c) => createTenant(c, { ...parsed.data, actorId: userId }));
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return { error: "Já existe uma instituição com este endereço." };
    throw error;
  }
  await sendInviteEmail({
    tenantSlug: parsed.data.slug,
    tenantName: parsed.data.name,
    email: parsed.data.adminEmail,
    name: parsed.data.adminName,
    role: "admin",
    token: created.inviteToken,
  });
  revalidatePath("/master", "layout");
  revalidatePath("/master/instituicoes");
  redirect(`/master/${parsed.data.slug}?criada=1`);
}

const brandSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome."),
  primary: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor no formato #1f4e79."),
  site: z.string().trim().url("Site inválido.").or(z.literal("")),
  instagram: z.string().trim().url("Link do Instagram inválido.").or(z.literal("")),
});

export async function updateTenantAction(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { userId } = await requireMaster();
  const parsed = brandSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const tenant = await tenantBySlug(userId, slug);
  if (!tenant) return { error: "Instituição não encontrada." };
  const { name, primary, site, instagram } = parsed.data;
  await withContext(asMaster(userId), async (c) => {
    await c.query(
      `update tenants set name = $2, brand = brand || $3::jsonb, links = $4::jsonb, updated_at = now() where id = $1`,
      [tenant.id, name, { primary }, Object.fromEntries(Object.entries({ site, instagram }).filter(([, v]) => v))],
    );
    await audit(c, { tenantId: tenant.id, actorUserId: userId, action: "tenant_updated", entity: "tenant", entityId: tenant.id });
  });
  revalidatePath(`/master/${slug}`);
  return { ok: "Dados salvos." };
}

export async function setStatusAction(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { userId } = await requireMaster();
  const tenant = await tenantBySlug(userId, slug);
  if (!tenant) return { error: "Instituição não encontrada." };
  const status = String(form.get("status"));
  const reason = String(form.get("reason") ?? "").trim();

  if (status === "suspended" && reason.length < 3) return { error: "Informe o motivo da suspensão." };
  if (status === "deleted" && String(form.get("confirm") ?? "").trim() !== slug) {
    return { error: `Para excluir, digite exatamente: ${slug}` };
  }
  if (!["active", "suspended", "deleted"].includes(status)) return { error: "Ação inválida." };

  await withContext(asMaster(userId), (c) =>
    setTenantStatus(c, { tenantId: tenant.id, status: status as "active" | "suspended" | "deleted", reason, actorId: userId }),
  );
  revalidatePath("/master", "layout");
  if (status === "deleted") redirect("/master/instituicoes");
  revalidatePath(`/master/${slug}`);
  return { ok: status === "suspended" ? "Instituição suspensa." : "Instituição reativada." };
}

export async function setFeaturesAction(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { userId } = await requireMaster();
  const tenant = await tenantBySlug(userId, slug);
  if (!tenant) return { error: "Instituição não encontrada." };
  const wanted = new Set(form.getAll("features").map(String));
  await withContext(asMaster(userId), async (c) => {
    const current = (await c.query<{ key: string; enabled: boolean }>(
      `select f.key, coalesce(tf.enabled, false) as enabled from features f
       left join tenant_features tf on tf.feature_key = f.key and tf.tenant_id = $1
       where f.kind = 'optional'`,
      [tenant.id],
    )).rows;
    for (const f of current) {
      if (f.enabled !== wanted.has(f.key)) await setFeature(c, { tenantId: tenant.id, key: f.key, enabled: wanted.has(f.key), actorId: userId });
    }
  });
  revalidatePath(`/master/${slug}`);
  return { ok: "Recursos atualizados." };
}

async function createMonthInvoice(userId: string, tenant: { id: string; plan_id: string }): Promise<"created" | "exists"> {
  // Uso medido no contexto da instituição (o modo master enxergaria todas).
  const usage = await withContext({ tenantId: tenant.id }, (c) => courseUsage(c));
  return withContext(asMaster(userId), async (c) => {
    const exists = await c.query(
      `select 1 from platform_invoices where tenant_id = $1 and period_start = date_trunc('month', now())::date and status <> 'canceled'`,
      [tenant.id],
    );
    if (exists.rowCount) return "exists" as const;
    const plan = (await c.query("select * from plans where id = $1", [tenant.plan_id])).rows[0];
    const { totalCents } = estimateBilling(plan, usage);
    await c.query(
      `insert into platform_invoices (tenant_id, period_start, period_end, courses, students, amount_cents, due_date)
       values ($1, date_trunc('month', now())::date, (date_trunc('month', now()) + interval '1 month - 1 day')::date,
               $2, $3, $4, (date_trunc('month', now()) + interval '1 month + 9 days')::date)`,
      [tenant.id, usage.length, usage.reduce((s, u) => s + u.activeStudents, 0), totalCents],
    );
    await audit(c, { tenantId: tenant.id, actorUserId: userId, action: "invoice_created", entity: "platform_invoice", data: { totalCents } });
    return "created" as const;
  });
}

export async function generateInvoiceAction(slug: string, _: ActionState): Promise<ActionState> {
  const { userId } = await requireMaster();
  const tenant = await tenantBySlug(userId, slug);
  if (!tenant) return { error: "Instituição não encontrada." };
  const result = await createMonthInvoice(userId, tenant);
  revalidatePath(`/master/${slug}`);
  revalidatePath("/master/cobrancas");
  return result === "exists" ? { error: "A cobrança deste mês já foi gerada." } : { ok: "Cobrança do mês gerada." };
}

/** Gera a cobrança do mês para toda instituição ativa que ainda não tem. */
export async function generateAllInvoicesAction(_: ActionState): Promise<ActionState> {
  const { userId } = await requireMaster();
  const tenants = await withContext(asMaster(userId), async (c) =>
    (await c.query<{ id: string; plan_id: string }>("select id, plan_id from tenants where status = 'active' and plan_id is not null")).rows,
  );
  let created = 0;
  for (const t of tenants) if ((await createMonthInvoice(userId, t)) === "created") created += 1;
  revalidatePath("/master", "layout");
  revalidatePath("/master/cobrancas");
  return { ok: created === 0 ? "Todas as instituições já têm a cobrança deste mês." : created === 1 ? "1 cobrança gerada." : `${created} cobranças geradas.` };
}

export async function markInvoicePaidAction(slug: string, invoiceId: string, _: ActionState): Promise<ActionState> {
  const { userId } = await requireMaster();
  const tenant = await tenantBySlug(userId, slug);
  if (!tenant) return { error: "Instituição não encontrada." };
  await withContext(asMaster(userId), async (c) => {
    await c.query(`update platform_invoices set status = 'paid', paid_at = now() where id = $1 and tenant_id = $2`, [invoiceId, tenant.id]);
    await audit(c, { tenantId: tenant.id, actorUserId: userId, action: "invoice_paid", entity: "platform_invoice", entityId: invoiceId });
  });
  revalidatePath(`/master/${slug}`);
  revalidatePath("/master/cobrancas");
  revalidatePath("/master", "layout");
  return { ok: "Pagamento registrado." };
}

export async function resendAdminInviteAction(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { userId } = await requireMaster();
  const tenant = await tenantBySlug(userId, slug);
  if (!tenant) return { error: "Instituição não encontrada." };
  const email = z.string().trim().email().safeParse(form.get("email"));
  if (!email.success) return { error: "Informe um e-mail válido." };
  const { token } = await withContext({ master: true, userId, tenantId: tenant.id }, (c) =>
    createInvite(c, { tenantId: tenant.id, email: email.data, role: "admin", createdBy: userId }),
  );
  const sent = await sendInviteEmail({ tenantSlug: slug, tenantName: tenant.name, email: email.data, role: "admin", token });
  revalidatePath("/master", "layout");
  return sent.delivered ? { ok: `Convite enviado para ${email.data}.` } : { ok: `E-mail não enviado (sem Resend configurado). Link: ${sent.url}` };
}

/** Liga ou desliga um recurso opcional de uma instituição (usado pela matriz de planos e recursos). */
export async function toggleFeatureAction(slug: string, key: string, enabled: boolean): Promise<{ ok: boolean }> {
  const { userId } = await requireMaster();
  const tenant = await tenantBySlug(userId, slug);
  if (!tenant) return { ok: false };
  const done = await withContext(asMaster(userId), async (c) => {
    const f = (await c.query("select 1 from features where key = $1 and kind = 'optional'", [key])).rowCount;
    if (!f) return false;
    await setFeature(c, { tenantId: tenant.id, key, enabled, actorId: userId });
    return true;
  });
  revalidatePath("/master/planos");
  revalidatePath(`/master/${slug}`);
  return { ok: done };
}

const planSchema = z.object({
  price: z.coerce.number().min(0, "Valor por curso inválido."),
  included: z.coerce.number().int("Informe um número inteiro de alunos.").min(0),
  extra: z.coerce.number().min(0, "Valor por aluno extra inválido."),
});

export async function updatePlanAction(planId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { userId } = await requireMaster();
  const parsed = planSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { price, included, extra } = parsed.data;
  const updated = await withContext(asMaster(userId), async (c) => {
    const r = await c.query(
      "update plans set price_per_course_cents = $2, included_students = $3, extra_student_cents = $4 where id = $1",
      [planId, Math.round(price * 100), included, Math.round(extra * 100)],
    );
    if (r.rowCount) {
      await audit(c, { tenantId: null, actorUserId: userId, action: "plan_updated", entity: "plan", entityId: planId, data: { price, included, extra } });
    }
    return r.rowCount;
  });
  if (!updated) return { error: "Plano não encontrado." };
  revalidatePath("/master/planos");
  return { ok: "Valores do plano atualizados. Valem para as próximas cobranças." };
}
