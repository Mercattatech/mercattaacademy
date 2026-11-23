import type { PoolClient } from "pg";
import { audit } from "./audit";
import { notify } from "./documents";
import { roomAccess } from "./lessons";

// ------------------------------------------------------------------ avisos
export type AnnouncementRow = { id: string; title: string; body: string; published_at: Date; cohort_id: string | null; cohort_name: string | null };

/** Equipe vê todos; aluno vê os gerais e os das turmas em que está. */
export async function visibleAnnouncements(c: PoolClient, userId: string, staff: boolean, limit = 50): Promise<AnnouncementRow[]> {
  return (await c.query<AnnouncementRow>(
    `select a.id, a.title, a.body, a.published_at, a.cohort_id, co.name as cohort_name
     from announcements a left join cohorts co on co.tenant_id = a.tenant_id and co.id = a.cohort_id
     where $2::boolean or a.cohort_id is null
        or exists (select 1 from enrollments e where e.cohort_id = a.cohort_id and e.user_id = $1 and e.status <> 'canceled')
     order by a.published_at desc limit $3`, [userId, staff, limit],
  )).rows;
}

/** Publica o aviso e notifica os alunos liberados (da turma ou de todas). Devolve quem deve receber e-mail. */
export async function postAnnouncement(
  c: PoolClient,
  input: { tenantId: string; actorId: string; title: string; body: string; cohortId: string | null },
): Promise<{ ok: true; id: string; recipients: { userId: string; email: string; name: string }[] } | { ok: false; error: string }> {
  if (input.cohortId) {
    const ok = (await c.query("select 1 from cohorts where id = $1", [input.cohortId])).rowCount;
    if (!ok) return { ok: false, error: "Turma não encontrada." };
  }
  const id = (await c.query<{ id: string }>(
    "insert into announcements (tenant_id, title, body, created_by, cohort_id) values ($1, $2, $3, $4, $5) returning id",
    [input.tenantId, input.title, input.body, input.actorId, input.cohortId],
  )).rows[0].id;
  const recipients = (await c.query<{ user_id: string; email: string; name: string }>(
    `select distinct u.id as user_id, u.email, u.name from enrollments e join "user" u on u.id = e.user_id
     where e.status = 'active' and e.stage = 'released' and ($1::uuid is null or e.cohort_id = $1)`, [input.cohortId],
  )).rows;
  for (const r of recipients) await notify(c, { tenantId: input.tenantId, userId: r.user_id, kind: "announcement", message: `Novo aviso: ${input.title}`, href: "/" });
  await audit(c, { tenantId: input.tenantId, actorUserId: input.actorId, action: "announcement_posted", entity: "announcement", entityId: id, data: { cohortId: input.cohortId, recipients: recipients.length } });
  return { ok: true, id, recipients: recipients.map((r) => ({ userId: r.user_id, email: r.email, name: r.name })) };
}

// ------------------------------------------------------------------ notificações
export type NotificationRow = { id: string; kind: string; message: string; href: string | null; read_at: Date | null; created_at: Date };

export async function listNotifications(c: PoolClient, userId: string, limit = 100): Promise<NotificationRow[]> {
  return (await c.query<NotificationRow>(
    "select id, kind, message, href, read_at, created_at from notifications where user_id = $1 order by created_at desc limit $2", [userId, limit])).rows;
}
export async function unreadCount(c: PoolClient, userId: string): Promise<number> {
  return (await c.query<{ n: number }>("select count(*)::int as n from notifications where user_id = $1 and read_at is null", [userId])).rows[0].n;
}
export async function markRead(c: PoolClient, userId: string, id: string | null): Promise<number> {
  const n = await c.query("update notifications set read_at = now() where user_id = $1 and read_at is null and ($2::uuid is null or id = $2)", [userId, id]);
  return n.rowCount ?? 0;
}

// ------------------------------------------------------------------ comentários por aula
export type CommentRow = { id: string; user_id: string; author: string; body: string; created_at: Date; is_teacher: boolean };

export async function listComments(c: PoolClient, lessonId: string): Promise<CommentRow[]> {
  return (await c.query<CommentRow>(
    `select lc.id, lc.user_id, u.name as author, lc.body, lc.created_at, (lc.user_id = l.teacher_id) as is_teacher
     from lesson_comments lc join "user" u on u.id = lc.user_id join lessons l on l.tenant_id = lc.tenant_id and l.id = lc.lesson_id
     where lc.lesson_id = $1 order by lc.created_at`, [lessonId])).rows;
}

export async function addComment(
  c: PoolClient, input: { tenantId: string; lessonId: string; userId: string; userName: string; roles: string[]; body: string },
): Promise<{ ok: boolean; error?: string }> {
  const body = input.body.trim();
  if (!body) return { ok: false, error: "Escreva o comentário." };
  if (body.length > 2000) return { ok: false, error: "O comentário pode ter até 2.000 caracteres." };
  const access = await roomAccess(c, input.lessonId, input.userId, input.roles);
  if (!access) return { ok: false, error: "Você não tem acesso a esta aula." };
  await c.query("insert into lesson_comments (tenant_id, lesson_id, user_id, body) values ($1, $2, $3, $4)", [input.tenantId, input.lessonId, input.userId, body]);
  const l = (await c.query<{ teacher_id: string | null; title: string }>("select teacher_id, title from lessons where id = $1", [input.lessonId])).rows[0];
  if (access.kind === "student" && l.teacher_id && l.teacher_id !== input.userId) {
    await notify(c, { tenantId: input.tenantId, userId: l.teacher_id, kind: "lesson_comment", message: `${input.userName} comentou na aula "${l.title}".`, href: `/aula/${input.lessonId}` });
  }
  return { ok: true };
}

