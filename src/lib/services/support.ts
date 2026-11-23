import type { PoolClient } from "pg";
import { notify } from "./documents";

export const SUPPORT_ROLES = ["secretaria", "coordenacao"] as const; // admin sempre pode
export const isSupportStaff = (roles: string[]) => roles.some((r) => r === "admin" || (SUPPORT_ROLES as readonly string[]).includes(r));

export type ThreadRow = { id: string; user_id: string; student: string; subject: string; status: string; created_at: Date; last_message_at: Date; last_staff: boolean | null };
export type MessageRow = { id: string; author: string; staff: boolean; body: string; created_at: Date };

async function notifySupportStaff(c: PoolClient, tenantId: string, message: string, href: string, exceptUserId?: string) {
  const { rows } = await c.query<{ user_id: string }>(`select distinct user_id from memberships where tenant_id = $1 and role in ('secretaria', 'coordenacao', 'admin')`, [tenantId]);
  for (const r of rows) if (r.user_id !== exceptUserId) await notify(c, { tenantId, userId: r.user_id, kind: "support", message, href });
}

export async function openThread(
  c: PoolClient, input: { tenantId: string; userId: string; userName: string; subject: string; body: string },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (subject.length < 3) return { ok: false, error: "Escreva o assunto (mínimo de 3 letras)." };
  if (subject.length > 140) return { ok: false, error: "O assunto pode ter até 140 caracteres." };
  if (!body) return { ok: false, error: "Escreva sua mensagem." };
  if (body.length > 4000) return { ok: false, error: "A mensagem pode ter até 4.000 caracteres." };
  const id = (await c.query<{ id: string }>("insert into support_threads (tenant_id, user_id, subject) values ($1, $2, $3) returning id", [input.tenantId, input.userId, subject])).rows[0].id;
  await c.query("insert into support_messages (tenant_id, thread_id, author_id, staff, body) values ($1, $2, $3, false, $4)", [input.tenantId, id, input.userId, body]);
  await notifySupportStaff(c, input.tenantId, `${input.userName} abriu um atendimento: ${subject}`, `/atendimento/${id}`);
  return { ok: true, id };
}

export async function getThread(c: PoolClient, id: string, userId: string, roles: string[]): Promise<{ thread: ThreadRow; messages: MessageRow[]; canReply: boolean } | null> {
  const staff = isSupportStaff(roles);
  const thread = (await c.query<ThreadRow>(
    `select t.id, t.user_id, u.name as student, t.subject, t.status, t.created_at, t.last_message_at, null::boolean as last_staff
     from support_threads t join "user" u on u.id = t.user_id where t.id = $1 and ($2::boolean or t.user_id = $3)`, [id, staff, userId])).rows[0];
  if (!thread) return null;
  const messages = (await c.query<MessageRow>(
    `select m.id, u.name as author, m.staff, m.body, m.created_at from support_messages m join "user" u on u.id = m.author_id where m.thread_id = $1 order by m.created_at, m.id`, [id])).rows;
  return { thread, messages, canReply: true };
}

export async function listThreads(c: PoolClient, userId: string, roles: string[], status: "open" | "closed" | "all" = "all"): Promise<ThreadRow[]> {
  return (await c.query<ThreadRow>(
    `select t.id, t.user_id, u.name as student, t.subject, t.status, t.created_at, t.last_message_at,
            (select m.staff from support_messages m where m.thread_id = t.id order by m.created_at desc, m.id desc limit 1) as last_staff
     from support_threads t join "user" u on u.id = t.user_id
     where ($1::boolean or t.user_id = $2) and ($3 = 'all' or t.status = $3) order by t.last_message_at desc limit 200`,
    [isSupportStaff(roles), userId, status])).rows;
}

/** Responde na conversa. Aluno só na própria (e reabre se estava encerrada); equipe em qualquer uma. */
export async function reply(
  c: PoolClient, input: { tenantId: string; threadId: string; userId: string; userName: string; roles: string[]; body: string },
): Promise<{ ok: boolean; error?: string }> {
  const body = input.body.trim();
  if (!body) return { ok: false, error: "Escreva a mensagem." };
  if (body.length > 4000) return { ok: false, error: "A mensagem pode ter até 4.000 caracteres." };
  const staff = isSupportStaff(input.roles);
  const t = (await c.query<{ user_id: string; subject: string }>("select user_id, subject from support_threads where id = $1 for update", [input.threadId])).rows[0];
  if (!t || (!staff && t.user_id !== input.userId)) return { ok: false, error: "Conversa não encontrada." };
  const asStaff = staff && t.user_id !== input.userId; // equipe falando na conversa de outra pessoa
  await c.query("insert into support_messages (tenant_id, thread_id, author_id, staff, body) values ($1, $2, $3, $4, $5)", [input.tenantId, input.threadId, input.userId, asStaff, body]);
  await c.query("update support_threads set last_message_at = now(), status = 'open' where id = $1", [input.threadId]);
  if (asStaff) await notify(c, { tenantId: input.tenantId, userId: t.user_id, kind: "support", message: `A secretaria respondeu: ${t.subject}`, href: `/atendimento/${input.threadId}` });
  else await notifySupportStaff(c, input.tenantId, `${input.userName} respondeu: ${t.subject}`, `/atendimento/${input.threadId}`, input.userId);
  return { ok: true };
}

export async function setStatus(c: PoolClient, input: { threadId: string; userId: string; roles: string[]; status: "open" | "closed" }): Promise<boolean> {
  const staff = isSupportStaff(input.roles);
  const n = await c.query("update support_threads set status = $2 where id = $1 and ($3::boolean or user_id = $4)", [input.threadId, input.status, staff, input.userId]);
  return (n.rowCount ?? 0) > 0;
}
