"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/components/action-form";
import { withContext } from "@/lib/db";
import { staffForAction, type StaffContext } from "@/lib/guards";
import { cancelLesson, canManageLesson, canSchedule, closePresence, endLesson, scheduleLesson, setOverride, startLesson, updateLesson } from "@/lib/services/lessons";
import { deleteFile, MAX_FILE_BYTES, putFile, sniffFile } from "@/lib/storage";
import { VideoError, VideoNotConfigured } from "@/lib/video";

const ROLES = ["coordenacao", "professor"] as const;
const lessonSchema = z.object({
  title: z.string().trim().min(2, "Informe o título da aula.").max(140),
  startsLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Informe a data e a hora."),
  durationMinutes: z.coerce.number().int().min(15, "Mínimo de 15 minutos.").max(480, "Máximo de 8 horas."),
  teacherId: z.preprocess((v) => (v === "" || v == null ? null : v), z.string().nullable()),
});

type Guard = { s: StaffContext };
async function guard(slug: string, lessonId: string, requireManage = true): Promise<Guard | { error: string }> {
  const s = await staffForAction(slug, ROLES);
  if ("error" in s) return s;
  if (requireManage) {
    const l = await withContext({ tenantId: s.tenant.id }, async (c) => (await c.query<{ teacher_id: string | null }>("select teacher_id from lessons where id = $1", [lessonId])).rows[0]);
    if (!l) return { error: "Aula não encontrada." };
    if (!canManageLesson(s.roles, s.userId, l)) return { error: "Só o professor da aula ou a coordenação podem fazer isso." };
  }
  return { s };
}
const ctxOf = (s: StaffContext) => ({ tenantId: s.tenant.id, userId: s.userId });
const refresh = (slug: string, lessonId?: string) => {
  revalidatePath(`/t/${slug}/admin/aulas`);
  if (lessonId) revalidatePath(`/t/${slug}/admin/aulas/${lessonId}`);
};

export async function scheduleLessonAction(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const s = await staffForAction(slug, ["coordenacao"]);
  if ("error" in s) return s;
  if (!canSchedule(s.roles)) return { error: "Só a coordenação agenda aulas." };
  const parsed = lessonSchema.safeParse(Object.fromEntries(form));
  const moduleId = String(form.get("cohortModuleId") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!/^[0-9a-f-]{36}$/i.test(moduleId)) return { error: "Escolha o módulo da aula." };
  const out = await withContext(ctxOf(s), (c) => scheduleLesson(c, { ...parsed.data, tenantId: s.tenant.id, cohortModuleId: moduleId, actorId: s.userId }));
  if (!out.ok) return { error: out.error };
  refresh(slug);
  return { ok: "Aula agendada." };
}

export async function updateLessonAction(slug: string, lessonId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const g = await guard(slug, lessonId);
  if ("error" in g) return g;
  if (!canSchedule(g.s.roles)) return { error: "Só a coordenação muda dia e hora da aula." };
  const parsed = lessonSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const out = await withContext(ctxOf(g.s), (c) => updateLesson(c, { ...parsed.data, lessonId }));
  if (!out.ok) return { error: out.error ?? "Não foi possível salvar." };
  refresh(slug, lessonId);
  return { ok: "Aula atualizada." };
}

export async function cancelLessonAction(slug: string, lessonId: string, _: ActionState): Promise<ActionState> {
  const g = await guard(slug, lessonId);
  if ("error" in g) return g;
  if (!canSchedule(g.s.roles)) return { error: "Só a coordenação cancela aulas." };
  const ok = await withContext(ctxOf(g.s), (c) => cancelLesson(c, lessonId, g.s.userId, g.s.tenant.id));
  if (!ok) return { error: "Só aulas agendadas podem ser canceladas." };
  refresh(slug, lessonId);
  return { ok: "Aula cancelada." };
}

const videoMessage = (e: unknown) =>
  e instanceof VideoNotConfigured ? "A videoconferência ainda não foi configurada na plataforma. Fale com o suporte."
  : e instanceof VideoError ? `O serviço de vídeo recusou: ${e.message}` : null;

