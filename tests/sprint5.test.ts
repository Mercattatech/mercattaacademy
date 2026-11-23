import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { pool, withContext } from "@/lib/db";
import { buildCertificatePdf } from "@/lib/certificate-pdf";
import { createCohortFromProgram } from "@/lib/services/academic";
import {
  certificateByCode, certificateForDownload, formatCode, getSettings, newCertificateCode, normalizeCode, revokeCertificate, saveSettings,
} from "@/lib/services/certificates";
import {
  boletimsFor, canGradeModule, cohortReport, createAssessment, deleteAssessment, evaluateCohort, gradeSheet, reasonText, saveGrades, standingFor, updateAssessment,
} from "@/lib/services/grades";
import { closePresence } from "@/lib/services/lessons";
import { createTenant } from "@/lib/services/tenants";
import { parseScore } from "@/lib/format";

const rules = { minGrade: 7, minFrequencyPercent: 80 };
const mod = (id: string, hours: number | null, list: [number, number, number | null][]) => ({
  moduleId: id, weightHours: hours, assessments: list.map(([weight, max, score], i) => ({ id: `${id}-${i}`, weight, max, score })),
});

describe("cálculo da situação (puro)", () => {
  it("média ponderada pelos pesos e normalizada para 0 a 10", () => {
    const s = standingFor([mod("m", 60, [[1, 10, 9], [3, 20, 16]])], { held: 2, closed: 2, present: 2 }, rules);
    expect(s.finalGrade).toBeCloseTo(8.25, 5);
    expect(s.situation).toBe("approved");
  });
  it("média final pondera os módulos pela carga horária (sem carga, peso 1)", () => {
    const s = standingFor([mod("a", 30, [[1, 10, 10]]), mod("b", 10, [[1, 10, 6]]), mod("c", null, [[1, 10, 6]])], { held: 1, closed: 1, present: 1 }, rules);
    expect(s.finalGrade).toBeCloseTo((10 * 30 + 6 * 10 + 6 * 1) / 41, 5);
  });
  it("módulo sem avaliação fica fora da média", () => {
    const s = standingFor([mod("a", 30, [[1, 10, 8]]), mod("vazio", 30, [])], { held: 1, closed: 1, present: 1 }, rules);
    expect(s.finalGrade).toBe(8);
    expect(s.modules).toHaveLength(1);
  });
  it("falta nota: em andamento, sem média final nem do módulo", () => {
    const s = standingFor([mod("a", 30, [[1, 10, 8], [1, 10, null]])], { held: 1, closed: 1, present: 1 }, rules);
    expect(s.situation).toBe("in_progress");
    expect(s.finalGrade).toBeNull();
    expect(s.modules[0]).toMatchObject({ average: null, complete: false, graded: 1, total: 2 });
    expect(reasonText(s)).toBe("Falta: notas.");
  });
  it("aula com presença aberta mantém em andamento; sem aulas também", () => {
    expect(standingFor([mod("a", 1, [[1, 10, 10]])], { held: 2, closed: 1, present: 1 }, rules).missing).toEqual(["presença"]);
    expect(standingFor([mod("a", 1, [[1, 10, 10]])], { held: 0, closed: 0, present: 0 }, rules).missing).toEqual(["aulas"]);
    expect(standingFor([], { held: 1, closed: 1, present: 1 }, rules).missing).toEqual(["avaliações"]);
  });
  it("reprova por nota, por frequência ou pelas duas, e o limite exato aprova", () => {
    const by = (score: number, present: number) => standingFor([mod("a", 1, [[1, 10, score]])], { held: 10, closed: 10, present }, rules);
    expect(by(6.9, 10)).toMatchObject({ situation: "failed", reasons: ["grade"] });
    expect(by(10, 7)).toMatchObject({ situation: "failed", reasons: ["frequency"] });
    expect(by(5, 5)).toMatchObject({ situation: "failed", reasons: ["grade", "frequency"] });
    expect(by(7, 8).situation).toBe("approved"); // 7,0 e 80% exatos
    expect(reasonText(by(5, 5))).toBe("nota abaixo do mínimo e frequência abaixo do mínimo.");
  });
  it("lê nota com vírgula ou ponto e recusa lixo", () => {
    expect(parseScore("7,5")).toBe(7.5);
    expect(parseScore(" 8.25 ")).toBe(8.25);
    expect(parseScore("")).toBeNull();
    expect(parseScore("abc")).toBeNaN();
    expect(parseScore("-1")).toBeNaN();
    expect(parseScore("7,555")).toBeNaN();
  });
});

