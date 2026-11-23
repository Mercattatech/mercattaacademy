import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { Client } from "pg";
import { pool, withContext } from "@/lib/db";
import { createCohortFromProgram } from "@/lib/services/academic";
import {
  agendaForUser, applyVideoEvent, attendanceFor, canManageLesson, cancelLesson, closePresence, endLesson, ensureCalendarToken,
  joinUrlFor, lessonState, roomAccess, scheduleLesson, setOverride, startLesson, updateLesson,
} from "@/lib/services/lessons";
import { createTenant } from "@/lib/services/tenants";
import { buildIcs } from "@/lib/ics";
import { verifyWebhook } from "@/lib/video";

process.env.DAILY_API_KEY = "daily-test-key";
process.env.DAILY_WEBHOOK_SECRET = Buffer.from("segredo-do-webhook").toString("base64");

let alpha: string;
let beta: string;
let moduleId: string;
let cohortId: string;
let lessonId: string;
const enr: Record<string, string> = {};
const ctx = (tenantId: string, userId?: string) => ({ tenantId, userId });
const calls: { url: string; method: string; body: Record<string, unknown> | null }[] = [];

function mockDaily() {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    calls.push({ url, method: init?.method ?? "GET", body });
    const json = (o: object) => new Response(JSON.stringify(o), { status: 200 });
    if (url.endsWith("/rooms")) return json({ url: "https://sala.daily.test/aula-x" });
    if (url.endsWith("/meeting-tokens")) return json({ token: "tok123" });
    return json({});
  }));
}

beforeAll(async () => {
  const owner = new Client({ connectionString: process.env.DATABASE_OWNER_URL });
  await owner.connect();
  await owner.query("begin");
  await owner.query("select set_config('app.is_master', 'on', true)");
  await owner.query(`insert into "user" (id, name, email, "emailVerified") values
    ('m4', 'Master', 'master@s4.test', true), ('prof', 'Paulo Professor', 'prof@s4.test', true), ('prof2', 'Outra Professora', 'prof2@s4.test', true),
    ('coord', 'Clara Coordenação', 'coord@s4.test', true), ('s1', 'Ana Aluna', 'ana@s4.test', true), ('s2', 'Davi Aluno', 'davi@s4.test', true),
    ('s3', 'Eva Pendente', 'eva@s4.test', true)`);
  await owner.query("commit");
  await owner.end();

  const planId = (await pool.query("select id from plans limit 1")).rows[0].id;
  const created = await withContext({ master: true, userId: "m4" }, async (c) => ({
    a: await createTenant(c, { name: "Alpha 4", slug: "alpha4", planId, adminEmail: "admin@alpha4.test", actorId: "m4" }),
    b: await createTenant(c, { name: "Beta 4", slug: "beta4", planId, adminEmail: "admin@beta4.test", actorId: "m4" }),
  }));
  alpha = created.a.tenantId;
  beta = created.b.tenantId;

  await withContext(ctx(alpha), async (c) => {
    const programId = (await c.query(`insert into programs (tenant_id, name, status, min_attendance_percent) values ($1, 'Curso Aulas', 'published', 75) returning id`, [alpha])).rows[0].id;
    await c.query(`insert into program_modules (tenant_id, program_id, position, name) values ($1, $2, 1, 'Módulo A')`, [alpha, programId]);
    cohortId = await createCohortFromProgram(c, { tenantId: alpha, programId, name: "T1", startsOn: null, endsOn: null });
    moduleId = (await c.query("select id from cohort_modules where cohort_id = $1", [cohortId])).rows[0].id;
    for (const [uid, role] of [["prof", "professor"], ["prof2", "professor"], ["coord", "coordenacao"], ["s1", "aluno"], ["s2", "aluno"], ["s3", "aluno"]] as const) {
      await c.query("insert into memberships (tenant_id, user_id, role) values ($1, $2, $3)", [alpha, uid, role]);
    }
    for (const [uid, stage] of [["s1", "released"], ["s2", "released"], ["s3", "payment"]] as const) {
      enr[uid] = (await c.query(`insert into enrollments (tenant_id, cohort_id, user_id, source, stage) values ($1, $2, $3, 'vitrine', $4) returning id`, [alpha, cohortId, uid, stage])).rows[0].id;
    }
  });
});