export async function startLessonAction(slug: string, lessonId: string, _: ActionState): Promise<ActionState> {
  const g = await guard(slug, lessonId);
  if ("error" in g) return g;
  try {
    const out = await withContext(ctxOf(g.s), (c) => startLesson(c, { tenantId: g.s.tenant.id, userId: g.s.userId, roles: g.s.roles, lessonId }));
    if (!out.ok) return { error: out.error };
  } catch (e) {
    const msg = videoMessage(e);
    if (msg) return { error: msg };
    throw e;
  }
  redirect(`/t/${slug}/aula/${lessonId}`);
}

export async function endLessonAction(slug: string, lessonId: string, _: ActionState): Promise<ActionState> {
  const g = await guard(slug, lessonId);
  if ("error" in g) return g;
  try {
    const out = await withContext(ctxOf(g.s), (c) => endLesson(c, { tenantId: g.s.tenant.id, userId: g.s.userId, roles: g.s.roles, lessonId }));
    if (!out.ok) return { error: out.error ?? "Não foi possível encerrar." };
  } catch (e) {
    const msg = videoMessage(e);
    if (msg) return { error: msg };
    throw e;
  }
  refresh(slug, lessonId);
  return { ok: "Aula encerrada. A gravação aparece sozinha quando estiver pronta." };
}

export async function setOverrideAction(slug: string, lessonId: string, enrollmentId: string, value: "present" | "absent" | "auto", _: ActionState): Promise<ActionState> {
  const g = await guard(slug, lessonId);
  if ("error" in g) return g;
  const ok = await withContext(ctxOf(g.s), (c) => setOverride(c, { lessonId, enrollmentId, value: value === "auto" ? null : value === "present" }));
  if (!ok) return { error: "A presença já está fechada." };
  refresh(slug, lessonId);
  return { ok: "Ajustado." };
}

export async function closePresenceAction(slug: string, lessonId: string, _: ActionState): Promise<ActionState> {
  const g = await guard(slug, lessonId);
  if ("error" in g) return g;
  const out = await withContext(ctxOf(g.s), (c) => closePresence(c, { tenantId: g.s.tenant.id, lessonId, actorId: g.s.userId }));
  if (!out.ok) return { error: out.error ?? "Não foi possível fechar." };
  refresh(slug, lessonId);
  return { ok: "Presença fechada." };
}

export async function uploadMaterialAction(slug: string, lessonId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const g = await guard(slug, lessonId);
  if ("error" in g) return g;
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Escolha um PDF." };
  if (file.size > MAX_FILE_BYTES) return { error: "O PDF passa de 4 MB. Comprima o arquivo." };
  const bytes = Buffer.from(await file.arrayBuffer());
  if (sniffFile(bytes)?.contentType !== "application/pdf") return { error: "Envie um arquivo PDF." };

  const key = `${g.s.tenant.id}/aulas/${lessonId}/${randomUUID()}.pdf`;
  await putFile(key, bytes, "application/pdf");
  try {
    await withContext(ctxOf(g.s), (c) =>
      c.query(`insert into lesson_materials (tenant_id, lesson_id, file_name, storage_key, size_bytes, uploaded_by) values ($1, $2, $3, $4, $5, $6)`,
        [g.s.tenant.id, lessonId, file.name.replace(/[^\p{L}\p{N}._ -]/gu, "").slice(0, 120) || "material.pdf", key, bytes.length, g.s.userId]),
    );
  } catch (e) {
    await deleteFile(key);
    throw e;
  }
  refresh(slug, lessonId);
  return { ok: "PDF anexado." };
}

export async function deleteMaterialAction(slug: string, lessonId: string, materialId: string, _: ActionState): Promise<ActionState> {
  const g = await guard(slug, lessonId);
  if ("error" in g) return g;
  const key = await withContext(ctxOf(g.s), async (c) => (await c.query<{ storage_key: string }>("delete from lesson_materials where id = $1 and lesson_id = $2 returning storage_key", [materialId, lessonId])).rows[0]?.storage_key);
  if (key) await deleteFile(key);
  refresh(slug, lessonId);
  return { ok: "PDF removido." };
}
