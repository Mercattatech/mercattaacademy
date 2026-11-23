import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { pool, withContext } from "@/lib/db";
import { createCohortFromProgram } from "@/lib/services/academic";
import { advanceStage, missingDocuments, recordDocument, rejectDocument, startEnrollment } from "@/lib/services/documents";
import { getShowcaseProgram, listShowcase } from "@/lib/services/showcase";
import { createTenant } from "@/lib/services/tenants";
import { sniffFile } from "@/lib/storage";

let alpha: string;
let beta: string;
let programId: string;
let openCohort: string;
let closedCohort: string;
let futureCohort: string;

const ctx = (tenantId: string, userId?: string) => ({ tenantId, userId });

beforeAll(async () => {
  const owner = new Client({ connectionString: process.env.DATABASE_OWNER_URL });
  await owner.connect();
  await owner.query("begin");
  await owner.query("select set_config('app.is_master', 'on', true)");
  await owner.query(`insert into "user" (id, name, email, "emailVerified") values
    ('m2', 'Master', 'master@s2.test', true),
    ('sec', 'Sônia Secretaria', 'sec@s2.test', true),
    ('stu', 'Bruno Aluno', 'bruno@s2.test', true),
    ('stu2', 'Carla Aluna', 'carla@s2.test', true)`);
  await owner.query("commit");
  await owner.end();

  const planId = (await pool.query("select id from plans limit 1")).rows[0].id;
  const created = await withContext({ master: true, userId: "m2" }, async (c) => ({
    a: await createTenant(c, { name: "Alpha 2", slug: "alpha2", planId, adminEmail: "admin@alpha2.test", actorId: "m2" }),
    b: await createTenant(c, { name: "Beta 2", slug: "beta2", planId, adminEmail: "admin@beta2.test", actorId: "m2" }),
  }));
  alpha = created.a.tenantId;
  beta = created.b.tenantId;

  await withContext(ctx(alpha), async (c) => {
    programId = (await c.query(
      `insert into programs (tenant_id, name, summary, status, price_cents, workload_hours) values ($1, 'Semiologia', 'Resumo', 'published', 150000, 360) returning id`,
      [alpha],
    )).rows[0].id;
    await c.query(`insert into program_modules (tenant_id, program_id, position, name) values ($1, $2, 1, 'Módulo 1')`, [alpha, programId]);
    await c.query(`insert into programs (tenant_id, name, status) values ($1, 'Rascunho', 'draft')`, [alpha]);
    openCohort = await createCohortFromProgram(c, { tenantId: alpha, programId, name: "Turma aberta", startsOn: null, endsOn: null });
    closedCohort = await createCohortFromProgram(c, { tenantId: alpha, programId, name: "Turma fechada", startsOn: null, endsOn: null });
    futureCohort = await createCohortFromProgram(c, { tenantId: alpha, programId, name: "Turma futura", startsOn: null, endsOn: null });
    await c.query(`update cohorts set status = 'open' where id = $1`, [openCohort]);
    await c.query(`update cohorts set status = 'open', enrollment_closes_on = current_date - 1 where id = $1`, [closedCohort]);
    await c.query(`update cohorts set status = 'open', enrollment_opens_on = current_date + 5 where id = $1`, [futureCohort]);
    await c.query(`insert into memberships (tenant_id, user_id, role) values ($1, 'sec', 'secretaria')`, [alpha]);
  });
});

afterAll(async () => {
  await pool.end();
});

describe("vitrine", () => {
  it("mostra só curso publicado, com valor e turmas dentro do período", async () => {
    const list = await listShowcase(alpha);
    expect(list.map((p) => p.name)).toEqual(["Semiologia"]);
    expect(list[0].price_cents).toBe(150000);
    expect(list[0].open_cohorts).toBe(1);
    const detail = await getShowcaseProgram(alpha, programId);
    expect(detail?.cohorts.map((c) => c.name)).toEqual(["Turma aberta"]);
    expect(detail?.modules).toHaveLength(1);
  });

  it("não mostra curso de outra instituição nem aceita id inválido", async () => {
    expect(await listShowcase(beta)).toEqual([]);
    expect(await getShowcaseProgram(beta, programId)).toBeNull();
    expect(await getShowcaseProgram(alpha, "nao-e-uuid")).toBeNull();
  });
});

