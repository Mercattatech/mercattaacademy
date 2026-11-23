import type { PoolClient } from "pg";
import { audit } from "./audit";
import { notify } from "./documents";
import { issueCertificate } from "./certificates";

const isManager = (roles: string[]) => roles.some((r) => r === "admin" || r === "coordenacao");

// ------------------------------------------------------------------ cálculo puro
export type ModuleInput = { moduleId: string; weightHours: number | null; assessments: { id: string; weight: number; max: number; score: number | null }[] };
export type Rules = { minGrade: number; minFrequencyPercent: number };
export type FrequencyInput = { held: number; closed: number; present: number };
export type Standing = {
  modules: { moduleId: string; average: number | null; complete: boolean; graded: number; total: number }[];
  finalGrade: number | null;
  frequency: number | null; // porcentagem
  complete: boolean;
  situation: "in_progress" | "approved" | "failed";
  reasons: ("grade" | "frequency")[];
  missing: string[]; // o que falta para fechar
};

export const round1 = (n: number) => Math.round(n * 10) / 10;
export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Regra de situação do aluno. Pura: recebe notas e presenças, devolve médias e situação. */
export function standingFor(modules: ModuleInput[], freq: FrequencyInput, rules: Rules): Standing {
  const out: Standing["modules"] = [];
  let sum = 0;
  let weights = 0;
  let allGraded = true;
  for (const m of modules) {
    if (m.assessments.length === 0) continue; // módulo sem avaliação não entra na média
    const graded = m.assessments.filter((a) => a.score !== null);
    const complete = graded.length === m.assessments.length;
    const w = m.assessments.reduce((s, a) => s + a.weight, 0);
    const avg = complete ? (m.assessments.reduce((s, a) => s + ((a.score as number) / a.max) * a.weight, 0) / w) * 10 : null;
    out.push({ moduleId: m.moduleId, average: avg, complete, graded: graded.length, total: m.assessments.length });
    if (!complete) allGraded = false;
    else {
      const mw = m.weightHours && m.weightHours > 0 ? m.weightHours : 1;
      sum += (avg as number) * mw;
      weights += mw;
    }
  }
  const hasAssessments = out.length > 0;
  const finalGrade = hasAssessments && allGraded && weights > 0 ? sum / weights : null;
  const presenceClosed = freq.held === freq.closed;
  const frequency = freq.closed > 0 ? (freq.present / freq.closed) * 100 : null;
  const missing: string[] = [];
  if (!hasAssessments) missing.push("avaliações");
  if (hasAssessments && !allGraded) missing.push("notas");
  if (!presenceClosed) missing.push("presença");
  if (freq.closed === 0 && presenceClosed) missing.push("aulas");
  const complete = missing.length === 0;
  const reasons: Standing["reasons"] = [];
  if (complete) {
    if ((finalGrade as number) + 1e-9 < rules.minGrade) reasons.push("grade");
    if ((frequency as number) + 1e-9 < rules.minFrequencyPercent) reasons.push("frequency");
  }
  return { modules: out, finalGrade, frequency, complete, situation: !complete ? "in_progress" : reasons.length ? "failed" : "approved", reasons, missing };
}

export const SITUATION_LABELS = { in_progress: "Em andamento", approved: "Aprovado", failed: "Reprovado" } as const;
export function reasonText(s: Standing): string {
  if (s.situation === "in_progress") return s.missing.length ? `Falta: ${s.missing.join(", ")}.` : "";
  if (s.situation === "failed") return s.reasons.map((r) => (r === "grade" ? "nota abaixo do mínimo" : "frequência abaixo do mínimo")).join(" e ") + ".";
  return "";
}

// ------------------------------------------------------------------ permissões
/** Quem lança notas de um módulo: coordenação e administração, ou o professor do módulo/de alguma aula dele. */
export async function canGradeModule(c: PoolClient, roles: string[], userId: string, cohortModuleId: string): Promise<boolean> {
  if (isManager(roles)) return true;
  if (!roles.includes("professor")) return false;
  const { rowCount } = await c.query(
    `select 1 from cohort_modules cm where cm.id = $1 and (cm.teacher_id = $2 or exists (select 1 from lessons l where l.cohort_module_id = cm.id and l.teacher_id = $2))`,
    [cohortModuleId, userId],
  );
  return (rowCount ?? 0) > 0;
}

// ------------------------------------------------------------------ avaliações
export type AssessmentInput = { title: string; weight: number; maxScore: number; dueOn: string | null };

