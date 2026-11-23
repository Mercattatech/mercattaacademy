import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { pool, withContext } from "@/lib/db";

/**
 * Testes de isolamento entre instituições (Constituição, princípio 3).
 * O app conecta como pos_app; os dados de apoio são criados como dono.
 */

let tenantA: string;
let tenantB: string;

beforeAll(async () => {
  const owner = new Client({ connectionString: process.env.DATABASE_OWNER_URL });
  await owner.connect();
  await owner.query("begin");
  await owner.query("select set_config('app.is_master', 'on', true)");
  await owner.query(`insert into "user" (id, name, email, "emailVerified") values
    ('u-a', 'Ana', 'ana@a.test', true), ('u-b', 'Bruno', 'bruno@b.test', true)`);
  const plan = (await owner.query("select id from plans limit 1")).rows[0].id;
  tenantA = (await owner.query(
    "insert into tenants (slug, name, plan_id) values ('escola-a', 'Escola A', $1) returning id", [plan],
  )).rows[0].id;
  tenantB = (await owner.query(
    "insert into tenants (slug, name, plan_id, status) values ('escola-b', 'Escola B', $1, 'suspended') returning id", [plan],
  )).rows[0].id;
  await owner.query(`insert into memberships (tenant_id, user_id, role) values ($1, 'u-a', 'admin'), ($2, 'u-b', 'admin')`, [tenantA, tenantB]);
  await owner.query(`insert into tenant_features (tenant_id, feature_key, enabled) values ($1, 'pjbl', false), ($2, 'pjbl', true)`, [tenantA, tenantB]);
  await owner.query(`insert into tenant_labels (tenant_id, label_key, singular, plural) values ($1, 'module', 'Módulo', 'Módulos'), ($2, 'module', 'Disciplina', 'Disciplinas')`, [tenantA, tenantB]);
  await owner.query("commit");
  await owner.end();
});

afterAll(async () => {
  await pool.end();
});

describe("sem contexto de instituição", () => {
  it("não enxerga nenhuma instituição nem vínculo", async () => {
    const rows = await withContext({}, async (c) => ({
      tenants: (await c.query("select * from tenants")).rowCount,
      memberships: (await c.query("select * from memberships")).rowCount,
      features: (await c.query("select * from tenant_features")).rowCount,
    }));
    expect(rows).toEqual({ tenants: 0, memberships: 0, features: 0 });
  });

  it("resolve a instituição pelo subdomínio só com campos públicos", async () => {
    const { rows } = await pool.query("select * from app.resolve_tenant('ESCOLA-B')");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ slug: "escola-b", status: "suspended" });
    expect(Object.keys(rows[0]).sort()).toEqual(["brand", "id", "links", "name", "slug", "status"]);
  });

  it("não lê a lista de masters diretamente", async () => {
    await expect(pool.query("select * from platform_admins")).rejects.toThrow(/permission denied/);
  });
});