afterEach(() => { vi.unstubAllGlobals(); calls.length = 0; });
afterAll(async () => { await pool.end(); });

const left = (user: string, session: string, duration: number) => ({ type: "participant.left", payload: { user_id: user, session_id: session, duration } });

describe("agendamento", () => {
  it("agenda no horário de Brasília e liga a aula à turma do módulo", async () => {
    const out = await withContext(ctx(alpha, "coord"), (c) => scheduleLesson(c, { tenantId: alpha, cohortModuleId: moduleId, title: "Aula 1", startsLocal: "2026-12-01T19:00", durationMinutes: 120, teacherId: "prof", actorId: "coord" }));
    expect(out.ok).toBe(true);
    if (out.ok) lessonId = out.id;
    const row = await withContext(ctx(alpha), async (c) => (await c.query("select cohort_id, starts_at at time zone 'UTC' as utc from lessons where id = $1", [lessonId])).rows[0]);
    expect(row.cohort_id).toBe(cohortId);
    expect(new Date(row.utc + "Z").toISOString()).toBe("2026-12-01T22:00:00.000Z"); // 19h em Brasília = 22h UTC
  });

  it("recusa professor sem perfil e módulo inexistente", async () => {
    const noTeacher = await withContext(ctx(alpha, "coord"), (c) => scheduleLesson(c, { tenantId: alpha, cohortModuleId: moduleId, title: "X", startsLocal: "2026-12-02T19:00", durationMinutes: 60, teacherId: "s1", actorId: "coord" }));
    expect(noTeacher.ok).toBe(false);
    const noModule = await withContext(ctx(alpha, "coord"), (c) => scheduleLesson(c, { tenantId: alpha, cohortModuleId: "00000000-0000-0000-0000-000000000000", title: "X", startsLocal: "2026-12-02T19:00", durationMinutes: 60, teacherId: null, actorId: "coord" }));
    expect(noModule).toEqual({ ok: false, error: "Módulo não encontrado." });
  });

  it("não agenda aula em módulo de outra instituição", async () => {
    const out = await withContext(ctx(beta, "coord"), (c) => scheduleLesson(c, { tenantId: beta, cohortModuleId: moduleId, title: "X", startsLocal: "2026-12-02T19:00", durationMinutes: 60, teacherId: null, actorId: "coord" }));
    expect(out.ok).toBe(false);
  });

  it("edita e cancela só enquanto agendada", async () => {
    const edit = await withContext(ctx(alpha), (c) => updateLesson(c, { lessonId, title: "Aula 1 (nova hora)", startsLocal: "2026-12-01T20:00", durationMinutes: 90, teacherId: "prof" }));
    expect(edit.ok).toBe(true);
    const extra = await withContext(ctx(alpha, "coord"), (c) => scheduleLesson(c, { tenantId: alpha, cohortModuleId: moduleId, title: "Cancelável", startsLocal: "2026-12-05T19:00", durationMinutes: 60, teacherId: null, actorId: "coord" }));
    if (!extra.ok) throw new Error("falhou");
    expect(await withContext(ctx(alpha), (c) => cancelLesson(c, extra.id, "coord", alpha))).toBe(true);
    expect(await withContext(ctx(alpha), (c) => cancelLesson(c, extra.id, "coord", alpha))).toBe(false);
  });

  it("professor gerencia só a própria aula; coordenação gerencia todas", () => {
    expect(canManageLesson(["professor"], "prof", { teacher_id: "prof" })).toBe(true);
    expect(canManageLesson(["professor"], "prof2", { teacher_id: "prof" })).toBe(false);
    expect(canManageLesson(["coordenacao"], "coord", { teacher_id: "prof" })).toBe(true);
    expect(canManageLesson(["aluno"], "s1", { teacher_id: "prof" })).toBe(false);
  });
});

