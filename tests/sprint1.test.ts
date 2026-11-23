import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { pool, withContext } from "@/lib/db";
import { addModule, courseUsage, createCohortFromProgram, deleteModule, moveModule } from "@/lib/services/academic";
import { estimateBilling, formatBRL } from "@/lib/services/billing";
import { parseStudentsCsv } from "@/lib/services/csv";
import { enrollStudent } from "@/lib/services/enrollment";
import { acceptInvite, createInvite, lookupInvite } from "@/lib/services/invites";
import { createTenant, setFeature, setTenantStatus, validateSlug } from "@/lib/services/tenants";

let planId: string;
let alpha: string;
let beta: string;
let alphaAdminToken: string;

beforeAll(async () => {
  const owner = new Client({ connectionString: process.env.DATABASE_OWNER_URL });
  await owner.connect();
  await owner.query("begin");
  await owner.query("select set_config('app.is_master', 'on', true)");
  await owner.query(`insert into "user" (id, name, email, "emailVerified") values
    ('m1', 'Master', 'master@s1.test', true),
    ('ana', 'Ana Existente', 'ana@s1.test', true)`);
  await owner.query("commit");
  await owner.end();

  planId = (await pool.query("select id from plans limit 1")).rows[0].id;
  const created = await withContext({ master: true, userId: "m1" }, async (c) => ({
    a: await createTenant(c, { name: "Alpha", slug: "alpha", planId, adminEmail: "Admin@Alpha.test", actorId: "m1" }),
    b: await createTenant(c, { name: "Beta", slug: "beta", planId, adminEmail: "admin@beta.test", actorId: "m1" }),
  }));
  alpha = created.a.tenantId;
  beta = created.b.tenantId;
  alphaAdminToken = created.a.inviteToken;
});

afterAll(async () => {
  await pool.end();
});

describe("cadastro de instituição (master)", () => {
  it("nasce com assinatura, rótulos, opcionais desligados e convite do admin", async () => {
    const state = await withContext({ tenantId: alpha }, async (c) => ({
      sub: (await c.query("select status from subscriptions")).rows[0].status,
      labels: (await c.query("select count(*)::int as n from tenant_labels")).rows[0].n,
      optionalOn: (await c.query("select count(*)::int as n from tenant_features where enabled")).rows[0].n,
      optionalRows: (await c.query("select count(*)::int as n from tenant_features")).rows[0].n,
      invite: (await c.query("select email, role from invites")).rows[0],
      audit: (await c.query("select action from audit_log")).rows.map((r) => r.action),
    }));
    expect(state).toMatchObject({ sub: "active", labels: 4, optionalOn: 0, invite: { email: "admin@alpha.test", role: "admin" } });
    expect(state.optionalRows).toBeGreaterThan(0);
    expect(state.audit).toContain("tenant_created");
  });

  it("valida o endereço (slug)", () => {
    expect(validateSlug("bressane")).toBeNull();
    expect(validateSlug("Bressane")).not.toBeNull();
    expect(validateSlug("-abc")).not.toBeNull();
    expect(validateSlug("admin")).toMatch(/reservado/);
  });

  it("suspende, reativa e registra na auditoria", async () => {
    await withContext({ master: true, userId: "m1" }, (c) => setTenantStatus(c, { tenantId: beta, status: "suspended", reason: "Atraso", actorId: "m1" }));
    const { rows } = await pool.query("select status from app.resolve_tenant('beta')");
    expect(rows[0].status).toBe("suspended");
    await withContext({ master: true, userId: "m1" }, (c) => setTenantStatus(c, { tenantId: beta, status: "active", actorId: "m1" }));
    const actions = await withContext({ tenantId: beta }, async (c) => (await c.query("select action from audit_log order by id")).rows.map((r) => r.action));
    expect(actions).toEqual(expect.arrayContaining(["tenant_suspended", "tenant_reactivated"]));
  });

  it("master liga recurso opcional", async () => {
    await withContext({ master: true, userId: "m1" }, (c) => setFeature(c, { tenantId: beta, key: "forum", enabled: true, actorId: "m1" }));
    const on = await withContext({ tenantId: beta }, async (c) => (await c.query("select app.feature_enabled('forum') as on")).rows[0].on);
    expect(on).toBe(true);
  });
});

