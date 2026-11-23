import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { pool, withContext } from "@/lib/db";
import { createCohortFromProgram } from "@/lib/services/academic";
import {
  addComment, deleteComment, getProfile, listComments, listNotifications, listTeachers, markRead, postAnnouncement, saveProfile, unreadCount, visibleAnnouncements,
} from "@/lib/services/communication";
import { getThread, isSupportStaff, listThreads, openThread, reply, setStatus } from "@/lib/services/support";
import { createTenant } from "@/lib/services/tenants";

let alpha: string;
let beta: string;
let c1: string;
let c2: string;
let lessonId: string;
const ctx = (tenantId: string, userId?: string) => ({ tenantId, userId });

beforeAll(async () => {
  const owner = new Client({ connectionString: process.env.DATABASE_OWNER_URL });
  await owner.connect();
  await owner.query("begin");
  await owner.query("select set_config('app.is_master', 'on', true)");
  await owner.query(`insert into "user" (id, name, email, "emailVerified") values
    ('h6m', 'Master', 'master@h6.test', true), ('h6prof', 'Paulo Professor', 'prof@h6.test', true), ('h6prof2', 'Lia Professora', 'prof2@h6.test', true),
    ('h6coord', 'Clara Coord', 'coord@h6.test', true), ('h6sec', 'Sônia Secretaria', 'sec@h6.test', true), ('h6fin', 'Fábio Financeiro', 'fin@h6.test', true),
    ('h6s1', 'Ana Turma 1', 'ana@h6.test', true), ('h6s2', 'Davi Turma 2', 'davi@h6.test', true), ('h6s3', 'Eva Pendente', 'eva@h6.test', true)`);
  await owner.query("commit");
  await owner.end();

  const planId = (await pool.query("select id from plans limit 1")).rows[0].id;
  const created = await withContext({ master: true, userId: "h6m" }, async (c) => ({
    a: await createTenant(c, { name: "Alpha 6", slug: "alpha6", planId, adminEmail: "admin@alpha6.test", actorId: "h6m" }),
    b: await createTenant(c, { name: "Beta 6", slug: "beta6", planId, adminEmail: "admin@beta6.test", actorId: "h6m" }),
  }));
  alpha = created.a.tenantId;
  beta = created.b.tenantId;

  await withContext(ctx(alpha), async (c) => {
    const programId = (await c.query(`insert into programs (tenant_id, name, status) values ($1, 'Curso 6', 'published') returning id`, [alpha])).rows[0].id;
    await c.query(`insert into program_modules (tenant_id, program_id, position, name) values ($1, $2, 1, 'Módulo Único')`, [alpha, programId]);
    c1 = await createCohortFromProgram(c, { tenantId: alpha, programId, name: "Turma 1", startsOn: null, endsOn: null });
    c2 = await createCohortFromProgram(c, { tenantId: alpha, programId, name: "Turma 2", startsOn: null, endsOn: null });
    const m1 = (await c.query("select id from cohort_modules where cohort_id = $1", [c1])).rows[0].id;
    const m2 = (await c.query("select id from cohort_modules where cohort_id = $1", [c2])).rows[0].id;
    await c.query("update cohort_modules set teacher_id = 'h6prof' where id = $1", [m1]);
    await c.query("update cohort_modules set teacher_id = 'h6prof2' where id = $1", [m2]);
    for (const [uid, role] of [["h6prof", "professor"], ["h6prof2", "professor"], ["h6coord", "coordenacao"], ["h6sec", "secretaria"], ["h6fin", "financeiro"], ["h6s1", "aluno"], ["h6s2", "aluno"], ["h6s3", "aluno"]] as const) {
      await c.query("insert into memberships (tenant_id, user_id, role) values ($1, $2, $3)", [alpha, uid, role]);
    }
    for (const [uid, cohort, stage] of [["h6s1", c1, "released"], ["h6s2", c2, "released"], ["h6s3", c1, "payment"]] as const) {
      await c.query(`insert into enrollments (tenant_id, cohort_id, user_id, source, stage) values ($1, $2, $3, 'vitrine', $4)`, [alpha, cohort, uid, stage]);
    }
    lessonId = (await c.query(
      `insert into lessons (tenant_id, cohort_id, cohort_module_id, title, starts_at, duration_minutes, teacher_id) values ($1, $2, $3, 'Aula de teste', now() + interval '1 day', 60, 'h6prof') returning id`,
      [alpha, c1, m1])).rows[0].id;
  });
});
afterAll(async () => { await pool.end(); });

