import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { createJoinUrl, endRoom, ensureRoom, roomNameFor } from "../video";
import { audit } from "./audit";
import { notify } from "./documents";
import { evaluateCohort } from "./grades";

export type LessonState = "scheduled" | "live" | "recorded" | "ended" | "canceled";
export const STATE_LABELS: Record<LessonState, string> = {
  scheduled: "Agendada", live: "Ao vivo agora", recorded: "Gravada", ended: "Encerrada", canceled: "Cancelada",
};

export function lessonState(l: { status: string; recording_id: string | null }): LessonState {
  if (l.status === "canceled") return "canceled";
  if (l.status === "live") return "live";
  if (l.status === "ended") return l.recording_id ? "recorded" : "ended";
  return "scheduled";
}

export const lessonTone = (s: LessonState) => (s === "live" ? "warn" : s === "recorded" ? "ok" : "muted") as "ok" | "warn" | "muted";

const TZ = "America/Sao_Paulo";
const isManager = (roles: string[]) => roles.some((r) => r === "admin" || r === "coordenacao");

/** Coordenação e administração gerenciam todas as aulas; o professor, só as próprias. */
export function canManageLesson(roles: string[], userId: string, lesson: { teacher_id: string | null }): boolean {
  return isManager(roles) || (roles.includes("professor") && lesson.teacher_id === userId);
}
export const canSchedule = isManager;

// ---------------------------------------------------------------- agendamento
export type LessonInput = { title: string; startsLocal: string; durationMinutes: number; teacherId: string | null };

async function teacherOk(c: PoolClient, teacherId: string | null): Promise<boolean> {
  if (!teacherId) return true;
  return ((await c.query(`select 1 from memberships where user_id = $1 and role in ('professor', 'coordenacao', 'admin')`, [teacherId])).rowCount ?? 0) > 0;
}

export async function scheduleLesson(
  c: PoolClient,
  input: LessonInput & { tenantId: string; cohortModuleId: string; actorId: string },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const mod = (await c.query<{ cohort_id: string }>("select cohort_id from cohort_modules where id = $1", [input.cohortModuleId])).rows[0];
  if (!mod) return { ok: false, error: "Módulo não encontrado." };
  if (!(await teacherOk(c, input.teacherId))) return { ok: false, error: "Esta pessoa não tem perfil de professor nesta instituição." };
  const { rows } = await c.query<{ id: string }>(
    `insert into lessons (tenant_id, cohort_id, cohort_module_id, title, starts_at, duration_minutes, teacher_id)
     values ($1, $2, $3, $4, ($5::timestamp at time zone '${TZ}'), $6, $7) returning id`,
    [input.tenantId, mod.cohort_id, input.cohortModuleId, input.title, input.startsLocal, input.durationMinutes, input.teacherId],
  );
  await audit(c, { tenantId: input.tenantId, actorUserId: input.actorId, action: "lesson_scheduled", entity: "lesson", entityId: rows[0].id });
  return { ok: true, id: rows[0].id };
}

export async function updateLesson(c: PoolClient, input: LessonInput & { lessonId: string }): Promise<{ ok: boolean; error?: string }> {
  if (!(await teacherOk(c, input.teacherId))) return { ok: false, error: "Esta pessoa não tem perfil de professor nesta instituição." };
  const n = await c.query(
    `update lessons set title = $2, starts_at = ($3::timestamp at time zone '${TZ}'), duration_minutes = $4, teacher_id = $5
     where id = $1 and status = 'scheduled'`,
    [input.lessonId, input.title, input.startsLocal, input.durationMinutes, input.teacherId],
  );
  return n.rowCount ? { ok: true } : { ok: false, error: "Só aulas agendadas podem ser editadas." };
}

