import type { PoolClient } from "pg";
import { audit } from "./audit";
import { createInvite } from "./invites";

export const SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$/;
const RESERVED_SLUGS = new Set(["www", "app", "master", "api", "admin", "login", "static", "nova", "instituicoes", "cobrancas", "planos","escolher", "cadastro", "arquivos"]);

export function validateSlug(slug: string): string | null {
  if (!SLUG_PATTERN.test(slug)) return "Use de 3 a 40 letras minúsculas, números ou hífen, sem hífen no começo ou no fim.";
  if (RESERVED_SLUGS.has(slug)) return "Este endereço é reservado pela plataforma.";
  return null;
}

/**
 * Cadastra uma instituição (contexto master): assinatura no plano, rótulos
 * padrão, opcionais desligados e convite para o administrador.
 */
export async function createTenant(
  c: PoolClient,
  input: { name: string; slug: string; planId: string; adminEmail: string; adminName?: string; actorId: string },
) {
  const { rows } = await c.query<{ id: string }>(
    `insert into tenants (slug, name, plan_id) values ($1, $2, $3) returning id`,
    [input.slug, input.name, input.planId],
  );
  const tenantId = rows[0].id;
  await c.query(`insert into subscriptions (tenant_id, plan_id) values ($1, $2)`, [tenantId, input.planId]);
  await c.query(
    `insert into tenant_labels (tenant_id, label_key, singular, plural) values
       ($1, 'program', 'Pós-graduação', 'Pós-graduações'),
       ($1, 'cohort', 'Turma', 'Turmas'),
       ($1, 'module', 'Módulo', 'Módulos'),
       ($1, 'lesson', 'Aula', 'Aulas')`,
    [tenantId],
  );
  await c.query(
    `insert into tenant_features (tenant_id, feature_key, enabled) select $1, key, false from features where kind = 'optional'`,
    [tenantId],
  );
  await c.query(`select app.seed_document_types($1)`, [tenantId]);
  const invite = await createInvite(c, {
    tenantId,
    email: input.adminEmail,
    name: input.adminName ?? null,
    role: "admin",
    createdBy: input.actorId,
  });
  await audit(c, { tenantId, actorUserId: input.actorId, action: "tenant_created", entity: "tenant", entityId: tenantId, data: { slug: input.slug } });
  return { tenantId, inviteToken: invite.token };
}

export async function setTenantStatus(
  c: PoolClient,
  input: { tenantId: string; status: "active" | "suspended" | "deleted"; reason?: string; actorId: string },
) {
  await c.query(
    `update tenants set status = $2,
       suspended_at = case when $2 = 'suspended' then now() else null end,
       suspended_reason = case when $2 = 'suspended' then $3 else null end,
       updated_at = now()
     where id = $1`,
    [input.tenantId, input.status, input.reason ?? null],
  );
  const action = { active: "tenant_reactivated", suspended: "tenant_suspended", deleted: "tenant_deleted" }[input.status];
  await audit(c, { tenantId: input.tenantId, actorUserId: input.actorId, action, entity: "tenant", entityId: input.tenantId, data: { reason: input.reason ?? null } });
}

export async function setFeature(c: PoolClient, input: { tenantId: string; key: string; enabled: boolean; actorId: string }) {
  await c.query(
    `insert into tenant_features (tenant_id, feature_key, enabled, updated_at) values ($1, $2, $3, now())
     on conflict (tenant_id, feature_key) do update set enabled = excluded.enabled, updated_at = now()`,
    [input.tenantId, input.key, input.enabled],
  );
  await audit(c, { tenantId: input.tenantId, actorUserId: input.actorId, action: input.enabled ? "feature_on" : "feature_off", entity: "feature", entityId: input.key });
}
