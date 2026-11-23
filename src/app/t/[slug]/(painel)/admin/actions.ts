"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/components/action-form";
import { withContext } from "@/lib/db";
import { sendAnnouncementEmail, sendEnrolledEmail, sendInviteEmail } from "@/lib/emails";
import { postAnnouncement } from "@/lib/services/communication";
import { staffForAction, type StaffContext } from "@/lib/guards";
import { addModule, createCohortFromProgram, deleteModule, moveModule } from "@/lib/services/academic";
import { audit } from "@/lib/services/audit";
import { parseStudentsCsv } from "@/lib/services/csv";
import { enrollStudent } from "@/lib/services/enrollment";
import { createInvite, type Role } from "@/lib/services/invites";
import { deleteFile } from "@/lib/storage";

const ctxOf = (s: StaffContext) => ({ tenantId: s.tenant.id, userId: s.userId });
const optionalInt = z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().positive().nullable());
const optionalDate = z.preprocess((v) => (v === "" || v == null ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable());
const base = (slug: string, path = "") => `/t/${slug}/admin${path}`;

// ----------------------------------------------------------------- configurações
const settingsSchema = z.object({
  primary: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor no formato #1f4e79."),
  site: z.string().trim().url("Site inválido.").or(z.literal("")),
  instagram: z.string().trim().url("Link do Instagram inválido.").or(z.literal("")),
  program_s: z.string().trim().min(2), program_p: z.string().trim().min(2),
  cohort_s: z.string().trim().min(2), cohort_p: z.string().trim().min(2),
  module_s: z.string().trim().min(2), module_p: z.string().trim().min(2),
  lesson_s: z.string().trim().min(2), lesson_p: z.string().trim().min(2),
});

export async function saveSettingsAction(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const s = await staffForAction(slug, []);
  if ("error" in s) return s;
  const parsed = settingsSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message || "Preencha todos os nomes (mínimo 2 letras)." };
  const d = parsed.data;
  await withContext(ctxOf(s), async (c) => {
    await c.query(`update tenants set brand = brand || $2::jsonb, links = $3::jsonb, updated_at = now() where id = $1`, [
      s.tenant.id,
      { primary: d.primary },
      Object.fromEntries(Object.entries({ site: d.site, instagram: d.instagram }).filter(([, v]) => v)),
    ]);
    for (const key of ["program", "cohort", "module", "lesson"] as const) {
      await c.query(
        `insert into tenant_labels (tenant_id, label_key, singular, plural) values ($1, $2, $3, $4)
         on conflict (tenant_id, label_key) do update set singular = excluded.singular, plural = excluded.plural`,
        [s.tenant.id, key, d[`${key}_s`], d[`${key}_p`]],
      );
    }
    await audit(c, { tenantId: s.tenant.id, actorUserId: s.userId, action: "settings_updated", entity: "tenant" });
  });
  revalidatePath(`/t/${slug}`, "layout");
  return { ok: "Configurações salvas." };
}

// ----------------------------------------------------------------- equipe
const STAFF_INVITE_ROLES = ["admin", "coordenacao", "professor", "secretaria", "financeiro"] as const;
const inviteSchema = z.object({
  email: z.string().trim().email("Informe um e-mail válido."),
  name: z.string().trim().optional(),
  role: z.enum(STAFF_INVITE_ROLES, { message: "Escolha um perfil." }),
});

export async function inviteStaffAction(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const s = await staffForAction(slug, []);
  if ("error" in s) return s;
  const parsed = inviteSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { token } = await withContext(ctxOf(s), (c) =>
    createInvite(c, { tenantId: s.tenant.id, email: parsed.data.email, name: parsed.data.name, role: parsed.data.role, createdBy: s.userId }),
  );
  const sent = await sendInviteEmail({ tenantSlug: slug, tenantName: s.tenant.name, email: parsed.data.email, name: parsed.data.name, role: parsed.data.role, token });
  revalidatePath(base(slug, "/equipe"));
  return sent.delivered
    ? { ok: `Convite enviado para ${parsed.data.email}.` }
    : { ok: `Convite criado. E-mail não enviado (Resend não configurado). Link: ${sent.url}` };
}

export async function revokeInviteAction(slug: string, inviteId: string) {
  const s = await staffForAction(slug, ["secretaria"]);
  if ("error" in s) return;
  await withContext(ctxOf(s), (c) => c.query("update invites set revoked_at = now() where id = $1 and accepted_at is null", [inviteId]));
  revalidatePath(base(slug), "layout");
}

