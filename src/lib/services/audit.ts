import type { PoolClient } from "pg";

export async function audit(
  c: PoolClient,
  entry: { tenantId: string | null; actorUserId: string | null; action: string; entity: string; entityId?: string; data?: object },
) {
  await c.query(
    `insert into audit_log (tenant_id, actor_user_id, action, entity, entity_id, data)
     values ($1, $2, $3, $4, $5, $6)`,
    [entry.tenantId, entry.actorUserId, entry.action, entry.entity, entry.entityId ?? null, entry.data ?? {}],
  );
}