export async function deleteComment(c: PoolClient, input: { commentId: string; userId: string; roles: string[] }): Promise<boolean> {
  const row = (await c.query<{ user_id: string; teacher_id: string | null }>(
    `select lc.user_id, l.teacher_id from lesson_comments lc join lessons l on l.tenant_id = lc.tenant_id and l.id = lc.lesson_id where lc.id = $1`, [input.commentId])).rows[0];
  if (!row) return false;
  const manager = input.roles.some((r) => r === "admin" || r === "coordenacao") || (input.roles.includes("professor") && row.teacher_id === input.userId);
  if (row.user_id !== input.userId && !manager) return false;
  return ((await c.query("delete from lesson_comments where id = $1", [input.commentId])).rowCount ?? 0) > 0;
}

// ------------------------------------------------------------------ professores
export type TeacherProfile = { user_id: string; name: string; headline: string; bio: string; link_url: string | null; visible: boolean };

export async function getProfile(c: PoolClient, userId: string): Promise<TeacherProfile | null> {
  return (await c.query<TeacherProfile>(
    `select u.id as user_id, u.name, coalesce(p.headline, '') as headline, coalesce(p.bio, '') as bio, p.link_url, coalesce(p.visible, true) as visible
     from "user" u left join teacher_profiles p on p.user_id = u.id where u.id = $1`, [userId])).rows[0] ?? null;
}

export async function saveProfile(
  c: PoolClient, tenantId: string, userId: string, input: { headline: string; bio: string; linkUrl: string | null; visible: boolean },
): Promise<{ ok: boolean; error?: string }> {
  const isTeacher = (await c.query("select 1 from memberships where user_id = $1 and role in ('professor', 'coordenacao', 'admin')", [userId])).rowCount;
  if (!isTeacher) return { ok: false, error: "Esta pessoa não tem perfil de professor nesta instituição." };
  if (input.linkUrl && !/^https?:\/\/\S+$/.test(input.linkUrl)) return { ok: false, error: "O link deve começar com http:// ou https://." };
  await c.query(
    `insert into teacher_profiles (tenant_id, user_id, headline, bio, link_url, visible) values ($1, $2, $3, $4, $5, $6)
     on conflict (tenant_id, user_id) do update set headline = excluded.headline, bio = excluded.bio, link_url = excluded.link_url, visible = excluded.visible, updated_at = now()`,
    [tenantId, userId, input.headline, input.bio, input.linkUrl, input.visible],
  );
  return { ok: true };
}

export type TeacherCard = TeacherProfile & { modules: { name: string; cohort: string }[] };

/** Professores com módulos: o aluno vê quem dá aula nas suas turmas (e só perfis visíveis); a equipe vê todos. */
export async function listTeachers(c: PoolClient, userId: string, staff: boolean): Promise<TeacherCard[]> {
  const rows = (await c.query<TeacherProfile & { module_name: string | null; cohort_name: string | null }>(
    `with links as (
       select cm.teacher_id as user_id, cm.id as module_id, cm.cohort_id from cohort_modules cm where cm.teacher_id is not null
       union
       select l.teacher_id, l.cohort_module_id, l.cohort_id from lessons l where l.teacher_id is not null and l.status <> 'canceled'
     )
     select u.id as user_id, u.name, coalesce(p.headline, '') as headline, coalesce(p.bio, '') as bio, p.link_url, coalesce(p.visible, true) as visible,
            cm.name as module_name, co.name as cohort_name
     from "user" u
     left join teacher_profiles p on p.user_id = u.id
     left join links k on k.user_id = u.id
     left join cohort_modules cm on cm.id = k.module_id
     left join cohorts co on co.id = k.cohort_id
     where exists (select 1 from memberships m where m.user_id = u.id and m.role in ('professor', 'coordenacao', 'admin'))
       and ($2::boolean or (coalesce(p.visible, true) and k.user_id is not null
            and exists (select 1 from enrollments e where e.cohort_id = k.cohort_id and e.user_id = $1 and e.status <> 'canceled' and e.stage = 'released')))
     order by u.name, co.name, cm.position`, [userId, staff])).rows;
  const map = new Map<string, TeacherCard>();
  for (const r of rows) {
    if (!map.has(r.user_id)) map.set(r.user_id, { user_id: r.user_id, name: r.name, headline: r.headline, bio: r.bio, link_url: r.link_url, visible: r.visible, modules: [] });
    if (r.module_name && !map.get(r.user_id)!.modules.some((m) => m.name === r.module_name && m.cohort === r.cohort_name)) {
      map.get(r.user_id)!.modules.push({ name: r.module_name, cohort: r.cohort_name ?? "" });
    }
  }
  return [...map.values()];
}