describe("inscrição", () => {
  it("nasce em Documentos, com aluno vinculado, e repetir não duplica", async () => {
    const first = await withContext(ctx(alpha, "stu"), (c) => startEnrollment(c, { tenantId: alpha, cohortId: openCohort, userId: "stu" }));
    expect(first).toMatchObject({ ok: true, created: true });
    const again = await withContext(ctx(alpha, "stu"), (c) => startEnrollment(c, { tenantId: alpha, cohortId: openCohort, userId: "stu" }));
    expect(again).toMatchObject({ ok: true, created: false });
    const rows = await withContext(ctx(alpha), async (c) => ({
      e: (await c.query("select stage, source from enrollments where user_id = 'stu'")).rows,
      role: (await c.query("select role from memberships where user_id = 'stu'")).rows,
    }));
    expect(rows.e).toEqual([{ stage: "documents", source: "vitrine" }]);
    expect(rows.role).toEqual([{ role: "aluno" }]);
  });

  it("recusa turma fechada, futura e inexistente", async () => {
    for (const cohortId of [closedCohort, futureCohort]) {
      const r = await withContext(ctx(alpha, "stu2"), (c) => startEnrollment(c, { tenantId: alpha, cohortId, userId: "stu2" }));
      expect(r).toEqual({ ok: false, error: "closed" });
    }
    const missing = await withContext(ctx(alpha, "stu2"), (c) =>
      startEnrollment(c, { tenantId: alpha, cohortId: "00000000-0000-0000-0000-000000000000", userId: "stu2" }),
    );
    expect(missing).toEqual({ ok: false, error: "not_found" });
  });

  it("não inscreve em turma de outra instituição", async () => {
    const r = await withContext(ctx(beta, "stu2"), (c) => startEnrollment(c, { tenantId: beta, cohortId: openCohort, userId: "stu2" }));
    expect(r).toEqual({ ok: false, error: "not_found" });
  });
});