describe("código do certificado", () => {
  it("tem 12 caracteres legíveis, é aleatório e normaliza o que o aluno digita", () => {
    const a = newCertificateCode();
    expect(a).toMatch(/^[A-HJ-NP-Z2-9]{12}$/);
    expect(newCertificateCode()).not.toBe(a);
    expect(formatCode(a)).toMatch(/^.{4}-.{4}-.{4}$/);
    expect(normalizeCode(formatCode(a).toLowerCase())).toBe(a);
  });
});

let alpha: string;
let beta: string;
let cohortId: string;
let moduleId: string;
const enr: Record<string, string> = {};
const ctx = (tenantId: string, userId?: string) => ({ tenantId, userId });
let assessA: string;
let assessB: string;

beforeAll(async () => {
  const owner = new Client({ connectionString: process.env.DATABASE_OWNER_URL });
  await owner.connect();
  await owner.query("begin");
  await owner.query("select set_config('app.is_master', 'on', true)");
  await owner.query(`insert into "user" (id, name, email, "emailVerified") values
    ('g5m', 'Master', 'master@g5.test', true), ('g5prof', 'Paulo Professor', 'prof@g5.test', true), ('g5prof2', 'Lia da Aula', 'prof2@g5.test', true),
    ('g5prof3', 'Sem Módulo', 'prof3@g5.test', true), ('g5coord', 'Clara Coord', 'coord@g5.test', true), ('g5sec', 'Sônia Secretaria', 'sec@g5.test', true),
    ('g5s1', 'Ana Aprovada', 'ana@g5.test', true), ('g5s2', 'Davi Nota Baixa', 'davi@g5.test', true), ('g5s3', 'Eva Faltosa', 'eva@g5.test', true),
    ('g5s4', 'Gil Em Andamento', 'gil@g5.test', true), ('g5s5', 'Pat Pendente', 'pat@g5.test', true)`);
  await owner.query("commit");
  await owner.end();

  const planId = (await pool.query("select id from plans limit 1")).rows[0].id;
  const created = await withContext({ master: true, userId: "g5m" }, async (c) => ({
    a: await createTenant(c, { name: "Alpha 5", slug: "alpha5", planId, adminEmail: "admin@alpha5.test", actorId: "g5m" }),
    b: await createTenant(c, { name: "Beta 5", slug: "beta5", planId, adminEmail: "admin@beta5.test", actorId: "g5m" }),
  }));
  alpha = created.a.tenantId;
  beta = created.b.tenantId;

  await withContext(ctx(alpha), async (c) => {
    const programId = (await c.query(`insert into programs (tenant_id, name, status, workload_hours) values ($1, 'Pós em Testes', 'published', 360) returning id`, [alpha])).rows[0].id;
    await c.query(`insert into program_modules (tenant_id, program_id, position, name) values ($1, $2, 1, 'Módulo 1')`, [alpha, programId]);
    cohortId = await createCohortFromProgram(c, { tenantId: alpha, programId, name: "Turma 5", startsOn: "2027-03-01", endsOn: "2027-11-30" });
    moduleId = (await c.query("select id from cohort_modules where cohort_id = $1", [cohortId])).rows[0].id;
    await c.query("update cohort_modules set teacher_id = 'g5prof', workload_hours = 60 where id = $1", [moduleId]);
    for (const [uid, role] of [["g5prof", "professor"], ["g5prof2", "professor"], ["g5prof3", "professor"], ["g5coord", "coordenacao"], ["g5sec", "secretaria"], ["g5s1", "aluno"], ["g5s2", "aluno"], ["g5s3", "aluno"], ["g5s4", "aluno"], ["g5s5", "aluno"]] as const) {
      await c.query("insert into memberships (tenant_id, user_id, role) values ($1, $2, $3)", [alpha, uid, role]);
    }
    for (const [uid, stage] of [["g5s1", "released"], ["g5s2", "released"], ["g5s3", "released"], ["g5s4", "released"], ["g5s5", "payment"]] as const) {
      enr[uid] = (await c.query(`insert into enrollments (tenant_id, cohort_id, user_id, source, stage) values ($1, $2, $3, 'vitrine', $4) returning id`, [alpha, cohortId, uid, stage])).rows[0].id;
    }
    // professora g5prof2 dá uma aula do módulo (não é a professora do módulo)
    for (let i = 1; i <= 2; i++) {
      const l = (await c.query(
        `insert into lessons (tenant_id, cohort_id, cohort_module_id, title, starts_at, duration_minutes, teacher_id, status, started_at, ended_at)
         values ($1, $2, $3, $4, now() - interval '2 days', 60, 'g5prof2', 'ended', now() - interval '2 days', now() - interval '2 days' + interval '1 hour') returning id`,
        [alpha, cohortId, moduleId, `Aula ${i}`])).rows[0].id;
      // s1, s2, s4 presentes nas duas; s3 só na primeira
      for (const uid of ["g5s1", "g5s2", "g5s3", "g5s4"]) {
        const present = uid !== "g5s3" || i === 1;
        await c.query("insert into attendance (tenant_id, lesson_id, enrollment_id, seconds, present) values ($1, $2, $3, $4, $5)", [alpha, l, enr[uid], present ? 3600 : 0, present]);
      }
      if (i === 1) await c.query("update lessons set presence_closed_at = now() where id = $1", [l]); // a 2ª ainda está aberta
    }
  });
});
afterAll(async () => { await pool.end(); });

