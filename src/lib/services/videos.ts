import type { PoolClient } from "pg";
import { VIDEO_TYPES } from "../storage";

/** Quem envia e organiza os vídeos de um módulo: coordenação e administração. */
export const canManageVideos = (roles: string[]) => roles.some((r) => r === "admin" || r === "coordenacao");

export const VIDEO_EXT: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };

export function isVideoType(t: string): t is (typeof VIDEO_TYPES)[number] {
  return (VIDEO_TYPES as readonly string[]).includes(t);
}

export const videoKey = (tenantId: string, moduleId: string, videoId: string, contentType: string) =>
  `${tenantId}/videos/${moduleId}/${videoId}.${VIDEO_EXT[contentType] ?? "mp4"}`;

export type VideoRow = {
  id: string;
  module_id: string;
  position: number;
  title: string;
  description: string;
  storage_key: string;
  content_type: string;
  size_bytes: string; // bigint chega como texto
  status: "uploading" | "ready";
  created_at: Date;
};

export async function videosOfModule(c: PoolClient, moduleId: string): Promise<VideoRow[]> {
  return (await c.query<VideoRow>(`select * from module_videos where module_id = $1 order by position`, [moduleId])).rows;
}

/**
 * Aluno com acesso: matrícula ativa e liberada numa turma do curso a que o módulo pertence.
 * (Equipe da instituição é conferida à parte, pelo perfil.)
 */
export async function studentCanWatch(c: PoolClient, moduleId: string, userId: string): Promise<boolean> {
  const r = await c.query(
    `select 1 from enrollments e
       join cohorts co on co.tenant_id = e.tenant_id and co.id = e.cohort_id
       join program_modules m on m.tenant_id = co.tenant_id and m.program_id = co.program_id
      where m.id = $1 and e.user_id = $2 and e.status = 'active' and e.stage = 'released'
      limit 1`,
    [moduleId, userId],
  );
  return (r.rowCount ?? 0) > 0;
}

export type StudentVideoGroup = {
  program_id: string;
  program_name: string;
  module_id: string;
  module_name: string;
  module_position: number;
  videos: { id: string; title: string; description: string; position: number; progress: Progress | null }[];
};

/** Vídeos prontos dos cursos em que o aluno tem acesso liberado, agrupados por curso e módulo. */
export async function videosForStudent(c: PoolClient, userId: string): Promise<StudentVideoGroup[]> {
  const progress = await progressOfUser(c, userId);
  const rows = (
    await c.query<{
      program_id: string; program_name: string; module_id: string; module_name: string; module_position: number;
      video_id: string; title: string; description: string; position: number;
    }>(
      `select p.id as program_id, p.name as program_name, m.id as module_id, m.name as module_name, m.position as module_position,
              v.id as video_id, v.title, v.description, v.position
         from module_videos v
         join program_modules m on m.tenant_id = v.tenant_id and m.id = v.module_id
         join programs p on p.tenant_id = m.tenant_id and p.id = m.program_id
        where v.status = 'ready'
          and exists (
            select 1 from enrollments e join cohorts co on co.tenant_id = e.tenant_id and co.id = e.cohort_id
             where co.program_id = p.id and e.user_id = $1 and e.status = 'active' and e.stage = 'released')
        order by p.name, m.position, v.position`,
      [userId],
    )
  ).rows;
  const groups = new Map<string, StudentVideoGroup>();
  for (const r of rows) {
    const g = groups.get(r.module_id) ?? {
      program_id: r.program_id, program_name: r.program_name, module_id: r.module_id, module_name: r.module_name, module_position: r.module_position, videos: [],
    };
    g.videos.push({ id: r.video_id, title: r.title, description: r.description, position: r.position, progress: progress.get(r.video_id) ?? null });
    groups.set(r.module_id, g);
  }
  return [...groups.values()];
}

// ---------------------------------------------------------------- progresso ("assistido")
/** Considera assistido ao chegar a este trecho do vídeo (ou ao fim). */
export const WATCHED_FRACTION = 0.9;

export type Progress = { position: number; duration: number; completed: boolean };

/**
 * Grava onde o aluno parou. Só vale para aluno com acesso liberado (equipe não conta).
 * Concluído não volta atrás: assistir de novo não apaga o "assistido".
 */
