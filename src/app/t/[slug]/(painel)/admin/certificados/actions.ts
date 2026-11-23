"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/components/action-form";
import { withContext } from "@/lib/db";
import { staffForAction } from "@/lib/guards";
import { revokeCertificate, saveSettings } from "@/lib/services/certificates";

const settingsSchema = z.object({
  signerName: z.string().trim().max(120),
  signerTitle: z.string().trim().max(120),
  footerText: z.string().trim().max(140, "O rodapé pode ter até 140 caracteres."),
});

export async function saveSettingsAction(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const s = await staffForAction(slug, []); // só administração
  if ("error" in s) return s;
  const parsed = settingsSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await withContext({ tenantId: s.tenant.id, userId: s.userId }, (c) => saveSettings(c, s.tenant.id, parsed.data));
  revalidatePath(`/t/${slug}/admin/certificados`);
  return { ok: "Salvo. Vale para os próximos certificados." };
}

export async function revokeAction(slug: string, certificateId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const s = await staffForAction(slug, []);
  if ("error" in s) return s;
  const reason = String(form.get("reason") ?? "").trim();
  if (reason.length < 3) return { error: "Informe o motivo da anulação." };
  const ok = await withContext({ tenantId: s.tenant.id, userId: s.userId }, (c) => revokeCertificate(c, { tenantId: s.tenant.id, certificateId, reason: reason.slice(0, 300), actorId: s.userId }));
  if (!ok) return { error: "Este certificado já foi anulado." };
  revalidatePath(`/t/${slug}/admin/certificados`);
  return { ok: "Certificado anulado." };
}