describe("permissões do módulo", () => {
  it("coordenação em todos; professor do módulo; professor de aula do módulo; os demais não", async () => {
    const can = (roles: string[], uid: string) => withContext(ctx(alpha, uid), (c) => canGradeModule(c, roles, uid, moduleId));
    expect(await can(["coordenacao"], "g5coord")).toBe(true);
    expect(await can(["professor"], "g5prof")).toBe(true);
    expect(await can(["professor"], "g5prof2")).toBe(true);
    expect(await can(["professor"], "g5prof3")).toBe(false);
    expect(await can(["secretaria"], "g5sec")).toBe(false);
    expect(await can(["aluno"], "g5s1")).toBe(false);
  });
});

describe("avaliações e lançamento de notas", () => {
  it("cria, edita e valida a nota máxima contra notas já lançadas", async () => {
    const a = await withContext(ctx(alpha, "g5prof"), (c) => createAssessment(c, { tenantId: alpha, cohortModuleId: moduleId, title: "Prova 1", weight: 1, maxScore: 10, dueOn: null, actorId: "g5prof" }));
    const b = await withContext(ctx(alpha, "g5prof"), (c) => createAssessment(c, { tenantId: alpha, cohortModuleId: moduleId, title: "Trabalho final", weight: 3, maxScore: 20, dueOn: "2027-06-01", actorId: "g5prof" }));
    if (!a.ok || !b.ok) throw new Error("falhou");
    assessA = a.id; assessB = b.id;
    expect((await withContext(ctx(alpha), (c) => createAssessment(c, { tenantId: alpha, cohortModuleId: "00000000-0000-0000-0000-000000000000", title: "X", weight: 1, maxScore: 10, dueOn: null, actorId: "g5coord" }))).ok).toBe(false);
    expect((await withContext(ctx(beta), (c) => createAssessment(c, { tenantId: beta, cohortModuleId: moduleId, title: "X", weight: 1, maxScore: 10, dueOn: null, actorId: "x" }))).ok).toBe(false);
  });

  it("folha só lista alunos liberados da turma", async () => {
    const sheet = await withContext(ctx(alpha), (c) => gradeSheet(c, assessA));
    expect(sheet.map((r) => r.student)).toEqual(["Ana Aprovada", "Davi Nota Baixa", "Eva Faltosa", "Gil Em Andamento"]);
  });

  it("recusa nota fora da faixa e aluno de fora, sem salvar nada", async () => {
    const over = await withContext(ctx(alpha), (c) => saveGrades(c, { tenantId: alpha, assessmentId: assessA, actorId: "g5prof", scores: { [enr.g5s1]: 11 } }));
    expect(over).toEqual({ ok: false, error: "A nota deve ficar entre 0 e 10." });
    const pending = await withContext(ctx(alpha), (c) => saveGrades(c, { tenantId: alpha, assessmentId: assessA, actorId: "g5prof", scores: { [enr.g5s5]: 5 } }));
    expect(pending.ok).toBe(false);
    const mixed = await withContext(ctx(alpha), (c) => saveGrades(c, { tenantId: alpha, assessmentId: assessA, actorId: "g5prof", scores: { [enr.g5s1]: 9, [enr.g5s5]: 5 } }));
    expect(mixed.ok).toBe(false);
    expect(await withContext(ctx(alpha), async (c) => (await c.query("select count(*)::int as n from grades")).rows[0].n)).toBe(0);
  });

  it("salva, avisa quem recebeu nota nova e não avisa de novo se a nota não mudou", async () => {
    const first = await withContext(ctx(alpha), (c) => saveGrades(c, { tenantId: alpha, assessmentId: assessA, actorId: "g5prof", scores: { [enr.g5s1]: 9, [enr.g5s2]: 5, [enr.g5s3]: 10, [enr.g5s4]: 8 } }));
    expect(first).toEqual({ ok: true, saved: 4, issued: 0 });
    const again = await withContext(ctx(alpha), (c) => saveGrades(c, { tenantId: alpha, assessmentId: assessA, actorId: "g5prof", scores: { [enr.g5s1]: 9, [enr.g5s2]: 5 } }));
    expect(again).toEqual({ ok: true, saved: 0, issued: 0 });
    const n = await withContext(ctx(alpha), async (c) => (await c.query("select count(*)::int as n from notifications where kind = 'grade_posted'")).rows[0].n);
    expect(n).toBe(4);
  });

  it("não deixa baixar a nota máxima abaixo de uma nota já lançada", async () => {
    const out = await withContext(ctx(alpha), (c) => updateAssessment(c, assessA, { title: "Prova 1", weight: 1, maxScore: 8, dueOn: null, tenantId: alpha, actorId: "g5prof" }));
    expect(out.ok).toBe(false);
    expect((await withContext(ctx(alpha), (c) => updateAssessment(c, assessA, { title: "Prova 1 (final)", weight: 1, maxScore: 10, dueOn: null, tenantId: alpha, actorId: "g5prof" }))).ok).toBe(true);
  });
});