export async function removeMemberAction(slug: string, userId: string, role: string) {
  const s = await staffForAction(slug, []);
  if ("error" in s) return;
  if (userId === s.userId && role === "admin") return; // não remove o próprio acesso de administrador
  await withContext(ctxOf(s), async (c) => {
    await c.query("delete from memberships where user_id = $1 and role = $2", [userId, role]);
    await audit(c, { tenantId: s.tenant.id, actorUserId: s.userId, action: "member_removed", entity: "membership", entityId: userId, data: { role } });
  });
  revalidatePath(base(slug, "/equipe"));
}

// ----------------------------------------------------------------- avisos
const announcementSchema = z.object({
  title: z.string().trim().min(1, "Escreva um título.").max(160, "Título com até 160 caracteres."),
  body: z.string().trim().max(4000, "Texto com até 4.000 caracteres."),
});

export async function createAnnouncementAction(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const s = await staffForAction(slug, ["coordenacao", "secretaria"]);
  if ("error" in s) return s;
  const parsed = announcementSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const rawCohort = String(form.get("cohortId") ?? "");
  const cohortId = /^[0-9a-f-]{36}$/i.test(rawCohort) ? rawCohort : null;
  const out = await withContext(ctxOf(s), (c) => postAnnouncement(c, { tenantId: s.tenant.id, actorId: s.userId, title: parsed.data.title, body: parsed.data.body, cohortId }));
  if (!out.ok) return { error: out.error };
  let emailed = 0;
  if (form.get("email") === "on") {
    for (const r of out.recipients) {
      try {
        await sendAnnouncementEmail({ tenantSlug: slug, tenantName: s.tenant.name, to: r.email, name: r.name, title: parsed.data.title, body: parsed.data.body });
        emailed++;
      } catch { /* um e-mail com falha não derruba o aviso */ }
    }
  }
  revalidatePath(`/t/${slug}`, "layout");
  return { ok: `Aviso publicado para ${out.recipients.length} aluno(s).${emailed ? ` ${emailed} e-mail(s) enviado(s).` : ""}` };
}

export async function deleteAnnouncementAction(slug: string, id: string) {
  const s = await staffForAction(slug, ["coordenacao", "secretaria"]);
  if ("error" in s) return;
  await withContext(ctxOf(s), (c) => c.query("delete from announcements where id = $1", [id]));
  revalidatePath(`/t/${slug}`, "layout");
}

// ----------------------------------------------------------------- cursos e grade
const programSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do curso."),
  description: z.string().trim().max(4000).default(""),
  workloadHours: optionalInt,
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  summary: z.string().trim().max(400).default(""),
  priceReais: z.preprocess(
    (v) => (v === "" || v == null ? null : Number(String(v).replace(/\./g, "").replace(",", "."))),
    z.number().min(0, "O valor não pode ser negativo.").max(1_000_000, "Valor alto demais.").nullable(),
  ),
  paymentNote: z.string().trim().max(160).default("À vista ou primeira parcela"),
  maxInstallments: z.coerce.number().int().min(1, "Mínimo 1 parcela.").max(12, "Máximo 12 parcelas.").default(1),
  minAttendancePercent: z.coerce.number().int().min(1, "A presença mínima vai de 1% a 100%.").max(100, "A presença mínima vai de 1% a 100%.").default(75),
  minGrade: z.coerce.number().min(0, "A nota mínima vai de 0 a 10.").max(10, "A nota mínima vai de 0 a 10.").default(7),
  minFrequencyPercent: z.coerce.number().int().min(0, "A frequência mínima vai de 0% a 100%.").max(100, "A frequência mínima vai de 0% a 100%.").default(80),
});

export async function createProgramAction(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const s = await staffForAction(slug, ["coordenacao"]);
  if ("error" in s) return s;
  const parsed = programSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const id = await withContext(ctxOf(s), async (c) =>
    (await c.query<{ id: string }>(
      "insert into programs (tenant_id, name, description, workload_hours, status) values ($1, $2, $3, $4, 'draft') returning id",
      [s.tenant.id, parsed.data.name, parsed.data.description, parsed.data.workloadHours],
    )).rows[0].id,
  );
  redirect(base(slug, `/cursos/${id}`));
}

export async function updateProgramAction(slug: string, programId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const s = await staffForAction(slug, ["coordenacao"]);
  if ("error" in s) return s;
  const parsed = programSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await withContext(ctxOf(s), (c) =>
    c.query(
      `update programs set name = $2, description = $3, workload_hours = $4, status = $5,
              summary = $6, price_cents = $7, payment_note = $8, max_installments = $9, min_attendance_percent = $10, min_grade = $11, min_frequency_percent = $12, updated_at = now() where id = $1`,
      [
        programId, parsed.data.name, parsed.data.description, parsed.data.workloadHours, parsed.data.status,
        parsed.data.summary, parsed.data.priceReais == null ? null : Math.round(parsed.data.priceReais * 100), parsed.data.paymentNote, parsed.data.maxInstallments, parsed.data.minAttendancePercent, parsed.data.minGrade, parsed.data.minFrequencyPercent,
      ],
    ),
  );
  revalidatePath(base(slug), "layout");
  return { ok: "Curso salvo." };
}

const moduleSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do módulo."),
  syllabus: z.string().trim().max(8000).default(""),
  workloadHours: optionalInt,
  defaultTeacherId: z.string().trim().optional().transform((v) => v || null),
});

export async function addModuleAction(slug: string, programId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const s = await staffForAction(slug, ["coordenacao"]);
  if ("error" in s) return s;
  const parsed = moduleSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await withContext(ctxOf(s), (c) => addModule(c, { tenantId: s.tenant.id, programId, ...parsed.data }));
  revalidatePath(base(slug, `/cursos/${programId}`));
  return { ok: "Módulo adicionado à grade." };
}

export async function updateModuleAction(slug: string, programId: string, moduleId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const s = await staffForAction(slug, ["coordenacao"]);
  if ("error" in s) return s;
  const parsed = moduleSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await withContext(ctxOf(s), (c) =>
    c.query("update program_modules set name = $2, syllabus = $3, workload_hours = $4, default_teacher_id = $5 where id = $1", [
      moduleId, parsed.data.name, parsed.data.syllabus, parsed.data.workloadHours, parsed.data.defaultTeacherId,
    ]),
  );
  revalidatePath(base(slug, `/cursos/${programId}`));
  return { ok: "Módulo salvo." };
}

export async function moveModuleAction(slug: string, programId: string, moduleId: string, direction: "up" | "down") {
  const s = await staffForAction(slug, ["coordenacao"]);
  if ("error" in s) return;
  await withContext(ctxOf(s), (c) => moveModule(c, moduleId, direction));
  revalidatePath(base(slug, `/cursos/${programId}`));
}

export async function deleteModuleAction(slug: string, programId: string, moduleId: string) {
  const s = await staffForAction(slug, ["coordenacao"]);
  if ("error" in s) return;
  const files = await withContext(ctxOf(s), async (c) => {
    // Os vídeos do módulo somem do banco junto com ele; apaga também os arquivos.
    const keys = (await c.query<{ storage_key: string }>("select storage_key from module_videos where module_id = $1", [moduleId])).rows.map((r) => r.storage_key);
    await deleteModule(c, moduleId);
    return keys;
  });
  await Promise.all(files.map((key) => deleteFile(key).catch(() => {})));
  revalidatePath(base(slug, `/cursos/${programId}`));
}

// ----------------------------------------------------------------- turmas
const cohortSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da turma."),
  startsOn: optionalDate,
  endsOn: optionalDate,
  enrollmentOpensOn: optionalDate,
  enrollmentClosesOn: optionalDate,
});

export async function createCohortAction(slug: string, programId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const s = await staffForAction(slug, ["coordenacao"]);
  if ("error" in s) return s;
  const parsed = cohortSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (parsed.data.startsOn && parsed.data.endsOn && parsed.data.endsOn < parsed.data.startsOn) return { error: "O fim vem antes do início." };
  const id = await withContext(ctxOf(s), (c) => createCohortFromProgram(c, { tenantId: s.tenant.id, programId, ...parsed.data }));
  redirect(base(slug, `/turmas/${id}`));
}

export async function updateCohortAction(slug: string, cohortId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const s = await staffForAction(slug, ["coordenacao"]);
  if ("error" in s) return s;
  const parsed = cohortSchema.extend({ status: z.enum(["planned", "open", "running", "closed"]) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (d.startsOn && d.endsOn && d.endsOn < d.startsOn) return { error: "O fim da turma vem antes do início." };
  if (d.enrollmentOpensOn && d.enrollmentClosesOn && d.enrollmentClosesOn < d.enrollmentOpensOn) {
    return { error: "O fim das inscrições vem antes do começo." };
  }

  const moduleIds = form.getAll("moduleId").map(String);
  const problems: string[] = [];
  await withContext(ctxOf(s), async (c) => {
    await c.query(
      "update cohorts set name = $2, starts_on = $3, ends_on = $4, status = $5, enrollment_opens_on = $6, enrollment_closes_on = $7 where id = $1",
      [cohortId, d.name, d.startsOn, d.endsOn, d.status, d.enrollmentOpensOn, d.enrollmentClosesOn],
    );
    for (const id of moduleIds) {
      const start = String(form.get(`start_${id}`) ?? "") || null;
      const end = String(form.get(`end_${id}`) ?? "") || null;
      const teacher = String(form.get(`teacher_${id}`) ?? "") || null;
      if (start && end && end < start) {
        problems.push(`Datas invertidas em um dos módulos (${start} a ${end}); esse módulo não foi alterado.`);
        continue;
      }
      await c.query("update cohort_modules set starts_on = $2, ends_on = $3, teacher_id = $4 where id = $1 and cohort_id = $5", [id, start, end, teacher, cohortId]);
    }
  });
  revalidatePath(base(slug, `/turmas/${cohortId}`));
  return problems.length ? { error: "Turma salva, com avisos:", details: problems } : { ok: "Turma salva." };
}

// ----------------------------------------------------------------- matrícula
async function cohortInfo(s: StaffContext, cohortId: string) {
  return withContext(ctxOf(s), async (c) => (await c.query<{ name: string }>("select name from cohorts where id = $1", [cohortId])).rows[0]);
}

async function notify(slug: string, s: StaffContext, cohortName: string, result: Awaited<ReturnType<typeof enrollStudent>>) {
  if (result.kind === "enrolled") {
    if (!result.alreadyEnrolled) {
      await sendEnrolledEmail({ tenantSlug: slug, tenantName: s.tenant.name, email: result.email, name: result.name, cohortName });
    }
    return null;
  }
  const sent = await sendInviteEmail({
    tenantSlug: slug, tenantName: s.tenant.name, email: result.email, name: result.name, role: "aluno" as Role, token: result.token, cohortName,
  });
  return sent.delivered ? null : sent.url;
}

const studentSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do aluno."),
  email: z.string().trim().email("Informe um e-mail válido."),
});

