"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/action-form";
import { withContext } from "@/lib/db";
import { ensureCalendarToken } from "@/lib/services/lessons";
import { getSession } from "@/lib/session";
import { resolveTenant } from "@/lib/tenant";

/** Troca o endereço secreto do calendário (o antigo deixa de funcionar). */
export async function rotateCalendarAction(slug: string, _: ActionState): Promise<ActionState> {
  const tenant = await resolveTenant(slug);
  const session = await getSession();
  if (!tenant || !session) return { error: "Sua sessão expirou. Entre de novo." };
  await withContext({ tenantId: tenant.id, userId: session.user.id }, (c) => ensureCalendarToken(c, tenant.id, session.user.id, true));
  revalidatePath(`/t/${slug}/aulas`);
  return { ok: "Novo endereço gerado. Assine de novo no seu calendário." };
}