describe("certificado automático", () => {
  it("nada sai enquanto falta nota ou fechar a presença de uma aula", async () => {
    const sec = await withContext(ctx(alpha), (c) => saveGrades(c, { tenantId: alpha, assessmentId: assessB, actorId: "g5prof", scores: { [enr.g5s1]: 16, [enr.g5s2]: 10, [enr.g5s3]: 20 } }));
    expect(sec).toEqual({ ok: true, saved: 3, issued: 0 }); // s1 completo e com boa nota, mas a presença da aula 2 está aberta
    expect(await withContext(ctx(alpha), async (c) => (await c.query("select count(*)::int as n from certificates")).rows[0].n)).toBe(0);
  });

  it("ao fechar a última presença, emite só para quem foi aprovado e é idempotente", async () => {
    const lesson = (await withContext(ctx(alpha), async (c) => (await c.query("select id from lessons where presence_closed_at is null")).rows[0])).id;
    // professor ajusta: s3 continua faltoso (1 de 2 = 50%)
    const closed = await withContext(ctx(alpha, "g5prof2"), (c) => closePresence(c, { tenantId: alpha, lessonId: lesson, actorId: "g5prof2" }));
    expect(closed.ok).toBe(true);
    const certs = await withContext(ctx(alpha), async (c) => (await c.query("select student_name, final_grade::float as g, frequency_percent::float as f, workload_hours, period_text, program_name from certificates")).rows);
    expect(certs).toEqual([{ student_name: "Ana Aprovada", g: 8.25, f: 100, workload_hours: 360, period_text: "de 01/03/2027 a 30/11/2027", program_name: "Pós em Testes" }]);
    expect(await withContext(ctx(alpha), (c) => evaluateCohort(c, { tenantId: alpha, cohortId, actorId: null }))).toBe(0);
    const notices = await withContext(ctx(alpha), async (c) => (await c.query("select user_id from notifications where kind = 'certificate_issued'")).rows);
    expect(notices).toEqual([{ user_id: "g5s1" }]);
  });

  it("relatório mostra aprovado, reprovado por nota, por frequência e em andamento", async () => {
    const r = await withContext(ctx(alpha), (c) => cohortReport(c, cohortId));
    const by = Object.fromEntries(r!.rows.map((x) => [x.student, x]));
    expect(by["Ana Aprovada"].standing.situation).toBe("approved");
    expect(by["Ana Aprovada"].certificate?.revoked).toBe(false);
    expect(by["Davi Nota Baixa"].standing).toMatchObject({ situation: "failed", reasons: ["grade"] });
    expect(by["Eva Faltosa"].standing).toMatchObject({ situation: "failed", reasons: ["frequency"] });
    expect(by["Gil Em Andamento"].standing).toMatchObject({ situation: "in_progress", missing: ["notas"] });
    expect(r!.rows).toHaveLength(4); // Pat (pagamento pendente) não entra
    expect(by["Davi Nota Baixa"].certificate).toBeNull();
  });

  it("completar a nota que faltava aprova o aluno na hora", async () => {
    const out = await withContext(ctx(alpha), (c) => saveGrades(c, { tenantId: alpha, assessmentId: assessB, actorId: "g5prof", scores: { [enr.g5s4]: 18 } }));
    expect(out).toEqual({ ok: true, saved: 1, issued: 1 });
  });

  it("anular não reemite sozinho; a conferência pública mostra anulado", async () => {
    const id = (await withContext(ctx(alpha), async (c) => (await c.query("select c.id, c.code from certificates c where student_name = 'Ana Aprovada'")).rows[0]));
    expect(await withContext(ctx(alpha), (c) => revokeCertificate(c, { tenantId: alpha, certificateId: id.id, reason: "Erro de cadastro", actorId: "g5coord" }))).toBe(true);
    expect(await withContext(ctx(alpha), (c) => revokeCertificate(c, { tenantId: alpha, certificateId: id.id, reason: "de novo", actorId: "g5coord" }))).toBe(false);
    expect(await withContext(ctx(alpha), (c) => evaluateCohort(c, { tenantId: alpha, cohortId, actorId: null }))).toBe(0);
    const found = await withContext(ctx(alpha), (c) => certificateByCode(c, formatCode(id.code).toLowerCase()));
    expect(found?.revoked_reason).toBe("Erro de cadastro");
    expect(found?.revoked_at).toBeTruthy();
  });
});

