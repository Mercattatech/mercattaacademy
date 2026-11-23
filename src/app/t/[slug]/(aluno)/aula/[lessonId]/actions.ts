"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/action-form";
import { withContext } from "@/lib/db";
import { memberForAction } from "@/lib/guards";
import { addComment, deleteComment } from "@/lib/services/communication";

export async function addCommentAction(slug: string, lessonId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const m = await memberForAction(slug);
  if ("error" in m) return m;
  const out = await withContext({ tenantId: m.tenant.id, userId: m.userId }, (c) =>
    addComment(c, { tenantId: m.tenant.id, lessonId, userId: m.userId, userName: m.userName, roles: m.roles, body: String(form.get("body") ?? "") }));
  if (!out.ok) return { error: out.error ?? "Não foi possível comentar." };
  revalidatePath(`/t/${slug}/aula/${lessonId}`);
  return { ok: "Comentário publicado." };
}

export async function deleteCommentAction(slug: string, lessonId: string, commentId: string, _: ActionState): Promise<ActionState> {
  const m = await memberForAction(slug);
  if ("error" in m) return m;
  const ok = await withContext({ tenantId: m.tenant.id, userId: m.userId }, (c) => deleteComment(c, { commentId, userId: m.userId, roles: m.roles }));
  if (!ok) return { error: "Você não pode apagar este comentário." };
  revalidatePath(`/t/${slug}/aula/${lessonId}`);
  return { ok: "Comentário apagado." };
}