describe("dentro da instituição A", () => {
  it("vê só os próprios dados", async () => {
    const result = await withContext({ tenantId: tenantA, userId: "u-a" }, async (c) => ({
      tenants: (await c.query("select slug from tenants")).rows.map((r) => r.slug),
      members: (await c.query("select user_id from memberships")).rows.map((r) => r.user_id),
      labels: (await c.query("select singular from tenant_labels")).rows.map((r) => r.singular),
    }));
    expect(result).toEqual({ tenants: ["escola-a"], members: ["u-a"], labels: ["Módulo"] });
  });

  it("não consegue gravar dados na instituição B", async () => {
    await expect(
      withContext({ tenantId: tenantA, userId: "u-a" }, (c) =>
        c.query("insert into memberships (tenant_id, user_id, role) values ($1, 'u-a', 'aluno')", [tenantB]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("não consegue alterar dados da instituição B", async () => {
    const updated = await withContext({ tenantId: tenantA }, (c) =>
      c.query("update tenant_labels set singular = 'Invadido' where tenant_id = $1", [tenantB]),
    );
    expect(updated.rowCount).toBe(0);
  });

  it("não liga recursos sozinha: só o master liga", async () => {
    const updated = await withContext({ tenantId: tenantA }, (c) =>
      c.query("update tenant_features set enabled = true where feature_key = 'pjbl'"),
    );
    expect(updated.rowCount).toBe(0);
  });

  it("não altera o próprio status nem o plano, mas edita a própria marca", async () => {
    await expect(
      withContext({ tenantId: tenantA }, (c) => c.query("update tenants set status = 'suspended'")),
    ).rejects.toThrow(/Somente o master/);
    await expect(
      withContext({ tenantId: tenantA }, (c) => c.query("update tenants set plan_id = null")),
    ).rejects.toThrow(/Somente o master/);
    const branded = await withContext({ tenantId: tenantA }, (c) =>
      c.query(`update tenants set brand = '{"primary":"#123456"}'::jsonb`),
    );
    expect(branded.rowCount).toBe(1);
    const other = await withContext({ tenantId: tenantA }, (c) =>
      c.query(`update tenants set brand = '{}'::jsonb where id = $1`, [tenantB]),
    );
    expect(other.rowCount).toBe(0);
  });
});

describe("recursos ativáveis", () => {
  it("núcleo sempre ligado, opcional conforme a instituição", async () => {
    const check = (tenantId: string) =>
      withContext({ tenantId }, async (c) => {
        const { rows } = await c.query(
          "select app.feature_enabled('certificado') as core, app.feature_enabled('pjbl') as pjbl, app.feature_enabled('nao-existe') as unknown",
        );
        return rows[0];
      });
    expect(await check(tenantA)).toEqual({ core: true, pjbl: false, unknown: false });
    expect(await check(tenantB)).toEqual({ core: true, pjbl: true, unknown: false });
  });

  it("master liga um recurso e a instituição passa a ver ligado", async () => {
    await withContext({ master: true }, (c) =>
      c.query("update tenant_features set enabled = true where tenant_id = $1 and feature_key = 'pjbl'", [tenantA]),
    );
    const enabled = await withContext({ tenantId: tenantA }, async (c) =>
      (await c.query("select app.feature_enabled('pjbl') as on")).rows[0].on,
    );
    expect(enabled).toBe(true);
  });
});

describe("master", () => {
  it("vê todas as instituições", async () => {
    const slugs = await withContext({ master: true }, async (c) =>
      (await c.query("select slug from tenants where slug like 'escola-%' order by slug")).rows.map((r) => r.slug),
    );
    expect(slugs).toEqual(["escola-a", "escola-b"]);
  });

  it("identifica masters só pela função segura", async () => {
    const owner = new Client({ connectionString: process.env.DATABASE_OWNER_URL });
    await owner.connect();
    await owner.query("begin");
    await owner.query("select set_config('app.is_master', 'on', true)");
    await owner.query(`insert into "user" (id, name, email, "emailVerified") values ('u-m', 'Master', 'm@ssd.test', true)`);
    await owner.query("insert into platform_admins (user_id) values ('u-m')");
    await owner.query("commit");
    await owner.end();

    const { rows } = await pool.query(
      "select app.is_platform_admin('u-m') as master, app.is_platform_admin('u-a') as common",
    );
    expect(rows[0]).toEqual({ master: true, common: false });
  });

  it("a função de master não abre o RLS para o resto da transação", async () => {
    const visible = await withContext({}, async (c) => {
      await c.query("select app.is_platform_admin('u-m')");
      return (await c.query("select * from tenants")).rowCount;
    });
    expect(visible).toBe(0);
  });
});

describe("Constituição: toda tabela com tenant_id tem RLS forçado", () => {
  it("nenhuma tabela de instituição fica sem RLS", async () => {
    const owner = new Client({ connectionString: process.env.DATABASE_OWNER_URL });
    await owner.connect();
    const { rows } = await owner.query(`
      select c.relname, c.relrowsecurity, c.relforcerowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      where c.relkind = 'r'
        and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped)
      order by 1`);
    await owner.end();
    expect(rows.length).toBeGreaterThan(5);
    const unprotected = rows.filter((r) => !r.relrowsecurity || !r.relforcerowsecurity).map((r) => r.relname);
    expect(unprotected).toEqual([]);
  });
});