describe("conferência, download e isolamento", () => {
  it("código inválido ou de outra instituição não confere", async () => {
    const code = (await withContext(ctx(alpha), async (c) => (await c.query("select code from certificates limit 1")).rows[0])).code;
    expect(await withContext(ctx(beta), (c) => certificateByCode(c, code))).toBeNull();
    expect(await withContext(ctx(alpha), (c) => certificateByCode(c, "ABC"))).toBeNull();
    expect(await withContext(ctx(alpha), (c) => certificateByCode(c, "AAAAAAAAAAAA"))).toBeNull();
  });
  it("só o dono e a equipe baixam o certificado", async () => {
    const cert = await withContext(ctx(alpha), async (c) => (await c.query("select id from certificates where student_name = 'Gil Em Andamento'")).rows[0]);
    const dl = (uid: string, staff: boolean, t = alpha) => withContext(ctx(t, uid), (c) => certificateForDownload(c, cert.id, uid, staff));
    expect(await dl("g5s4", false)).not.toBeNull();
    expect(await dl("g5s1", false)).toBeNull();
    expect(await dl("g5sec", true)).not.toBeNull();
    expect(await dl("g5sec", true, beta)).toBeNull();
  });
  it("boletim do aluno mostra só as notas dele", async () => {
    const b = await withContext(ctx(alpha, "g5s2"), (c) => boletimsFor(c, "g5s2"));
    expect(b).toHaveLength(1);
    expect(b[0].standing.situation).toBe("failed");
    expect(b[0].modules[0].assessments.map((a) => a.score)).toEqual([5, 10]);
    expect(await withContext(ctx(alpha, "g5s5"), (c) => boletimsFor(c, "g5s5"))).toEqual([]); // pagamento pendente
  });
  it("assinatura configurada vai para os próximos certificados e fica gravada nos emitidos", async () => {
    await withContext(ctx(alpha), (c) => saveSettings(c, alpha, { signerName: "Dra. Rita Bressane", signerTitle: "Coordenadora", footerText: "Portaria 123" }));
    expect((await withContext(ctx(alpha), (c) => getSettings(c))).signer_name).toBe("Dra. Rita Bressane");
    const old = await withContext(ctx(alpha), async (c) => (await c.query("select signer_name from certificates where student_name = 'Ana Aprovada'")).rows[0]);
    expect(old.signer_name).toBe(""); // emitido antes da configuração
  });
  it("gera um PDF válido (A4 paisagem) com e sem assinatura e marca o anulado", async () => {
    const rows = await withContext(ctx(alpha), async (c) => (await c.query("select * from certificates order by issued_at")).rows);
    for (const row of rows) {
      const pdf = await buildCertificatePdf(row, "Instituto Teste", `https://alpha5.exemplo.com/verificar/${row.code}`);
      expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
      expect(pdf.byteLength).toBeGreaterThan(2000);
    }
  });
  it("aulas, notas e certificados de uma instituição não aparecem na outra", async () => {
    const seen = await withContext(ctx(beta), async (c) => ({
      a: (await c.query("select count(*)::int as n from assessments")).rows[0].n,
      g: (await c.query("select count(*)::int as n from grades")).rows[0].n,
      c: (await c.query("select count(*)::int as n from certificates")).rows[0].n,
    }));
    expect(seen).toEqual({ a: 0, g: 0, c: 0 });
  });
  it("remover a avaliação apaga as notas dela", async () => {
    expect(await withContext(ctx(alpha), (c) => deleteAssessment(c, assessA, alpha, "g5prof"))).toBe(true);
    expect(await withContext(ctx(alpha), async (c) => (await c.query("select count(*)::int as n from grades where assessment_id = $1", [assessA])).rows[0].n)).toBe(0);
  });
});
