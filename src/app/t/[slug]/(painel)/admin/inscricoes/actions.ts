"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/components/action-form";
import { withContext } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { staffForAction } from "@/lib/guards";
import { audit } from "@/lib/services/audit";
import { approveDocument, notify, rejectDocument } from "@/lib/services/documents";
import { deleteFile } from "@/lib/storage";
import { tenantUrl } from "@/lib/urls";

const reasonSchema = z.object({ reason: z.string().trim().min(5, "Explique o motivo em pelo menos 5 letras.").max(300) });

/** Recusa: apaga o arquivo, volta a Pendente e avisa o aluno com o motivo. */
export async function rejectDocumentAction(slug: string, documentId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const s = await staffForAction(slug, ["secretaria"]);
  if ("error" in s) return s;
  const parsed = reasonSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const rejected = await withContext({ tenantId: s.tenant.id, userId: s.userId }, (c) =>
    rejectDocument(c, { tenantId: s.tenant.id, documentId, reason: parsed.data.reason, actorId: s.userId }),
  );
  if (!rejected) return { error: "Este documento já foi recusado ou não existe mais." };
  await deleteFile(rejected.storageKey);

  await sendEmail({
    to: rejected.studentEmail,
    subject: `Documento recusado: ${rejected.documentName}`,
    fromName: s.tenant.name,
    html: `<p>Olá, ${rejected.studentName.split(" ")[0]}.</p><p>Seu documento <b>${rejected.documentName}</b> foi recusado.</p>
           <p>Motivo: ${parsed.data.reason.replace(/[<>&]/g, "")}</p>
           <p><a href="${tenantUrl(slug, "/inscricoes")}">Enviar outro arquivo</a></p>`,
    text: `Seu documento ${rejected.documentName} foi recusado. Motivo: ${parsed.data.reason}. Envie outro em ${tenantUrl(slug, "/inscricoes")}`,
  });
  revalidatePath(`/t/${slug}/admin`, "layout");
  return { ok: "Documento recusado e aluno avisado." };
}

/** Aprova o documento: sai da fila de análise da secretaria. */
export async function approveDocumentAction(slug: string, documentId: string, _: ActionState): Promise<ActionState> {
  const s = await staffForAction(slug, ["secretaria"]);
  if ("error" in s) return s;
  const ok = await withContext({ tenantId: s.tenant.id, userId: s.userId }, (c) =>
    approveDocument(c, { tenantId: s.tenant.id, documentId, actorId: s.userId }),
  );
  if (!ok) return { error: "Este documento já foi revisado ou não existe mais." };
  revalidatePath(`/t/${slug}/admin`, "layout");
  return { ok: "Documento aprovado." };
}

/** Enquanto o pagamento automático não existe (Sprint 3): confirma o pagamento e libera o acesso. */
export async function releaseAccessAction(slug: string, enrollmentId: string, _: ActionState): Promise<ActionState> {
  const s = await staffForAction(slug, ["secretaria", "financeiro"]);
  if ("error" in s) return s;
  const done = await withContext({ tenantId: s.tenant.id, userId: s.userId }, async (c) => {
    const row = (
      await c.query<{ user_id: string }>(
        `update enrollments set stage = 'released', stage_changed_at = now()
         where id = $1 and stage = 'payment' and status = 'active' returning user_id`,
        [enrollmentId],
      )
    ).rows[0];
    if (!row) return false;
    await notify(c, { tenantId: s.tenant.id, userId: row.user_id, kind: "access_released", message: "Seu acesso foi liberado. Bom curso!", href: "", enrollmentId });
    await audit(c, { tenantId: s.tenant.id, actorUserId: s.userId, action: "access_released", entity: "enrollment", entityId: enrollmentId });
    return true;
  });
  if (!done) return { error: "Só é possível liberar quem já enviou todos os documentos." };
  revalidatePath(`/t/${slug}/admin`, "layout");
  return { ok: "Acesso liberado." };
}

export async function markStaffNoticesReadAction(slug: string, _: ActionState): Promise<ActionState> {
  const s = await staffForAction(slug, ["secretaria"]);
  if ("error" in s) return s;
  await withContext({ tenantId: s.tenant.id, userId: s.userId }, (c) =>
    c.query(`update notifications set read_at = now() where user_id = $1 and read_at is null`, [s.userId]),
  );
  revalidatePath(`/t/${slug}/admin`, "layout");
  return { ok: "Avisos marcados como lidos." };
}

// ----------------------------------------------------------------- lista de documentos
const typeSchema = z.object({ name: z.string().trim().min(2, "Informe o nome do documento.").max(80) });

export async function addDocumentTypeAction(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const s = await staffForAction(slug, ["secretaria"]);
  if ("error" in s) return s;
  const parsed = typeSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await withContext({ tenantId: s.tenant.id, userId: s.userId }, (c) =>
    c.query(
      `insert into document_types (tenant_id, name, position) values ($1, $2, coalesce((select max(position) from document_types), 0) + 1)`,
      [s.tenant.id, parsed.data.name],
    ),
  );
  revalidatePath(`/t/${slug}/admin/documentos`);
  return { ok: "Documento adicionado à lista." };
}

export async function updateDocumentTypeAction(slug: string, typeId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const s = await staffForAction(slug, ["secretaria"]);
  if ("error" in s) return s;
  const parsed = typeSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await withContext({ tenantId: s.tenant.id, userId: s.userId }, (c) =>
    c.query(`update document_types set name = $2, required = $3, active = $4 where id = $1`, [
      typeId, parsed.data.name, form.get("required") === "on", form.get("active") === "on",
    ]),
  );
  revalidatePath(`/t/${slug}/admin/documentos`);
  return { ok: "Salvo." };
}