describe("avisos por turma", () => {
  it("aviso geral chega a todos os liberados; o da turma só à turma; não liberado não recebe", async () => {
    const all = await withContext(ctx(alpha), (c) => postAnnouncement(c, { tenantId: alpha, actorId: "h6coord", title: "Para todos", body: "Olá", cohortId: null }));
    const one = await withContext(ctx(alpha), (c) => postAnnouncement(c, { tenantId: alpha, actorId: "h6coord", title: "Só turma 1", body: "Olá turma 1", cohortId: c1 }));
    if (!all.ok || !one.ok) throw new Error("falhou");
    expect(all.recipients.map((r) => r.userId).sort()).toEqual(["h6s1", "h6s2"]);
    expect(one.recipients.map((r) => r.userId)).toEqual(["h6s1"]);
    expect(one.recipients[0].email).toBe("ana@h6.test");
    const n = await withContext(ctx(alpha), async (c) => (await c.query("select user_id, count(*)::int as n from notifications where kind = 'announcement' group by user_id order by user_id")).rows);
    expect(n).toEqual([{ user_id: "h6s1", n: 2 }, { user_id: "h6s2", n: 1 }]);
  });
  it("turma inexistente é recusada", async () => {
    const out = await withContext(ctx(alpha), (c) => postAnnouncement(c, { tenantId: alpha, actorId: "h6coord", title: "X", body: "", cohortId: "00000000-0000-0000-0000-000000000000" }));
    expect(out.ok).toBe(false);
    expect((await withContext(ctx(beta), (c) => postAnnouncement(c, { tenantId: beta, actorId: "x", title: "X", body: "", cohortId: c1 }))).ok).toBe(false);
  });
  it("cada aluno vê só os avisos gerais e os da própria turma; a equipe vê todos", async () => {
    const titles = async (u: string, staff = false) => (await withContext(ctx(alpha, u), (c) => visibleAnnouncements(c, u, staff))).map((a) => a.title).sort();
    expect(await titles("h6s1")).toEqual(["Para todos", "Só turma 1"]);
    expect(await titles("h6s2")).toEqual(["Para todos"]);
    expect(await titles("h6s3")).toEqual(["Para todos", "Só turma 1"]); // inscrito (aguardando pagamento) na turma 1
    expect(await titles("h6coord", true)).toEqual(["Para todos", "Só turma 1"]);
  });
});

describe("notificações", () => {
  it("conta, lista e marca como lida só as próprias", async () => {
    expect(await withContext(ctx(alpha, "h6s1"), (c) => unreadCount(c, "h6s1"))).toBe(2);
    const list = await withContext(ctx(alpha, "h6s1"), (c) => listNotifications(c, "h6s1"));
    expect(list).toHaveLength(2);
    expect(await withContext(ctx(alpha, "h6s2"), (c) => markRead(c, "h6s2", list[0].id))).toBe(0); // de outra pessoa
    expect(await withContext(ctx(alpha, "h6s1"), (c) => markRead(c, "h6s1", list[0].id))).toBe(1);
    expect(await withContext(ctx(alpha, "h6s1"), (c) => unreadCount(c, "h6s1"))).toBe(1);
    expect(await withContext(ctx(alpha, "h6s1"), (c) => markRead(c, "h6s1", null))).toBe(1);
    expect(await withContext(ctx(alpha, "h6s1"), (c) => unreadCount(c, "h6s1"))).toBe(0);
  });
});