export async function createAssessment(
  c: PoolClient, input: AssessmentInput & { tenantId: string; cohortModuleId: string; actorId: string },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const mod = (await c.query<{ cohort_id: string }>("select cohort_id from cohort_modules where id = $1", [input.cohortModuleId])).rows[0];
  if (!mod) return { ok: false, error: "Módulo não encontrado." };
  const { rows } = await c.query<{ id: string }>(
    `insert into assessments (tenant_id, cohort_id, cohort_module_id, title, weight, max_score, due_on, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [input.tenantId, mod.cohort_id, input.cohortModuleId, input.title, input.weight, input.maxScore, input.dueOn, input.actorId],
  );
  await audit(c, { tenantId: input.tenantId, actorUserId: input.actorId, action: "assessment_created", entity: "assessment", entityId: rows[0].id });
  return { ok: true, id: rows[0].id };
}

export async function updateAssessment(c: PoolClient, id: string, input: AssessmentInput & { tenantId: string; actorId: string }): Promise<{ ok: boolean; error?: string }> {
  const cur = (await c.query<{ max_score: string }>("select max_score from assessments where id = $1 for update", [id])).rows[0];
  if (!cur) return { ok: false, error: "Avaliação não encontrada." };
  if (input.maxScore < Number(cur.max_score)) {
    const over = await c.query("select 1 from grades where assessment_id = $1 and score > $2 limit 1", [id, input.maxScore]);
    if (over.rowCount) return { ok: false, error: "Há notas acima da nova nota máxima. Corrija essas notas antes." };
  }
  await c.query("update assessments set title = $2, weight = $3, max_score = $4, due_on = $5 where id = $1", [id, input.title, input.weight, input.maxScore, input.dueOn]);
  await audit(c, { tenantId: input.tenantId, actorUserId: input.actorId, action: "assessment_updated", entity: "assessment", entityId: id });
  return { ok: true };
}

export async function deleteAssessment(c: PoolClient, id: string, tenantId: string, actorId: string): Promise<boolean> {
  const n = await c.query("delete from assessments where id = $1", [id]);
  if (n.rowCount) await audit(c, { tenantId, actorUserId: actorId, action: "assessment_deleted", entity: "assessment", entityId: id });
  return (n.rowCount ?? 0) > 0;
}

// ------------------------------------------------------------------ lançamento
export type GradeRow = { enrollmentId: string; student: string; score: number | null };

export async function gradeSheet(c: PoolClient, assessmentId: string): Promise<GradeRow[]> {
  return (await c.query<{ enrollment_id: string; student: string; score: string | null }>(
    `select e.id as enrollment_id, u.name as student, g.score
     from assessments a join enrollments e on e.cohort_id = a.cohort_id and e.status = 'active' and e.stage = 'released'
     join "user" u on u.id = e.user_id
     left join grades g on g.assessment_id = a.id and g.enrollment_id = e.id
     where a.id = $1 order by u.name`, [assessmentId],
  )).rows.map((r) => ({ enrollmentId: r.enrollment_id, student: r.student, score: r.score === null ? null : Number(r.score) }));
}

/** Salva as notas da avaliação. `scores`: inscrição -> nota (null apaga). Avisa quem recebeu nota nova e reavalia a turma. */
export async function saveGrades(
  c: PoolClient,
  input: { tenantId: string; assessmentId: string; actorId: string; scores: Record<string, number | null> },
): Promise<{ ok: true; saved: number; issued: number } | { ok: false; error: string }> {
  const a = (await c.query<{ title: string; max_score: string; cohort_id: string }>("select title, max_score, cohort_id from assessments where id = $1", [input.assessmentId])).rows[0];
  if (!a) return { ok: false, error: "Avaliação não encontrada." };
  const max = Number(a.max_score);
  const allowed = new Set((await c.query<{ id: string }>(
    `select id from enrollments where cohort_id = $1 and status = 'active' and stage = 'released'`, [a.cohort_id])).rows.map((r) => r.id));
  for (const [enr, score] of Object.entries(input.scores)) {
    if (!allowed.has(enr)) return { ok: false, error: "Há aluno que não pertence a esta turma ou sem acesso liberado." };
    if (score !== null && (!Number.isFinite(score) || score < 0 || score > max)) return { ok: false, error: `A nota deve ficar entre 0 e ${max}.` };
  }
  let saved = 0;
  for (const [enr, score] of Object.entries(input.scores)) {
    const before = (await c.query<{ score: string }>("select score from grades where assessment_id = $1 and enrollment_id = $2", [input.assessmentId, enr])).rows[0];
    if (score === null) {
      if (before) { await c.query("delete from grades where assessment_id = $1 and enrollment_id = $2", [input.assessmentId, enr]); saved++; }
      continue;
    }
    if (before && Number(before.score) === score) continue;
    await c.query(
      `insert into grades (tenant_id, assessment_id, enrollment_id, score, graded_by) values ($1, $2, $3, $4, $5)
       on conflict (assessment_id, enrollment_id) do update set score = excluded.score, graded_by = excluded.graded_by, updated_at = now()`,
      [input.tenantId, input.assessmentId, enr, score, input.actorId],
    );
    saved++;
    const user = (await c.query<{ user_id: string }>("select user_id from enrollments where id = $1", [enr])).rows[0];
    await notify(c, { tenantId: input.tenantId, userId: user.user_id, kind: "grade_posted", message: `Nota lançada em "${a.title}".`, href: "/notas", enrollmentId: enr });
  }
  if (saved) await audit(c, { tenantId: input.tenantId, actorUserId: input.actorId, action: "grades_saved", entity: "assessment", entityId: input.assessmentId, data: { saved } });
  const issued = saved ? await evaluateCohort(c, { tenantId: input.tenantId, cohortId: a.cohort_id, actorId: input.actorId }) : 0;
  return { ok: true, saved, issued };
}

// ------------------------------------------------------------------ boletim, relatório e emissão
type Loaded = {
  rules: Rules;
  modules: { id: string; name: string; position: number; hours: number | null; assessments: { id: string; title: string; weight: number; max: number }[] }[];
  students: { enrollmentId: string; userId: string; name: string; scores: Map<string, number>; held: number; closed: number; present: number }[];
};

async function loadCohort(c: PoolClient, cohortId: string, onlyEnrollment?: string): Promise<Loaded | null> {
  const co = (await c.query<{ min_grade: string; min_frequency_percent: number }>(
    `select p.min_grade, p.min_frequency_percent from cohorts co join programs p on p.tenant_id = co.tenant_id and p.id = co.program_id where co.id = $1`, [cohortId])).rows[0];
  if (!co) return null;
  const mods = (await c.query<{ id: string; name: string; position: number; workload_hours: number | null }>(
    "select id, name, position, workload_hours from cohort_modules where cohort_id = $1 order by position", [cohortId])).rows;
  const ass = (await c.query<{ id: string; cohort_module_id: string; title: string; weight: string; max_score: string }>(
    "select id, cohort_module_id, title, weight, max_score from assessments where cohort_id = $1 order by created_at", [cohortId])).rows;
  const enrolls = (await c.query<{ id: string; user_id: string; name: string }>(
    `select e.id, e.user_id, u.name from enrollments e join "user" u on u.id = e.user_id
     where e.cohort_id = $1 and e.status = 'active' and e.stage = 'released' and ($2::uuid is null or e.id = $2) order by u.name`, [cohortId, onlyEnrollment ?? null])).rows;
  const grades = (await c.query<{ assessment_id: string; enrollment_id: string; score: string }>(
    `select g.assessment_id, g.enrollment_id, g.score from grades g join assessments a on a.id = g.assessment_id where a.cohort_id = $1`, [cohortId])).rows;
  const lessons = (await c.query<{ held: string; closed: string }>(
    `select count(*) filter (where status <> 'canceled') as held, count(*) filter (where status <> 'canceled' and presence_closed_at is not null) as closed from lessons where cohort_id = $1`, [cohortId])).rows[0];
  const present = (await c.query<{ enrollment_id: string; n: string }>(
    `select a.enrollment_id, count(*) as n from attendance a join lessons l on l.id = a.lesson_id
     where l.cohort_id = $1 and l.status <> 'canceled' and l.presence_closed_at is not null and a.present group by a.enrollment_id`, [cohortId])).rows;
  const presentBy = new Map(present.map((r) => [r.enrollment_id, Number(r.n)]));
  const byAssess = new Map<string, Map<string, number>>();
  for (const g of grades) {
    if (!byAssess.has(g.enrollment_id)) byAssess.set(g.enrollment_id, new Map());
    byAssess.get(g.enrollment_id)!.set(g.assessment_id, Number(g.score));
  }
  return {
    rules: { minGrade: Number(co.min_grade), minFrequencyPercent: co.min_frequency_percent },
    modules: mods.map((m) => ({ id: m.id, name: m.name, position: m.position, hours: m.workload_hours,
      assessments: ass.filter((a) => a.cohort_module_id === m.id).map((a) => ({ id: a.id, title: a.title, weight: Number(a.weight), max: Number(a.max_score) })) })),
    students: enrolls.map((e) => ({ enrollmentId: e.id, userId: e.user_id, name: e.name, scores: byAssess.get(e.id) ?? new Map(),
      held: Number(lessons.held), closed: Number(lessons.closed), present: presentBy.get(e.id) ?? 0 })),
  };
}

function standingOf(l: Loaded, s: Loaded["students"][number]): Standing {
  return standingFor(
    l.modules.map((m) => ({ moduleId: m.id, weightHours: m.hours, assessments: m.assessments.map((a) => ({ id: a.id, weight: a.weight, max: a.max, score: s.scores.get(a.id) ?? null })) })),
    { held: s.held, closed: s.closed, present: s.present }, l.rules,
  );
}

export type ReportRow = { enrollmentId: string; userId: string; student: string; standing: Standing; certificate: { id: string; code: string; revoked: boolean } | null };
export type CohortReport = { rules: Rules; modules: { id: string; name: string }[]; rows: ReportRow[] };

export async function cohortReport(c: PoolClient, cohortId: string): Promise<CohortReport | null> {
  const l = await loadCohort(c, cohortId);
  if (!l) return null;
  const certs = (await c.query<{ enrollment_id: string; id: string; code: string; revoked_at: Date | null }>(
    `select distinct on (enrollment_id) enrollment_id, id, code, revoked_at from certificates where enrollment_id = any($1::uuid[]) order by enrollment_id, revoked_at is not null, issued_at desc`,
    [l.students.map((s) => s.enrollmentId)])).rows;
  const by = new Map(certs.map((r) => [r.enrollment_id, r]));
  return {
    rules: l.rules,
    modules: l.modules.filter((m) => m.assessments.length > 0).map((m) => ({ id: m.id, name: m.name })),
    rows: l.students.map((s) => ({ enrollmentId: s.enrollmentId, userId: s.userId, student: s.name, standing: standingOf(l, s),
      certificate: by.get(s.enrollmentId) ? { id: by.get(s.enrollmentId)!.id, code: by.get(s.enrollmentId)!.code, revoked: !!by.get(s.enrollmentId)!.revoked_at } : null })),
  };
}

export type Boletim = {
  cohortId: string; enrollmentId: string; program: string; cohort: string; rules: Rules; standing: Standing;
  modules: { id: string; name: string; average: number | null; assessments: { id: string; title: string; weight: number; max: number; score: number | null }[] }[];
  certificate: { id: string; code: string; revoked: boolean; issuedAt: Date } | null;
};

/** Boletim de um aluno em todas as turmas em que tem acesso liberado. */
export async function boletimsFor(c: PoolClient, userId: string): Promise<Boletim[]> {
  const enr = (await c.query<{ id: string; cohort_id: string; cohort: string; program: string }>(
    `select e.id, e.cohort_id, co.name as cohort, p.name as program from enrollments e join cohorts co on co.tenant_id = e.tenant_id and co.id = e.cohort_id
     join programs p on p.tenant_id = co.tenant_id and p.id = co.program_id where e.user_id = $1 and e.status <> 'canceled' and e.stage = 'released' order by co.starts_on nulls last, co.name`, [userId])).rows;
  const out: Boletim[] = [];
  for (const e of enr) {
    const l = await loadCohort(c, e.cohort_id, e.id);
    const s = l?.students[0];
    if (!l || !s) continue;
    const st = standingOf(l, s);
    const cert = (await c.query<{ id: string; code: string; revoked_at: Date | null; issued_at: Date }>(
      "select id, code, revoked_at, issued_at from certificates where enrollment_id = $1 order by revoked_at is not null, issued_at desc limit 1", [e.id])).rows[0];
    out.push({
      cohortId: e.cohort_id, enrollmentId: e.id, program: e.program, cohort: e.cohort, rules: l.rules, standing: st,
      modules: l.modules.filter((m) => m.assessments.length > 0).map((m) => ({ id: m.id, name: m.name, average: st.modules.find((x) => x.moduleId === m.id)?.average ?? null,
        assessments: m.assessments.map((a) => ({ ...a, score: s.scores.get(a.id) ?? null })) })),
      certificate: cert ? { id: cert.id, code: cert.code, revoked: !!cert.revoked_at, issuedAt: cert.issued_at } : null,
    });
  }
  return out;
}

/** Reavalia os alunos da turma e emite o certificado de quem passou a Aprovado. Devolve quantos emitiu. */
export async function evaluateCohort(c: PoolClient, input: { tenantId: string; cohortId: string; actorId: string | null }): Promise<number> {
  const l = await loadCohort(c, input.cohortId);
  if (!l) return 0;
  let issued = 0;
  for (const s of l.students) {
    const st = standingOf(l, s);
    if (st.situation !== "approved") continue;
    const r = await issueCertificate(c, { tenantId: input.tenantId, enrollmentId: s.enrollmentId, finalGrade: round2(st.finalGrade as number), frequencyPercent: round1(st.frequency as number), actorId: input.actorId });
    if (r.created) issued++;
  }
  return issued;
}
