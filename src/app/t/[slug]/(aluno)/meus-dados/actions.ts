"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { withContext } from "@/lib/db";
import { memberForAction } from "@/lib/guards";
import { openThread } from "@/lib/services/support";

/** O pedido de exclusão vai para a secretaria como conversa de atendimento. */
export async function requestDeletionAction(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const m = await memberForAction(slug);
  if ("error" in m) return m;
  if (form.get("confirm") !== "on") return { error: "Marque a caixa para confirmar o pedido." };
  const out = await withContext({ tenantId: m.tenant.id, userId: m.userId }, (c) =>
    openThread(c, {
      tenantId: m.tenant.id, userId: m.userId, userName: m.userName,
      subject: "Pedido de exclusão de dados (LGPD)",
      body: "Peço a exclusão da minha conta e dos meus dados pessoais. Entendo que certificados emitidos, pagamentos e registros de auditoria podem ter guarda obrigatória.",
    }));
  if (!out.ok) return { error: out.error };
  redirect(`/t/${slug}/atendimento/${out.id}`);
}
