"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/components/action-form";
import { withContext } from "@/lib/db";
import { staffForAction } from "@/lib/guards";
import { saveProfile } from "@/lib/services/communication";

const schema = z.object({
  headline: z.string().trim().max(120, "O título pode ter até 120 caracteres."),
  bio: z.string().trim().max(2000, "A apresentação pode ter até 2.000 caracteres."),
  linkUrl: z.preprocess((v) => (v === "" || v == null ? null : v), z.string().trim().max(300).nullable()),
});

export async function saveProfileAction(slug: string, userId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const s = await staffForAction(slug, ["coordenacao", "professor"]);
  if ("error" in s) return s;
  const manager = s.roles.some((r) => r === "admin" || r === "coordenacao");
  if (!manager && s.userId !== userId) return { error: "Você só edita o seu próprio perfil." };
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const out = await withContext({ tenantId: s.tenant.id, userId: s.userId }, (c) => saveProfile(c, s.tenant.id, userId, { ...parsed.data, visible: form.get("visible") === "on" }));
  if (!out.ok) return { error: out.error ?? "Não foi possível salvar." };
  revalidatePath(`/t/${slug}/professores`);
  revalidatePath(`/t/${slug}/admin/professores`);
  return { ok: "Perfil salvo." };
}