describe("sala ao vivo", () => {
  it("só o professor da aula ou a coordenação iniciam; a sala é privada com gravação", async () => {
    mockDaily();
    const wrong = await withContext(ctx(alpha, "prof2"), (c) => startLesson(c, { tenantId: alpha, userId: "prof2", roles: ["professor"], lessonId }));
    expect(wrong.ok).toBe(false);
    expect(calls).toHaveLength(0);
    const ok = await withContext(ctx(alpha, "prof"), (c) => startLesson(c, { tenantId: alpha, userId: "prof", roles: ["professor"], lessonId }));
    expect(ok.ok).toBe(true);
    const room = calls.find((c) => c.url.endsWith("/rooms"))!.body as { name: string; privacy: string; properties: Record<string, unknown> };
    expect(room.name).toBe(`aula-${lessonId}`);
    expect(room.privacy).toBe("private");
    expect(room.properties).toMatchObject({ enable_recording: "cloud", enable_chat: true, enable_screenshare: true });
    const st = await withContext(ctx(alpha), async (c) => (await c.query("select status, room_url from lessons where id = $1", [lessonId])).rows[0]);
    expect(st).toEqual({ status: "live", room_url: "https://sala.daily.test/aula-x" });
  });

  it("aluno liberado entra; aluno com pagamento pendente e pessoa de fora não", async () => {
    const r = (u: string, roles: string[]) => withContext(ctx(alpha, u), (c) => roomAccess(c, lessonId, u, roles));
    expect(await r("s1", ["aluno"])).toEqual({ kind: "student", enrollmentId: enr.s1 });
    expect(await r("s3", ["aluno"])).toBeNull();
    expect(await r("prof2", ["professor"])).toBeNull();
    expect(await r("prof", ["professor"])).toEqual({ kind: "manager", enrollmentId: null });
    expect(await withContext(ctx(beta, "s1"), (c) => roomAccess(c, lessonId, "s1", ["aluno"]))).toBeNull();
  });

  it("link de entrada é pessoal: dono para o professor, convidado para o aluno, com o id do usuário", async () => {
    mockDaily();
    const url = await withContext(ctx(alpha, "s1"), (c) => joinUrlFor(c, { lessonId, userId: "s1", userName: "Ana Aluna", owner: false }));
    expect(url).toBe("https://sala.daily.test/aula-x?t=tok123");
    expect(calls[0].body).toMatchObject({ properties: { user_id: "s1", is_owner: false, room_name: `aula-${lessonId}`, eject_at_token_exp: true } });
    await withContext(ctx(alpha, "prof"), (c) => joinUrlFor(c, { lessonId, userId: "prof", userName: "Paulo", owner: true }));
    expect(calls[1].body).toMatchObject({ properties: { is_owner: true, start_cloud_recording: true } });
  });
});