export async function saveProgress(
  c: PoolClient,
  input: { tenantId: string; userId: string; videoId: string; position: number; duration: number; ended: boolean },
): Promise<{ completed: boolean } | null> {
  const v = (await c.query<{ module_id: string }>("select module_id from module_videos where id = $1 and status = 'ready'", [input.videoId])).rows[0];
  if (!v || !(await studentCanWatch(c, v.module_id, input.userId))) return null;
  const duration = Math.max(0, Math.round(input.duration));
  const position = Math.min(Math.max(0, Math.round(input.position)), duration || Math.round(input.position));
  const done = input.ended || (duration > 0 && position >= duration * WATCHED_FRACTION);
  const r = await c.query<{ completed: boolean }>(
    `insert into module_video_progress (tenant_id, video_id, user_id, position_seconds, duration_seconds, completed_at)
     values ($1, $2, $3, $4, $5, case when $6 then now() end)
     on conflict (video_id, user_id) do update set
       position_seconds = excluded.position_seconds,
       duration_seconds = excluded.duration_seconds,
       completed_at = coalesce(module_video_progress.completed_at, excluded.completed_at),
       updated_at = now()
     returning completed_at is not null as completed`,
    [input.tenantId, input.videoId, input.userId, position, duration, done],
  );
  return { completed: r.rows[0].completed };
}

/** Progresso do aluno em todos os vídeos, por id do vídeo. */
export async function progressOfUser(c: PoolClient, userId: string): Promise<Map<string, Progress>> {
  const rows = (
    await c.query<{ video_id: string; position_seconds: number; duration_seconds: number; completed_at: Date | null }>(
      "select video_id, position_seconds, duration_seconds, completed_at from module_video_progress where user_id = $1",
      [userId],
    )
  ).rows;
  return new Map(rows.map((r) => [r.video_id, { position: r.position_seconds, duration: r.duration_seconds, completed: r.completed_at != null }]));
}

export type ModuleReport = {
  students: { user_id: string; name: string; cohort: string; watched: number; inProgress: number; perVideo: Record<string, "done" | "partial" | "none"> }[];
  perVideo: Record<string, { done: number }>;
  total: number;
};

/** Quem assistiu o quê num módulo: alunos com acesso liberado nas turmas do curso. */
export async function moduleReport(c: PoolClient, moduleId: string, videoIds: string[]): Promise<ModuleReport> {
  const students = (
    await c.query<{ user_id: string; name: string; cohort: string }>(
      `select distinct on (u.id) u.id as user_id, u.name, co.name as cohort
         from program_modules m
         join cohorts co on co.tenant_id = m.tenant_id and co.program_id = m.program_id
         join enrollments e on e.tenant_id = co.tenant_id and e.cohort_id = co.id and e.status = 'active' and e.stage = 'released'
         join "user" u on u.id = e.user_id
        where m.id = $1
        order by u.id, co.created_at desc`,
      [moduleId],
    )
  ).rows;
  const prog = videoIds.length
    ? (
        await c.query<{ video_id: string; user_id: string; completed: boolean; position_seconds: number }>(
          "select video_id, user_id, completed_at is not null as completed, position_seconds from module_video_progress where video_id = any($1)",
          [videoIds],
        )
      ).rows
    : [];
  const byKey = new Map(prog.map((p) => [`${p.video_id}:${p.user_id}`, p]));
  const perVideo: ModuleReport["perVideo"] = Object.fromEntries(videoIds.map((id) => [id, { done: 0 }]));
  const rows = students
    .map((s) => {
      const per: Record<string, "done" | "partial" | "none"> = {};
      let watched = 0;
      let inProgress = 0;
      for (const id of videoIds) {
        const p = byKey.get(`${id}:${s.user_id}`);
        per[id] = p?.completed ? "done" : p && p.position_seconds > 0 ? "partial" : "none";
        if (per[id] === "done") {
          watched++;
          perVideo[id].done++;
        } else if (per[id] === "partial") inProgress++;
      }
      return { ...s, watched, inProgress, perVideo: per };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return { students: rows, perVideo, total: students.length };
}