describe("documentos", () => {
  let enrollmentId: string;
  const typeIds: string[] = [];

  beforeAll(async () => {
    await withContext(ctx(alpha, "stu"), async (c) => {
      enrollmentId = (await c.query("select id from enrollments where user_id = 'stu'")).rows[0].id;
      typeIds.push(...(await c.query("select id from document_types where required order by position")).rows.map((r) => r.id));
    });
  });

  it("instituição nova recebe a lista padrão de 5 documentos obrigatórios", async () => {
    const names = await withContext(ctx(alpha), async (c) => (await c.query("select name from document_types order by position")).rows.map((r) => r.name));
    expect(names).toEqual(["Diploma", "CNH", "RG", "Comprovante de endereço", "Histórico escolar"]);
  });

  it("pagamento só abre com todos os obrigatórios enviados, e a secretaria é avisada", async () => {
    for (const [i, typeId] of typeIds.entries()) {
      await withContext(ctx(alpha, "stu"), async (c) => {
        await recordDocument(c, { tenantId: alpha, enrollmentId, typeId, storageKey: `k/${i}`, fileName: `d${i}.pdf`, contentType: "application/pdf", size: 10 });
        await advanceStage(c, alpha, enrollmentId, "Bruno Aluno");
      });
      const stage = await withContext(ctx(alpha), async (c) => (await c.query("select stage from enrollments where id = $1", [enrollmentId])).rows[0].stage);
      expect(stage).toBe(i < typeIds.length - 1 ? "documents" : "payment");
    }
    const notices = await withContext(ctx(alpha, "sec"), async (c) => (await c.query("select kind from notifications where user_id = 'sec'")).rows);
    expect(notices).toEqual([{ kind: "documents_complete" }]);
  });

  it("recusa apaga o arquivo, volta a Pendente com motivo, reabre Documentos e avisa o aluno", async () => {
    const docId = await withContext(ctx(alpha), async (c) => (await c.query("select id from student_documents where storage_key = 'k/1'")).rows[0].id);
    const out = await withContext(ctx(alpha, "sec"), (c) => rejectDocument(c, { tenantId: alpha, documentId: docId, reason: "Foto cortada", actorId: "sec" }));
    expect(out).toMatchObject({ storageKey: "k/1", documentName: "CNH", studentEmail: "bruno@s2.test" });
    const state = await withContext(ctx(alpha), async (c) => ({
      doc: (await c.query("select status, storage_key, rejected_reason from student_documents where id = $1", [docId])).rows[0],
      stage: (await c.query("select stage from enrollments where id = $1", [enrollmentId])).rows[0].stage,
      missing: (await missingDocuments(c, enrollmentId)).map((m) => m.name),
      notice: (await c.query("select message from notifications where user_id = 'stu'")).rows[0].message,
      audit: (await c.query("select action from audit_log where action = 'document_rejected'")).rowCount,
    }));
    expect(state.doc).toEqual({ status: "pending", storage_key: null, rejected_reason: "Foto cortada" });
    expect(state.stage).toBe("documents");
    expect(state.missing).toEqual(["CNH"]);
    expect(state.notice).toContain("Foto cortada");
    expect(state.audit).toBe(1);
    // recusar de novo o mesmo documento não faz nada
    const twice = await withContext(ctx(alpha, "sec"), (c) => rejectDocument(c, { tenantId: alpha, documentId: docId, reason: "Outra vez", actorId: "sec" }));
    expect(twice).toBeNull();
  });

  it("novo envio limpa o motivo e volta a Pagamento", async () => {
    await withContext(ctx(alpha, "stu"), async (c) => {
      await recordDocument(c, { tenantId: alpha, enrollmentId, typeId: typeIds[1], storageKey: "k/new", fileName: "cnh.jpg", contentType: "image/jpeg", size: 10 });
      await advanceStage(c, alpha, enrollmentId, "Bruno Aluno");
    });
    const row = await withContext(ctx(alpha), async (c) => ({
      stage: (await c.query("select stage from enrollments where id = $1", [enrollmentId])).rows[0].stage,
      reason: (await c.query("select rejected_reason from student_documents where storage_key = 'k/new'")).rows[0].rejected_reason,
    }));
    expect(row).toEqual({ stage: "payment", reason: null });
  });

  it("documento opcional ou desativado não bloqueia o pagamento", async () => {
    await withContext(ctx(alpha, "stu2"), async (c) => {
      await startEnrollment(c, { tenantId: alpha, cohortId: openCohort, userId: "stu2" });
      await c.query("update document_types set required = false where name <> 'RG'");
    });
    await withContext(ctx(alpha, "stu2"), async (c) => {
      const id = (await c.query("select id from enrollments where user_id = 'stu2'")).rows[0].id;
      const rg = (await c.query("select id from document_types where name = 'RG'")).rows[0].id;
      await recordDocument(c, { tenantId: alpha, enrollmentId: id, typeId: rg, storageKey: "k/rg2", fileName: "rg.png", contentType: "image/png", size: 5 });
      await advanceStage(c, alpha, id, "Carla Aluna");
      expect((await c.query("select stage from enrollments where id = $1", [id])).rows[0].stage).toBe("payment");
    });
  });

  it("documentos e avisos são isolados por instituição", async () => {
    const other = await withContext(ctx(beta), async (c) => ({
      docs: (await c.query("select count(*)::int as n from student_documents")).rows[0].n,
      notices: (await c.query("select count(*)::int as n from notifications")).rows[0].n,
      types: (await c.query("select count(*)::int as n from document_types")).rows[0].n,
    }));
    expect(other).toEqual({ docs: 0, notices: 0, types: 5 });
    // sem contexto de instituição, nada aparece
    const none = await withContext({}, async (c) => (await c.query("select count(*)::int as n from student_documents")).rows[0].n);
    expect(none).toBe(0);
  });
});

describe("arquivos", () => {
  it("reconhece PDF, JPG e PNG pelo conteúdo e rejeita o resto", () => {
    expect(sniffFile(Buffer.from("%PDF-1.7 ..."))?.contentType).toBe("application/pdf");
    expect(sniffFile(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe("jpg");
    expect(sniffFile(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.ext).toBe("png");
    expect(sniffFile(Buffer.from("<script>alert(1)</script>"))).toBeNull();
    expect(sniffFile(Buffer.from("MZ executável"))).toBeNull();
  });
});