export async function cancelLesson(c: PoolClient, lessonId: string, actorId: string, tenantId: string): Promise<boolean> {
  const n = await c.query(`update lessons set status = 'canceled' where id = $1 and status = 'scheduled'`, [lessonId]);
  if (n.rowCount) await audit(c, { tenantId, actorUserId: actorId, action: "lesson_canceled", entity: "lesson", entityId: lessonId });
  return (n.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------- sala
type LessonRow = { id: string; cohort_id: string; teacher_id: string | null; status: string; starts_at: Date; duration_minutes: number; room_name: string | null; room_url: string | null };

const loadLesson = async (c: PoolClient, lessonId: string, lock = false) =>
  (await c.query<LessonRow>(`select id, cohort_id, teacher_id, status, starts_at, duration_minutes, room_name, room_url from lessons where id = $1 ${lock ? "for update" : ""}`, [lessonId])).rows[0];

const roomExpiry = (l: LessonRow) => new Date(Math.max(l.starts_at.getTime() + l.duration_minutes * 60_000 + 3 * 3600_000, Date.now() + 2 * 3600_000));

/** O professor (ou a coordenação) inicia a aula: cria a sala e marca como ao vivo. */
export async function startLesson(c: PoolClient, input: { tenantId: string; userId: string; roles: string[]; lessonId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const l = await loadLesson(c, input.lessonId, true);
  if (!l) return { ok: false, error: "Aula não encontrada." };
  if (!canManageLesson(input.roles, input.userId, l)) return { ok: false, error: "Só o professor da aula ou a coordenação podem iniciar." };
  if (l.status === "canceled" || l.status === "ended") return { ok: false, error: "Esta aula já foi encerrada ou cancelada." };
  const name = l.room_name ?? roomNameFor(l.id);
  const room = await ensureRoom(name, roomExpiry(l));
  await c.query(`update lessons set status = 'live', started_at = coalesce(started_at, now()), room_name = $2, room_url = $3 where id = $1`, [l.id, name, room.url]);
  await audit(c, { tenantId: input.tenantId, actorUserId: input.userId, action: "lesson_started", entity: "lesson", entityId: l.id });
  return { ok: true };
}

export type RoomAccess = { kind: "manager" | "student"; enrollmentId: string | null };

/** Quem pode entrar: dono da aula e coordenação, ou aluno da turma com acesso liberado. */
export async function roomAccess(c: PoolClient, lessonId: string, userId: string, roles: string[]): Promise<RoomAccess | null> {
  const l = await loadLesson(c, lessonId);
  if (!l) return null;
  if (canManageLesson(roles, userId, l)) return { kind: "manager", enrollmentId: null };
  const e = (await c.query<{ id: string }>(`select id from enrollments where cohort_id = $1 and user_id = $2 and status = 'active' and stage = 'released'`, [l.cohort_id, userId])).rows[0];
  return e ? { kind: "student", enrollmentId: e.id } : null;
}

/** Link pessoal de entrada (expira). Só com a aula ao vivo. */
export async function joinUrlFor(c: PoolClient, input: { lessonId: string; userId: string; userName: string; owner: boolean }): Promise<string | null> {
  const l = await loadLesson(c, input.lessonId);
  if (!l || l.status !== "live" || !l.room_name || !l.room_url) return null;
  return createJoinUrl({ roomUrl: l.room_url, room: l.room_name, userId: input.userId, userName: input.userName, owner: input.owner, expiresAt: roomExpiry(l) });
}

/** Encerra a aula para todos. A presença fecha depois, com os ajustes do professor. */
export async function endLesson(c: PoolClient, input: { tenantId: string; userId: string; roles: string[]; lessonId: string }): Promise<{ ok: boolean; error?: string }> {
  const l = await loadLesson(c, input.lessonId, true);
  if (!l || !canManageLesson(input.roles, input.userId, l)) return { ok: false, error: "Sem permissão para encerrar esta aula." };
  if (l.status !== "live") return { ok: false, error: "A aula não está ao vivo." };
  if (l.room_name) await endRoom(l.room_name);
  await c.query(`update lessons set status = 'ended', ended_at = coalesce(ended_at, now()) where id = $1`, [l.id]);
  await audit(c, { tenantId: input.tenantId, actorUserId: input.userId, action: "lesson_ended", entity: "lesson", entityId: l.id });
  return { ok: true };
}

// ---------------------------------------------------------------- webhook do vídeo
export type VideoEvent = {
  type?: string;
  payload?: { user_id?: string; session_id?: string; duration?: number; end_ts?: number; recording_id?: string };
};

/** Aplica um aviso do provedor de vídeo. Idempotente: a mesma entrada (session_id) nunca soma duas vezes. */
export async function applyVideoEvent(c: PoolClient, tenantId: string, lessonId: string, event: VideoEvent): Promise<boolean> {
  const p = event.payload ?? {};
  if (event.type === "participant.left") {
    if (!p.user_id || !p.session_id || typeof p.duration !== "number") return false;
    const l = await loadLesson(c, lessonId);
    if (!l) return false;
    const e = (await c.query<{ id: string }>(`select id from enrollments where cohort_id = $1 and user_id = $2 and status = 'active'`, [l.cohort_id, p.user_id])).rows[0];
    if (!e) return false; // professor, coordenação ou pessoa fora da turma
    const seconds = Math.max(0, Math.round(p.duration));
    const fresh = await c.query(
      `insert into attendance_sessions (tenant_id, session_id, lesson_id, enrollment_id, seconds) values ($1, $2, $3, $4, $5) on conflict do nothing`,
      [tenantId, p.session_id, lessonId, e.id, seconds],
    );
    if (fresh.rowCount) {
      await c.query(
        `insert into attendance (tenant_id, lesson_id, enrollment_id, seconds) values ($1, $2, $3, $4)
         on conflict (lesson_id, enrollment_id) do update set seconds = attendance.seconds + excluded.seconds`,
        [tenantId, lessonId, e.id, seconds],
      );
    }
    return true;
  }
  if (event.type === "meeting.ended") {
    await c.query(
      `update lessons set status = 'ended', ended_at = coalesce(ended_at, to_timestamp($2)) where id = $1 and status in ('live', 'scheduled')`,
      [lessonId, p.end_ts ?? Date.now() / 1000],
    );
    return true;
  }
  if (event.type === "recording.ready-to-download") {
    if (!p.recording_id) return false;
    const done = await c.query(
      `update lessons set recording_id = $2, recording_seconds = $3 where id = $1 and recording_id is distinct from $2 returning title`,
      [lessonId, p.recording_id, Math.round((p as { duration?: number }).duration ?? 0)],
    );
    if (done.rowCount) {
      const students = (await c.query<{ user_id: string }>(
        `select e.user_id from enrollments e join lessons l on l.cohort_id = e.cohort_id where l.id = $1 and e.status = 'active' and e.stage = 'released'`, [lessonId],
      )).rows;
      for (const s of students) {
        await notify(c, { tenantId, userId: s.user_id, kind: "recording_ready", message: `A gravação da aula "${done.rows[0].title}" já está disponível.`, href: `/aula/${lessonId}` });
      }
    }
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- presença
export type AttendanceRow = { enrollment_id: string; student: string; seconds: number; override: boolean | null; present: boolean | null; auto_present: boolean };

/** Minutos exigidos: porcentagem do curso sobre o tempo real da aula (ou o previsto, se ainda não acabou). */
export async function presenceThreshold(c: PoolClient, lessonId: string): Promise<{ thresholdSeconds: number; percent: number; baseSeconds: number }> {
  const r = (await c.query<{ pct: number; base: number }>(
    `select p.min_attendance_percent as pct,
            coalesce(extract(epoch from (l.ended_at - l.started_at)), l.duration_minutes * 60)::int as base
     from lessons l join cohorts co on co.tenant_id = l.tenant_id and co.id = l.cohort_id
     join programs p on p.tenant_id = co.tenant_id and p.id = co.program_id where l.id = $1`, [lessonId],
  )).rows[0];
  return { thresholdSeconds: Math.ceil((r.base * r.pct) / 100), percent: r.pct, baseSeconds: r.base };
}

export async function attendanceFor(c: PoolClient, lessonId: string): Promise<{ rows: AttendanceRow[]; thresholdSeconds: number; percent: number }> {
  const t = await presenceThreshold(c, lessonId);
  const rows = (await c.query<Omit<AttendanceRow, "auto_present">>(
    `select e.id as enrollment_id, u.name as student, coalesce(a.seconds, 0) as seconds, a.override, a.present
     from lessons l join enrollments e on e.cohort_id = l.cohort_id and e.status = 'active' and e.stage = 'released'
     join "user" u on u.id = e.user_id left join attendance a on a.lesson_id = l.id and a.enrollment_id = e.id
     where l.id = $1 order by u.name`, [lessonId],
  )).rows;
  return { rows: rows.map((r) => ({ ...r, auto_present: r.seconds >= t.thresholdSeconds })), thresholdSeconds: t.thresholdSeconds, percent: t.percent };
}

export async function setOverride(c: PoolClient, input: { lessonId: string; enrollmentId: string; value: boolean | null }): Promise<boolean> {
  const l = (await c.query<{ presence_closed_at: Date | null; tenant_id: string }>("select presence_closed_at, tenant_id from lessons where id = $1", [input.lessonId])).rows[0];
  if (!l || l.presence_closed_at) return false;
  await c.query(
    `insert into attendance (tenant_id, lesson_id, enrollment_id, override) values ($1, $2, $3, $4)
     on conflict (lesson_id, enrollment_id) do update set override = excluded.override`,
    [l.tenant_id, input.lessonId, input.enrollmentId, input.value],
  );
  return true;
}

/** Fecha a presença: ajuste do professor vale; sem ajuste, vale o tempo mínimo. Não muda mais depois. */
export async function closePresence(c: PoolClient, input: { tenantId: string; lessonId: string; actorId: string }): Promise<{ ok: boolean; error?: string }> {
  const l = (await c.query<{ status: string; presence_closed_at: Date | null }>("select status, presence_closed_at from lessons where id = $1 for update", [input.lessonId])).rows[0];
  if (!l) return { ok: false, error: "Aula não encontrada." };
  if (l.status !== "ended") return { ok: false, error: "Encerre a aula antes de fechar a presença." };
  if (l.presence_closed_at) return { ok: false, error: "A presença já está fechada." };
  const t = await presenceThreshold(c, input.lessonId);
  await c.query(
    `insert into attendance (tenant_id, lesson_id, enrollment_id)
     select l.tenant_id, l.id, e.id from lessons l join enrollments e on e.cohort_id = l.cohort_id and e.status = 'active' and e.stage = 'released'
     where l.id = $1 on conflict do nothing`, [input.lessonId],
  );
  await c.query(`update attendance set present = coalesce(override, seconds >= $2) where lesson_id = $1`, [input.lessonId, t.thresholdSeconds]);
  await c.query(`update lessons set presence_closed_at = now() where id = $1`, [input.lessonId]);
  await audit(c, { tenantId: input.tenantId, actorUserId: input.actorId, action: "presence_closed", entity: "lesson", entityId: input.lessonId });
  const cohortId = (await c.query<{ cohort_id: string }>("select cohort_id from lessons where id = $1", [input.lessonId])).rows[0].cohort_id;
  await evaluateCohort(c, { tenantId: input.tenantId, cohortId, actorId: input.actorId }); // pode emitir certificados
  return { ok: true };
}

// ---------------------------------------------------------------- agenda e calendário
export type AgendaItem = {
  id: string; title: string; starts_at: Date; duration_minutes: number; status: string; recording_id: string | null;
  cohort_module_id: string; module_name: string; cohort_name: string; program_name: string; teacher_name: string | null;
};

/** Mesma fonte para a agenda geral, a do módulo e o calendário .ics. */
export async function agendaForUser(c: PoolClient, userId: string, moduleId: string | null = null): Promise<AgendaItem[]> {
  return (await c.query<AgendaItem>(
    `select l.id, l.title, l.starts_at, l.duration_minutes, l.status, l.recording_id, l.cohort_module_id,
            cm.name as module_name, co.name as cohort_name, pr.name as program_name, t.name as teacher_name
     from lessons l join cohort_modules cm on cm.tenant_id = l.tenant_id and cm.id = l.cohort_module_id
     join cohorts co on co.tenant_id = l.tenant_id and co.id = l.cohort_id
     join programs pr on pr.tenant_id = co.tenant_id and pr.id = co.program_id
     left join "user" t on t.id = l.teacher_id
     where (exists (select 1 from enrollments e where e.cohort_id = l.cohort_id and e.user_id = $1 and e.stage = 'released' and e.status = 'active')
            or l.teacher_id = $1)
       and ($2::uuid is null or l.cohort_module_id = $2)
     order by l.starts_at`, [userId, moduleId],
  )).rows;
}

export async function ensureCalendarToken(c: PoolClient, tenantId: string, userId: string, rotate = false): Promise<string> {
  if (!rotate) {
    const cur = (await c.query<{ token: string }>("select token from calendar_tokens where user_id = $1", [userId])).rows[0];
    if (cur) return cur.token;
  }
  const token = randomBytes(24).toString("base64url");
  await c.query(
    `insert into calendar_tokens (tenant_id, user_id, token) values ($1, $2, $3)
     on conflict (tenant_id, user_id) do update set token = excluded.token`, [tenantId, userId, token],
  );
  return token;
}