export async function enrollOneAction(slug: string, cohortId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const s = await staffForAction(slug, ["secretaria", "coordenacao"]);
  if ("error" in s) return s;
  const parsed = studentSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const cohort = await cohortInfo(s, cohortId);
  if (!cohort) return { error: "Turma não encontrada." };
  const result = await withContext(ctxOf(s), (c) =>
    enrollStudent(c, { tenantId: s.tenant.id, cohortId, ...parsed.data, source: "manual", actorId: s.userId }),
  );
  const link = await notify(slug, s, cohort.name, result);
  revalidatePath(base(slug, `/turmas/${cohortId}`));
  if (result.kind === "enrolled") {
    return { ok: result.alreadyEnrolled ? `${parsed.data.email} já estava matriculado(a).` : `${parsed.data.email} matriculado(a) e avisado(a) por e-mail.` };
  }
  return { ok: link ? `Convite criado. E-mail não enviado (Resend não configurado). Link: ${link}` : `Convite de matrícula enviado para ${parsed.data.email}.` };
}

export async function enrollCsvAction(slug: string, cohortId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const s = await staffForAction(slug, ["secretaria", "coordenacao"]);
  if ("error" in s) return s;
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Escolha o arquivo CSV da planilha." };
  if (file.size > 1_000_000) return { error: "Arquivo grande demais (máximo 1 MB)." };
  const cohort = await cohortInfo(s, cohortId);
  if (!cohort) return { error: "Turma não encontrada." };

  const { rows, issues } = parseStudentsCsv(await file.text());
  if (rows.length === 0) {
    return { error: "Nenhum aluno válido na planilha. Use as colunas nome e e-mail.", details: issues.map((i) => `Linha ${i.line}: ${i.message}`) };
  }

  let enrolled = 0;
  let invited = 0;
  let already = 0;
  for (const row of rows) {
    const result = await withContext(ctxOf(s), (c) =>
      enrollStudent(c, { tenantId: s.tenant.id, cohortId, name: row.name, email: row.email, source: "csv", actorId: s.userId }),
    );
    await notify(slug, s, cohort.name, result);
    if (result.kind === "invited") invited++;
    else if (result.alreadyEnrolled) already++;
    else enrolled++;
  }
  await withContext(ctxOf(s), (c) =>
    audit(c, { tenantId: s.tenant.id, actorUserId: s.userId, action: "csv_import", entity: "cohort", entityId: cohortId, data: { enrolled, invited, already, issues: issues.length } }),
  );
  revalidatePath(base(slug, `/turmas/${cohortId}`));
  return {
    ok: `Planilha processada: ${enrolled} matriculados, ${invited} convidados, ${already} já estavam na turma.`,
    details: issues.map((i) => `Linha ${i.line}: ${i.message}`),
  };
}

export async function cancelEnrollmentAction(slug: string, cohortId: string, enrollmentId: string) {
  const s = await staffForAction(slug, ["secretaria", "coordenacao"]);
  if ("error" in s) return;
  await withContext(ctxOf(s), async (c) => {
    await c.query("update enrollments set status = 'canceled' where id = $1", [enrollmentId]);
    await audit(c, { tenantId: s.tenant.id, actorUserId: s.userId, action: "enrollment_canceled", entity: "enrollment", entityId: enrollmentId });
  });
  revalidatePath(base(slug, `/turmas/${cohortId}`));
}