describe("convites", () => {
  it("o token não fica salvo em claro e o convite é encontrado pelo token", async () => {
    const stored = await withContext({ tenantId: alpha }, async (c) => (await c.query("select token_hash from invites")).rows[0].token_hash);
    expect(stored).not.toBe(alphaAdminToken);
    const found = await lookupInvite(pool, alphaAdminToken);
    expect(found.state).toBe("valid");
    expect(found.invite).toMatchObject({ tenant_slug: "alpha", role: "admin" });
    expect((await lookupInvite(pool, "token-falso")).state).toBe("missing");
  });

  it("aceite cria o vínculo e o convite não pode ser usado de novo", async () => {
    const { invite } = await lookupInvite(pool, alphaAdminToken);
    await withContext({ tenantId: alpha, userId: "ana" }, (c) => acceptInvite(c, invite!, "ana"));
    const roles = await withContext({ tenantId: alpha }, async (c) =>
      (await c.query("select role from memberships where user_id = 'ana'")).rows.map((r) => r.role),
    );
    expect(roles).toEqual(["admin"]);
    expect((await lookupInvite(pool, alphaAdminToken)).state).toBe("used");
  });

  it("convite vencido é recusado", async () => {
    const token = await withContext({ tenantId: alpha }, async (c) => {
      const { token, id } = await createInvite(c, { tenantId: alpha, email: "velho@s1.test", role: "professor", createdBy: null });
      await c.query("update invites set expires_at = now() - interval '1 day' where id = $1", [id]);
      return token;
    });
    expect((await lookupInvite(pool, token)).state).toBe("expired");
  });

  it("reenviar convite em aberto renova o token em vez de duplicar", async () => {
    const tokens = await withContext({ tenantId: alpha }, async (c) => [
      (await createInvite(c, { tenantId: alpha, email: "prof@s1.test", role: "professor", createdBy: null })).token,
      (await createInvite(c, { tenantId: alpha, email: "PROF@s1.test", role: "professor", createdBy: null })).token,
    ]);
    const count = await withContext({ tenantId: alpha }, async (c) =>
      (await c.query("select count(*)::int as n from invites where email = 'prof@s1.test'")).rows[0].n,
    );
    expect(count).toBe(1);
    expect((await lookupInvite(pool, tokens[0])).state).toBe("missing");
    expect((await lookupInvite(pool, tokens[1])).state).toBe("valid");
  });
});