describe("presença", () => {
  it("soma o tempo conectado, ignora o mesmo aviso repetido, professor e gente de fora", async () => {
    const run = (e: object) => withContext(ctx(alpha), (c) => applyVideoEvent(c, alpha, lessonId, e));
    expect(await run(left("s1", "sess-1", 1200))).toBe(true);
    expect(await run(left("s1", "sess-1", 1200))).toBe(true); // repetido
    expect(await run(left("s1", "sess-2", 1500))).toBe(true); // entrou de novo
    expect(await run(left("s2", "sess-3", 600))).toBe(true);
    expect(await run(left("prof", "sess-4", 5400))).toBe(false);
    expect(await run(left("ninguem", "sess-5", 100))).toBe(false);
    const rows = await withContext(ctx(alpha), async (c) => (await c.query("select enrollment_id, seconds from attendance order by seconds desc")).rows);
    expect(rows).toEqual([{ enrollment_id: enr.s1, seconds: 2700 }, { enrollment_id: enr.s2, seconds: 600 }]);
  });

  it("encerrar a aula marca como encerrada; mínimo de 75% do tempo real", async () => {
    mockDaily();
    const ended = await withContext(ctx(alpha, "prof"), (c) => endLesson(c, { tenantId: alpha, userId: "prof", roles: ["professor"], lessonId }));
    expect(ended.ok).toBe(true);
    expect(calls.some((c) => c.method === "DELETE" && c.url.endsWith(`/rooms/aula-${lessonId}`))).toBe(true);
    // aula durou 1h (ajusta início real): limite = 75% = 2700s
    await withContext(ctx(alpha), (c) => c.query("update lessons set started_at = now() - interval '1 hour', ended_at = now() where id = $1", [lessonId]));
    const att = await withContext(ctx(alpha), (c) => attendanceFor(c, lessonId));
    expect(att.thresholdSeconds).toBe(2700);
    const byName = Object.fromEntries(att.rows.map((r) => [r.student, r.auto_present]));
    expect(byName).toEqual({ "Ana Aluna": true, "Davi Aluno": false }); // Eva (pagamento pendente) nem aparece
  });

  it("professor ajusta antes de fechar; depois de fechada, nada muda", async () => {
    expect(await withContext(ctx(alpha), (c) => setOverride(c, { lessonId, enrollmentId: enr.s2, value: true }))).toBe(true);
    const out = await withContext(ctx(alpha, "prof"), (c) => closePresence(c, { tenantId: alpha, lessonId, actorId: "prof" }));
    expect(out.ok).toBe(true);
    const fin = await withContext(ctx(alpha), async (c) => (await c.query("select enrollment_id, present from attendance order by seconds desc")).rows);
    expect(fin).toEqual([{ enrollment_id: enr.s1, present: true }, { enrollment_id: enr.s2, present: true }]);
    expect(await withContext(ctx(alpha), (c) => setOverride(c, { lessonId, enrollmentId: enr.s2, value: false }))).toBe(false);
    const again = await withContext(ctx(alpha), (c) => closePresence(c, { tenantId: alpha, lessonId, actorId: "prof" }));
    expect(again).toEqual({ ok: false, error: "A presença já está fechada." });
  });

  it("não fecha a presença de aula que não foi encerrada", async () => {
    const other = await withContext(ctx(alpha, "coord"), (c) => scheduleLesson(c, { tenantId: alpha, cohortModuleId: moduleId, title: "Aula 2", startsLocal: "2026-12-08T19:00", durationMinutes: 60, teacherId: "prof", actorId: "coord" }));
    if (!other.ok) throw new Error("falhou");
    const out = await withContext(ctx(alpha), (c) => closePresence(c, { tenantId: alpha, lessonId: other.id, actorId: "coord" }));
    expect(out.ok).toBe(false);
  });
});

describe("gravação", () => {
  it("anexa sozinha à aula, avisa os alunos liberados e repetir não duplica", async () => {
    const ev = { type: "recording.ready-to-download", payload: { recording_id: "rec-1", duration: 3600 } };
    await withContext(ctx(alpha), (c) => applyVideoEvent(c, alpha, lessonId, ev));
    await withContext(ctx(alpha), (c) => applyVideoEvent(c, alpha, lessonId, ev));
    const s = await withContext(ctx(alpha), async (c) => ({
      lesson: (await c.query("select status, recording_id, recording_seconds from lessons where id = $1", [lessonId])).rows[0],
      notices: (await c.query("select user_id from notifications where kind = 'recording_ready' order by user_id")).rows.map((r) => r.user_id),
    }));
    expect(s.lesson).toEqual({ status: "ended", recording_id: "rec-1", recording_seconds: 3600 });
    expect(s.notices).toEqual(["s1", "s2"]);
    expect(lessonState({ status: "ended", recording_id: "rec-1" })).toBe("recorded");
    expect(lessonState({ status: "ended", recording_id: null })).toBe("ended");
    expect(lessonState({ status: "live", recording_id: null })).toBe("live");
    expect(lessonState({ status: "scheduled", recording_id: null })).toBe("scheduled");
  });

  it("fim da reunião pelo provedor também encerra a aula", async () => {
    const other = await withContext(ctx(alpha, "coord"), (c) => scheduleLesson(c, { tenantId: alpha, cohortModuleId: moduleId, title: "Aula 3", startsLocal: "2026-12-09T19:00", durationMinutes: 60, teacherId: "prof", actorId: "coord" }));
    if (!other.ok) throw new Error("falhou");
    await withContext(ctx(alpha), (c) => c.query("update lessons set status = 'live', started_at = now() where id = $1", [other.id]));
    await withContext(ctx(alpha), (c) => applyVideoEvent(c, alpha, other.id, { type: "meeting.ended", payload: { end_ts: Math.floor(Date.now() / 1000) } }));
    expect((await withContext(ctx(alpha), async (c) => (await c.query("select status from lessons where id = $1", [other.id])).rows[0])).status).toBe("ended");
  });
});