describe("comentários por aula", () => {
  const add = (u: string, name: string, roles: string[], body: string, t = alpha) => withContext(ctx(t, u), (c) => addComment(c, { tenantId: t, lessonId, userId: u, userName: name, roles, body }));
  it("aluno liberado comenta; pendente, de outra turma e de outra instituição não", async () => {
    expect((await add("h6s1", "Ana Turma 1", ["aluno"], "Qual é a leitura do capítulo 2?")).ok).toBe(true);
    expect((await add("h6s3", "Eva Pendente", ["aluno"], "oi")).ok).toBe(false);
    expect((await add("h6s2", "Davi Turma 2", ["aluno"], "oi")).ok).toBe(false);
    expect((await add("h6s1", "Ana", ["aluno"], "oi", beta)).ok).toBe(false);
  });
  it("valida texto vazio e limite de 2.000 caracteres", async () => {
    expect(await add("h6s1", "Ana", ["aluno"], "   ")).toEqual({ ok: false, error: "Escreva o comentário." });
    expect((await add("h6s1", "Ana", ["aluno"], "x".repeat(2001))).ok).toBe(false);
    expect((await add("h6s1", "Ana", ["aluno"], "x".repeat(2000))).ok).toBe(true);
  });
  it("professor da aula responde; outro professor não comenta", async () => {
    expect((await add("h6prof", "Paulo Professor", ["professor"], "Leia as páginas 10 a 20.")).ok).toBe(true);
    expect((await add("h6prof2", "Lia Professora", ["professor"], "oi")).ok).toBe(false);
  });
  it("avisa o professor só dos comentários de aluno (e nenhum aviso para o próprio professor)", async () => {
    const n = await withContext(ctx(alpha), async (c) => (await c.query("select user_id, count(*)::int as n from notifications where kind = 'lesson_comment' group by user_id")).rows);
    expect(n).toEqual([{ user_id: "h6prof", n: 2 }]);
  });
  it("lista em ordem e marca o professor", async () => {
    const list = await withContext(ctx(alpha), (c) => listComments(c, lessonId));
    expect(list.map((x) => x.author)).toEqual(["Ana Turma 1", "Ana Turma 1", "Paulo Professor"]);
    expect(list.map((x) => x.is_teacher)).toEqual([false, false, true]);
  });
  it("autor apaga o próprio; aluno não apaga o de outro; professor da aula e coordenação apagam", async () => {
    const list = await withContext(ctx(alpha), (c) => listComments(c, lessonId));
    const del = (u: string, roles: string[], id: string) => withContext(ctx(alpha, u), (c) => deleteComment(c, { commentId: id, userId: u, roles }));
    expect(await del("h6s2", ["aluno"], list[0].id)).toBe(false);
    expect(await del("h6prof2", ["professor"], list[0].id)).toBe(false);
    expect(await del("h6s1", ["aluno"], list[0].id)).toBe(true);
    expect(await del("h6prof", ["professor"], list[1].id)).toBe(true);
    expect(await del("h6coord", ["coordenacao"], list[2].id)).toBe(true);
    expect(await withContext(ctx(alpha), (c) => listComments(c, lessonId))).toEqual([]);
  });
});

describe("professores", () => {
  it("salva o perfil, recusa quem não é professor e link inválido", async () => {
    const save = (u: string, link: string | null = "https://lattes.cnpq.br/1") => withContext(ctx(alpha), (c) => saveProfile(c, alpha, u, { headline: "Doutor em Fisiologia", bio: "Pesquisa em fisiologia.", linkUrl: link, visible: true }));
    expect((await save("h6prof")).ok).toBe(true);
    expect((await save("h6s1")).ok).toBe(false);
    expect((await save("h6prof2", "javascript:alert(1)")).ok).toBe(false);
    expect((await withContext(ctx(alpha), (c) => getProfile(c, "h6prof")))?.headline).toBe("Doutor em Fisiologia");
  });
  it("aluno vê só professores das suas turmas, e só os visíveis", async () => {
    const names = async (u: string, staff = false) => (await withContext(ctx(alpha, u), (c) => listTeachers(c, u, staff))).map((t) => t.name);
    expect(await names("h6s1")).toEqual(["Paulo Professor"]);
    expect(await names("h6s2")).toEqual(["Lia Professora"]);
    expect(await names("h6s3")).toEqual([]); // acesso ainda não liberado
    await withContext(ctx(alpha), (c) => saveProfile(c, alpha, "h6prof", { headline: "", bio: "", linkUrl: null, visible: false }));
    expect(await names("h6s1")).toEqual([]);
    expect((await names("h6coord", true)).sort()).toEqual(["Clara Coord", "Lia Professora", "Paulo Professor"]);
  });
  it("lista os módulos sem repetir (módulo e aula do mesmo professor)", async () => {
    await withContext(ctx(alpha), (c) => saveProfile(c, alpha, "h6prof", { headline: "x", bio: "", linkUrl: null, visible: true }));
    const t = (await withContext(ctx(alpha, "h6s1"), (c) => listTeachers(c, "h6s1", false)))[0];
    expect(t.modules).toEqual([{ name: "Módulo Único", cohort: "Turma 1" }]);
  });
});

