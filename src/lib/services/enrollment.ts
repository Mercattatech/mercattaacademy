import type { PoolClient } from "pg";
import { createInvite } from "./invites";

export type EnrollResult =
  | { kind: "enrolled"; email: string; name: string; alreadyEnrolled: boolean }
  | { kind: "invited"; email: string; name: string; token: string };

/**
 * Matricula um aluno numa turma.
 * Já tem conta na plataforma: vincula e matricula na hora.
 * Não tem: cria convite de aluno com a turma; a matrícula acontece ao aceitar.
 */
export async function enrollStudent(
  c: PoolClient,
  input: { tenantId: string; cohortId: string; name: string; email: string; source: "manual" | "csv"; actorId: string | null },
): Promise<EnrollResult> {
  const email = input.email.trim().toLowerCase();
  const user = (await c.query<{ id: string }>(`select id from "user" where lower(email) = $1`, [email])).rows[0];

  if (user) {
    await c.query(
      `insert into memberships (tenant_id, user_id, role) values ($1, $2, 'aluno') on conflict do nothing`,
      [input.tenantId, user.id],
    );
    const result = await c.query<{ inserted: boolean }>(
      `insert into enrollments (tenant_id, cohort_id, user_id, source) values ($1, $2, $3, $4)
       on conflict (cohort_id, user_id) do update set status = 'active'
       returning (xmax = 0) as inserted`,
      [input.tenantId, input.cohortId, user.id, input.source],
    );
    return { kind: "enrolled", email, name: input.name, alreadyEnrolled: !result.rows[0].inserted };
  }

  const { token } = await createInvite(c, {
    tenantId: input.tenantId,
    email,
    name: input.name,
    role: "aluno",
    cohortId: input.cohortId,
    source: input.source,
    createdBy: input.actorId,
  });
  return { kind: "invited", email, name: input.name, token };
}