describe("webhook do vídeo: assinatura", () => {
  const sign = (ts: string, body: string) => createHmac("sha256", Buffer.from("segredo-do-webhook")).update(`${ts}.${body}`).digest("base64");
  it("aceita assinatura correta e recusa adulterada, sem cabeçalhos ou de outro segredo", () => {
    const body = JSON.stringify({ type: "participant.left" });
    expect(verifyWebhook(body, sign("1700000000", body), "1700000000")).toBe(true);
    expect(verifyWebhook(body + " ", sign("1700000000", body), "1700000000")).toBe(false);
    expect(verifyWebhook(body, sign("1700000000", body), "1700000001")).toBe(false);
    expect(verifyWebhook(body, null, "1700000000")).toBe(false);
    expect(verifyWebhook(body, "AAAA", "1700000000")).toBe(false);
  });
  it("achar a aula pela sala só funciona para sala existente", async () => {
    const found = (await pool.query("select * from app.lesson_by_room($1)", [`aula-${lessonId}`])).rows[0];
    expect(found).toEqual({ tenant_id: alpha, lesson_id: lessonId });
    expect((await pool.query("select * from app.lesson_by_room($1)", ["aula-inexistente"])).rowCount).toBe(0);
  });
});

describe("agenda e calendário", () => {
  it("agenda só traz aulas da turma de quem tem acesso liberado (e as do professor)", async () => {
    const mine = (u: string) => withContext(ctx(alpha, u), (c) => agendaForUser(c, u));
    expect((await mine("s1")).length).toBeGreaterThanOrEqual(3);
    expect(await mine("s3")).toEqual([]); // pagamento pendente
    expect((await mine("prof")).every((l) => l.teacher_name === "Paulo Professor")).toBe(true);
    expect(await mine("prof2")).toEqual([]);
    expect((await withContext(ctx(alpha, "s1"), (c) => agendaForUser(c, "s1", "00000000-0000-0000-0000-000000000000")))).toEqual([]);
  });
  it("endereço do calendário é secreto, estável e pode ser trocado", async () => {
    const t1 = await withContext(ctx(alpha, "s1"), (c) => ensureCalendarToken(c, alpha, "s1"));
    expect(t1.length).toBeGreaterThanOrEqual(30);
    expect(await withContext(ctx(alpha, "s1"), (c) => ensureCalendarToken(c, alpha, "s1"))).toBe(t1);
    const t2 = await withContext(ctx(alpha, "s1"), (c) => ensureCalendarToken(c, alpha, "s1", true));
    expect(t2).not.toBe(t1);
    expect((await pool.query("select * from app.calendar_owner($1)", [t1])).rowCount).toBe(0);
    expect((await pool.query("select * from app.calendar_owner($1)", [t2])).rows[0]).toEqual({ tenant_id: alpha, user_id: "s1" });
  });
  it("gera .ics válido, com acentos, quebra de linha e cancelamento", () => {
    const ics = buildIcs("Instituto: aulas", [
      { uid: "1@x", title: "Aula, com vírgula; e ponto", start: new Date("2026-12-01T22:00:00Z"), end: new Date("2026-12-02T00:00:00Z"), description: "Linha 1\nLinha 2 " + "x".repeat(120), canceled: true },
    ], new Date("2026-11-13T12:00:00Z"));
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261201T220000Z");
    expect(ics).toContain("SUMMARY:Aula\\, com vírgula\; e ponto");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics.split("\r\n").every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
  });
});

describe("isolamento", () => {
  it("aulas, presença e materiais de uma instituição não aparecem na outra", async () => {
    const seen = await withContext(ctx(beta), async (c) => ({
      lessons: (await c.query("select count(*)::int as n from lessons")).rows[0].n,
      attendance: (await c.query("select count(*)::int as n from attendance")).rows[0].n,
      tokens: (await c.query("select count(*)::int as n from calendar_tokens")).rows[0].n,
    }));
    expect(seen).toEqual({ lessons: 0, attendance: 0, tokens: 0 });
  });
});
