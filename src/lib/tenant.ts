import { cache } from "react";
import { pool, withContext } from "./db";

export type PublicTenant = {
  id: string;
  slug: string;
  name: string;
  status: "active" | "suspended";
  brand: { primary?: string; logoUrl?: string };
  links: Record<string, string>;
};

export type Labels = Record<"program" | "cohort" | "module" | "lesson", { singular: string; plural: string }>;

const DEFAULT_LABELS: Labels = {
  program: { singular: "Pós-graduação", plural: "Pós-graduações" },
  cohort: { singular: "Turma", plural: "Turmas" },
  module: { singular: "Módulo", plural: "Módulos" },
  lesson: { singular: "Aula", plural: "Aulas" },
};

/** Busca a instituição pelo subdomínio, sem contexto (só campos públicos). */
export const resolveTenant = cache(async (slug: string): Promise<PublicTenant | null> => {
  const { rows } = await pool.query<PublicTenant>("select * from app.resolve_tenant($1)", [slug]);
  return rows[0] ?? null;
});

/** Rótulos acadêmicos da instituição, com os padrões para o que não foi personalizado. */
export const getLabels = cache(async (tenantId: string): Promise<Labels> => {
  const rows = await withContext({ tenantId }, async (c) =>
    (await c.query<{ label_key: keyof Labels; singular: string; plural: string }>(
      "select label_key, singular, plural from tenant_labels",
    )).rows,
  );
  const labels = structuredClone(DEFAULT_LABELS);
  for (const r of rows) labels[r.label_key] = { singular: r.singular, plural: r.plural };
  return labels;
});

/** Chaves dos recursos ligados (núcleo sempre; opcionais conforme a instituição). */
export const getEnabledFeatures = cache(async (tenantId: string): Promise<Set<string>> => {
  const rows = await withContext({ tenantId }, async (c) =>
    (await c.query<{ key: string }>(
      "select key from features where app.feature_enabled(key) order by sort_order",
    )).rows,
  );
  return new Set(rows.map((r) => r.key));
});

/** Papéis do usuário nesta instituição. */
export async function getRoles(tenantId: string, userId: string): Promise<string[]> {
  return withContext({ tenantId, userId }, async (c) =>
    (await c.query<{ role: string }>("select role from memberships where user_id = $1", [userId])).rows.map(
      (r) => r.role,
    ),
  );
}
