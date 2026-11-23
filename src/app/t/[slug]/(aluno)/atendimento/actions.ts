"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { withContext } from "@/lib/db";
import { memberForAction } from "@/lib/guards";
import { openThread, reply, setStatus } from "@/lib/services/support";

export async function openThreadAction(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const m = await memberForAction(slug);
  if ("error" in m) return m;
  const out = await withContext({ tenantId: m.tenant.id, userId: m.userId }, (c) =>
    openThread(c, { tenantId: m.tenant.id, userId: m.userId, userName: m.userName, subject: String(form.get("subject") ?? ""), body: String(form.get("body") ?? "") }));
  if (!out.ok) return { error: out.error };
  revalidatePath(`/t/${slug}/atendimento`);
  redirect(`/t/${slug}/atendimento/${out.id}`);
}

export async function replyAction(slug: string, threadId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const m = await memberForAction(slug);
  if ("error" in m) return m;
  const out = await withContext({ tenantId: m.tenant.id, userId: m.userId }, (c) =>
    reply(c, { tenantId: m.tenant.id, threadId, userId: m.userId, userName: m.userName, roles: m.roles, body: String(form.get("body") ?? "") }));
  if (!out.ok) return { error: out.error ?? "Não foi possível enviar." };
  revalidatePath(`/t/${slug}/atendimento/${threadId}`);
  revalidatePath(`/t/${slug}/admin`, "layout");
  return { ok: "Mensagem enviada." };
}

export async function statusAction(slug: string, threadId: string, status: "open" | "closed", _: ActionState): Promise<ActionState> {
  const m = await memberForAction(slug);
  if ("error" in m) return m;
  const ok = await withContext({ tenantId: m.tenant.id, userId: m.userId }, (c) => setStatus(c, { threadId, userId: m.userId, roles: m.roles, status }));
  if (!ok) return { error: "Conversa não encontrada." };
  revalidatePath(`/t/${slug}/atendimento/${threadId}`);
  revalidatePath(`/t/${slug}/admin`, "layout");
  return { ok: status === "closed" ? "Conversa encerrada." : "Conversa reaberta." };
}