describe("atendimento", () => {
  let thread: string;
  it("aluno abre conversa; valida assunto e mensagem; a equipe de atendimento é avisada", async () => {
    const open = (subject: string, body: string) => withContext(ctx(alpha, "h6s1"), (c) => openThread(c, { tenantId: alpha, userId: "h6s1", userName: "Ana Turma 1", subject, body }));
    expect((await open("ab", "oi")).ok).toBe(false);
    expect((await open("Segunda via do boleto", "  ")).ok).toBe(false);
    const out = await open("Segunda via do boleto", "Preciso da segunda via.");
    if (!out.ok) throw new Error("falhou");
    thread = out.id;
    const to = await withContext(ctx(alpha), async (c) => (await c.query("select user_id from notifications where kind = 'support' order by user_id")).rows.map((r) => r.user_id));
    expect(to).toContain("h6sec");
    expect(to).toContain("h6coord");
    expect(to).not.toContain("h6fin");
    expect(to).not.toContain("h6s1");
  });
  it("só o dono e a equipe veem a conversa", async () => {
    const get = (u: string, roles: string[], t = alpha) => withContext(ctx(t, u), (c) => getThread(c, thread, u, roles));
    expect(await get("h6s1", ["aluno"])).not.toBeNull();
    expect(await get("h6sec", ["secretaria"])).not.toBeNull();
    expect(await get("h6s2", ["aluno"])).toBeNull();
    expect(await get("h6fin", ["financeiro"])).toBeNull();
    expect(await get("h6sec", ["secretaria"], beta)).toBeNull();
    expect(isSupportStaff(["financeiro"])).toBe(false);
    expect(isSupportStaff(["admin"])).toBe(true);
  });
  it("resposta da equipe é marcada e avisa o aluno; outro aluno não responde", async () => {
    const r = await withContext(ctx(alpha, "h6sec"), (c) => reply(c, { tenantId: alpha, threadId: thread, userId: "h6sec", userName: "Sônia", roles: ["secretaria"], body: "Enviei por e-mail." }));
    expect(r.ok).toBe(true);
    const t = await withContext(ctx(alpha, "h6s1"), (c) => getThread(c, thread, "h6s1", ["aluno"]));
    expect(t!.messages.map((m) => [m.author, m.staff])).toEqual([["Ana Turma 1", false], ["Sônia Secretaria", true]]);
    const n = await withContext(ctx(alpha), async (c) => (await c.query("select message from notifications where user_id = 'h6s1' and kind = 'support'")).rows);
    expect(n).toHaveLength(1);
    expect((await withContext(ctx(alpha, "h6s2"), (c) => reply(c, { tenantId: alpha, threadId: thread, userId: "h6s2", userName: "Davi", roles: ["aluno"], body: "oi" }))).ok).toBe(false);
  });
  it("encerrar e reabrir: aluno escrevendo em conversa encerrada reabre", async () => {
    expect(await withContext(ctx(alpha, "h6sec"), (c) => setStatus(c, { threadId: thread, userId: "h6sec", roles: ["secretaria"], status: "closed" }))).toBe(true);
    expect((await withContext(ctx(alpha, "h6s1"), (c) => listThreads(c, "h6s1", ["aluno"], "open"))).length).toBe(0);
    expect((await withContext(ctx(alpha, "h6s1"), (c) => reply(c, { tenantId: alpha, threadId: thread, userId: "h6s1", userName: "Ana Turma 1", roles: ["aluno"], body: "Ainda não chegou." }))).ok).toBe(true);
    const open = await withContext(ctx(alpha, "h6sec"), (c) => listThreads(c, "h6sec", ["secretaria"], "open"));
    expect(open.map((t) => [t.subject, t.last_staff])).toEqual([["Segunda via do boleto", false]]);
    expect(await withContext(ctx(alpha, "h6s2"), (c) => setStatus(c, { threadId: thread, userId: "h6s2", roles: ["aluno"], status: "closed" }))).toBe(false);
  });
  it("aluno lista só as próprias conversas", async () => {
    await withContext(ctx(alpha, "h6s2"), (c) => openThread(c, { tenantId: alpha, userId: "h6s2", userName: "Davi", subject: "Dúvida de matrícula", body: "Posso trocar de turma?" }));
    expect((await withContext(ctx(alpha, "h6s1"), (c) => listThreads(c, "h6s1", ["aluno"]))).map((t) => t.subject)).toEqual(["Segunda via do boleto"]);
    expect((await withContext(ctx(alpha, "h6sec"), (c) => listThreads(c, "h6sec", ["secretaria"]))).length).toBe(2);
  });
});

describe("isolamento", () => {
  it("nada de comunicação aparece na outra instituição", async () => {
    const seen = await withContext(ctx(beta), async (c) => ({
      comments: (await c.query("select count(*)::int as n from lesson_comments")).rows[0].n,
      threads: (await c.query("select count(*)::int as n from support_threads")).rows[0].n,
      profiles: (await c.query("select count(*)::int as n from teacher_profiles")).rows[0].n,
      announcements: (await c.query("select count(*)::int as n from announcements where title like 'Só%' or title like 'Para%'")).rows[0].n,
    }));
    expect(seen).toEqual({ comments: 0, threads: 0, profiles: 0, announcements: 0 });
  });
});
