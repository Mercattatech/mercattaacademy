"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/components/action-form";
import { withContext } from "@/lib/db";
import { parseScore } from "@/lib/format";
import { staffForAction, type StaffContext } from "@/lib/guards";
import { canGradeModule, createAssessment, deleteAssessment, saveGrades, updateAssessment } from "@/lib/services/grades";

const ROLES = ["coordenacao", "professor"] as const;
const schema = z.object({
  title: z.string().trim().min(2, "Informe o título da avaliação.").max(140),
  weight: z.coerce.number().min(0.01, "O peso precisa ser maior que zero.").max(1000),
  maxScore: z.coerce.number().min(0.01, "A nota máxima precisa ser maior que zero.").max(1000),
  dueOn: z.preprocess((v) => (v === "" || v == null ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.").nullable()),
});
const ctxOf = (s: StaffContext) => ({ tenantId: s.tenant.id, userId: s.userId });
const refresh = (slug: string, id?: string) => {
  revalidatePath(`/t/${slug}/admin/avaliacoes`);
  revalidatePath(`/t/${slug}/admin/notas`);
  revalidatePath(`/t/${slug}/admin/certificados`);
  if (id) revalidatePath(`/t/${slug}/admin/avaliacoes/${id}`);
};

async function guardAssessment(slug: string, id: string): Promise<{ s: StaffContext } | { error: string }> {
  const s = await staffForAction(slug, ROLES);
  if ("error" in s) return s;
  const ok = await withContext(ctxOf(s), async (c) => {
    const a = (await c.query<{ cohort_module_id: string }>("select cohort_module_id from assessments where id = $1", [id])).rows[0];
    return a ? canGradeModule(c, s.roles, s.userId, a.cohort_module_id) : null;
  });
  if (ok === null) return { error: "Avaliação não encontrada." };
  if (!ok) return { error: "Só o professor do módulo ou a coordenação lançam notas aqui." };
  return { s };
}

export async function createAssessmentAction(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const s = await staffForAction(slug, ROLES);
  if ("error" in s) return s;
  const parsed = schema.safeParse(Object.fromEntries(form));
  const moduleId = String(form.get("cohortModuleId") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!/^[0-9a-f-]{36}$/i.test(moduleId)) return { error: "Escolha o módulo." };
  const out = await withContext(ctxOf(s), async (c) => {
    if (!(await canGradeModule(c, s.roles, s.userId, moduleId))) return { ok: false as const, error: "Você não é professor deste módulo." };
    return createAssessment(c, { ...parsed.data, tenantId: s.tenant.id, cohortModuleId: moduleId, actorId: s.userId });
  });
  if (!out.ok) return { error: out.error };
  refresh(slug);
  return { ok: "Avaliação criada." };
}

export async function updateAssessmentAction(slug: string, id: string, _: ActionState, form: FormData): Promise<ActionState> {
  const g = await guardAssessment(slug, id);
  if ("error" in g) return g;
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const out = await withContext(ctxOf(g.s), (c) => updateAssessment(c, id, { ...parsed.data, tenantId: g.s.tenant.id, actorId: g.s.userId }));
  if (!out.ok) return { error: out.error ?? "Não foi possível salvar." };
  refresh(slug, id);
  return { ok: "Avaliação atualizada." };
}

export async function deleteAssessmentAction(slug: string, id: string, _: ActionState): Promise<ActionState> {
  const g = await guardAssessment(slug, id);
  if ("error" in g) return g;
  await withContext(ctxOf(g.s), (c) => deleteAssessment(c, id, g.s.tenant.id, g.s.userId));
  refresh(slug);
  redirect(`/t/${slug}/admin/avaliacoes`);
}

export async function saveGradesAction(slug: string, id: string, _: ActionState, form: FormData): Promise<ActionState> {
  const g = await guardAssessment(slug, id);
  if ("error" in g) return g;
  const scores: Record<string, number | null> = {};
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("score_")) continue;
    const enr = key.slice(6);
    if (!/^[0-9a-f-]{36}$/i.test(enr)) continue;
    const n = parseScore(String(value));
    if (Number.isNaN(n)) return { error: "Há nota inválida. Use números como 7,5." };
    scores[enr] = n;
  }
  const out = await withContext(ctxOf(g.s), (c) => saveGrades(c, { tenantId: g.s.tenant.id, assessmentId: id, actorId: g.s.userId, scores }));
  if (!out.ok) return { error: out.error };
  refresh(slug, id);
  const parts = [out.saved ? `${out.saved} nota(s) salva(s).` : "Nada mudou."];
  if (out.issued) parts.push(`${out.issued} certificado(s) emitido(s).`);
  return { ok: parts.join(" ") };
}