describe("cursos, grade e turmas", () => {
  let programId: string;
  let modules: string[];

  beforeAll(async () => {
    programId = await withContext({ tenantId: alpha }, async (c) => {
      const id = (await c.query("insert into programs (tenant_id, name, status) values ($1, 'Estética', 'published') returning id", [alpha])).rows[0].id;
      modules = [];
      for (const name of ["Semiologia", "Anatomia", "Fisiologia"]) modules.push(await addModule(c, { tenantId: alpha, programId: id, name }));
      return id;
    });
  });

  const grade = () =>
    withContext({ tenantId: alpha }, async (c) =>
      (await c.query("select name from program_modules where program_id = $1 order by position", [programId])).rows.map((r) => r.name),
    );

  it("reordena e exclui renumerando", async () => {
    await withContext({ tenantId: alpha }, (c) => moveModule(c, modules[2], "up"));
    expect(await grade()).toEqual(["Semiologia", "Fisiologia", "Anatomia"]);
    expect(await withContext({ tenantId: alpha }, (c) => moveModule(c, modules[0], "up"))).toBe(false);
    await withContext({ tenantId: alpha }, (c) => deleteModule(c, modules[0]));
    expect(await grade()).toEqual(["Fisiologia", "Anatomia"]);
    const positions = await withContext({ tenantId: alpha }, async (c) =>
      (await c.query("select position from program_modules where program_id = $1 order by position", [programId])).rows.map((r) => r.position),
    );
    expect(positions).toEqual([1, 2]);
  });

  it("turma copia a grade e não muda quando a grade muda depois", async () => {
    const cohortId = await withContext({ tenantId: alpha }, (c) =>
      createCohortFromProgram(c, { tenantId: alpha, programId, name: "Turma 2027-A", startsOn: "2027-02-01", endsOn: "2027-12-15" }),
    );
    await withContext({ tenantId: alpha }, (c) => addModule(c, { tenantId: alpha, programId, name: "Cosmetologia" }));
    const copied = await withContext({ tenantId: alpha }, async (c) =>
      (await c.query("select name, position from cohort_modules where cohort_id = $1 order by position", [cohortId])).rows,
    );
    expect(copied).toEqual([{ name: "Fisiologia", position: 1 }, { name: "Anatomia", position: 2 }]);
  });

  it("outra instituição não usa o curso da Alpha nem por id", async () => {
    await expect(
      withContext({ tenantId: beta }, (c) =>
        c.query("insert into cohorts (tenant_id, program_id, name) values ($1, $2, 'Invasão')", [beta, programId]),
      ),
    ).rejects.toThrow(/foreign key/);
    const seen = await withContext({ tenantId: beta }, async (c) => (await c.query("select * from programs")).rowCount);
    expect(seen).toBe(0);
  });

  it("matrícula: conta existente entra na hora, nova recebe convite e entra ao aceitar", async () => {
    const cohortId = await withContext({ tenantId: alpha }, async (c) =>
      (await c.query("select id from cohorts where name = 'Turma 2027-A'")).rows[0].id,
    );
    const results = await withContext({ tenantId: alpha, userId: "ana" }, async (c) => [
      await enrollStudent(c, { tenantId: alpha, cohortId, name: "Ana", email: "ANA@s1.test", source: "manual", actorId: "ana" }),
      await enrollStudent(c, { tenantId: alpha, cohortId, name: "Bia Nova", email: "bia@s1.test", source: "csv", actorId: "ana" }),
      await enrollStudent(c, { tenantId: alpha, cohortId, name: "Ana", email: "ana@s1.test", source: "manual", actorId: "ana" }),
    ]);
    expect(results[0]).toMatchObject({ kind: "enrolled", alreadyEnrolled: false });
    expect(results[1].kind).toBe("invited");
    expect(results[2]).toMatchObject({ kind: "enrolled", alreadyEnrolled: true });

    const owner = new Client({ connectionString: process.env.DATABASE_OWNER_URL });
    await owner.connect();
    await owner.query(`insert into "user" (id, name, email, "emailVerified") values ('bia', 'Bia Nova', 'bia@s1.test', false)`);
    await owner.end();
    const { invite } = await lookupInvite(pool, (results[1] as { token: string }).token);
    await withContext({ tenantId: alpha, userId: "bia" }, (c) => acceptInvite(c, invite!, "bia"));

    const enrolled = await withContext({ tenantId: alpha }, async (c) =>
      (await c.query("select user_id, source from enrollments where cohort_id = $1 order by user_id", [cohortId])).rows,
    );
    expect(enrolled).toEqual([{ user_id: "ana", source: "manual" }, { user_id: "bia", source: "csv" }]);

    const usage = await withContext({ tenantId: alpha }, (c) => courseUsage(c));
    expect(usage).toEqual([{ programId, name: "Estética", activeStudents: 2 }]);
  });
});

describe("planilha de alunos", () => {
  it("lê ponto e vírgula com cabeçalho e aponta linhas ruins", () => {
    const csv = "﻿Nome;E-mail\nMaria Souza;maria@x.com\nJoão;joao@x\n;semnome@x.com\nMaria S.;MARIA@x.com\n\"Silva, Ana\";ana@x.com\n";
    const { rows, issues } = parseStudentsCsv(csv);
    expect(rows).toEqual([
      { line: 2, name: "Maria Souza", email: "maria@x.com" },
      { line: 6, name: "Silva, Ana", email: "ana@x.com" },
    ]);
    expect(issues.map((i) => i.line)).toEqual([3, 4, 5]);
    expect(issues[2].message).toMatch(/repetido/);
  });

  it("lê vírgula sem cabeçalho, com e-mail na primeira coluna", () => {
    const { rows, issues } = parseStudentsCsv("pedro@x.com,Pedro Lima\r\nlu@x.com,Lu Alves");
    expect(issues).toEqual([]);
    expect(rows.map((r) => r.name)).toEqual(["Pedro Lima", "Lu Alves"]);
  });
});

describe("estimativa de cobrança", () => {
  it("R$ 300 por curso até 100 alunos, R$ 3 por aluno excedente", () => {
    const plan = { price_per_course_cents: 30000, included_students: 100, extra_student_cents: 300 };
    const { lines, totalCents } = estimateBilling(plan, [
      { programId: "1", name: "Estética", activeStudents: 130 },
      { programId: "2", name: "Nutrição", activeStudents: 40 },
    ]);
    expect(lines.map((l) => l.amountCents)).toEqual([39000, 30000]);
    expect(lines[0].extraStudents).toBe(30);
    expect(totalCents).toBe(69000);
    expect(formatBRL(totalCents)).toMatch(/690,00/);
  });
});
