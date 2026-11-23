import { createHash, randomBytes } from "node:crypto";
import type { Pool, PoolClient } from "pg";

export const ROLES = ["admin", "coordenacao", "professor", "secretaria", "financeiro", "aluno", "tutor"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrador",
  coordenacao: "Coordenação",
  professor: "Professor",
  secretaria: "Secretaria",
  financeiro: "Financeiro",
  aluno: "Aluno",
  tutor: "Tutor",
};

const INVITE_DAYS = 7;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export type InviteInput = {
  tenantId: string;
  email: string;
  name?: string | null;
  role: Role;
  cohortId?: string | null;
  source?: "manual" | "csv" | "vitrine";
  createdBy: string | null;
};

/**
 * Cria o convite (ou renova o que já estava em aberto para o mesmo e-mail, perfil e turma).
 * Devolve o token em claro uma única vez, para montar o link do e-mail.
 */
export async function createInvite(c: PoolClient, input: InviteInput): Promise<{ id: string; token: string }> {
  const { token, hash } = newToken();
  const email = input.email.trim().toLowerCase();
  const { rows } = await c.query<{ id: string }>(
    `insert into invites (tenant_id, email, name, role, cohort_id, source, token_hash, expires_at, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, now() + make_interval(days => $8), $9)
     on conflict (tenant_id, lower(email), role, coalesce(cohort_id, '00000000-0000-0000-0000-000000000000'::uuid))
       where accepted_at is null and revoked_at is null
     do update set token_hash = excluded.token_hash, expires_at = excluded.expires_at,
                   name = coalesce(excluded.name, invites.name)
     returning id`,
    [input.tenantId, email, input.name ?? null, input.role, input.cohortId ?? null, input.source ?? "manual", hash, INVITE_DAYS, input.createdBy],
  );
  return { id: rows[0].id, token };
}

export type InviteInfo = {
  id: string;
  tenant_id: string;
  tenant_slug: string;
  tenant_name: string;
  email: string;
  name: string | null;
  role: Role;
  cohort_id: string | null;
  expires_at: Date;
  accepted_at: Date | null;
  revoked_at: Date | null;
};

export type InviteState = "valid" | "expired" | "used" | "revoked" | "missing";

/** Busca pelo token sem contexto de instituição (função segura no banco). */
export async function lookupInvite(pool: Pool, token: string): Promise<{ state: InviteState; invite?: InviteInfo }> {
  const { rows } = await pool.query<InviteInfo>("select * from app.invite_lookup($1)", [hashToken(token)]);
  const invite = rows[0];
  if (!invite) return { state: "missing" };
  if (invite.revoked_at) return { state: "revoked", invite };
  if (invite.accepted_at) return { state: "used", invite };
  if (invite.expires_at.getTime() < Date.now()) return { state: "expired", invite };
  return { state: "valid", invite };
}

/**
 * Aceita o convite: cria o vínculo com o perfil e, se for de aluno, a matrícula na turma.
 * Precisa rodar com o contexto da instituição do convite.
 */
export async function acceptInvite(c: PoolClient, invite: InviteInfo, userId: string) {
  await c.query(
    `insert into memberships (tenant_id, user_id, role) values ($1, $2, $3) on conflict do nothing`,
    [invite.tenant_id, userId, invite.role],
  );
  if (invite.cohort_id) {
    const source = (await c.query<{ source: string }>("select source from invites where id = $1", [invite.id])).rows[0]?.source ?? "manual";
    await c.query(
      `insert into enrollments (tenant_id, cohort_id, user_id, source) values ($1, $2, $3, $4)
       on conflict (cohort_id, user_id) do update set status = 'active'`,
      [invite.tenant_id, invite.cohort_id, userId, source],
    );
  }
  const updated = await c.query(
    `update invites set accepted_at = now() where id = $1 and accepted_at is null and revoked_at is null`,
    [invite.id],
  );
  if (updated.rowCount !== 1) throw new Error("Convite já usado ou cancelado.");
}
