"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/action-form";
import { withContext } from "@/lib/db";
import { advanceStage, recordDocument } from "@/lib/services/documents";
import { getSession } from "@/lib/session";
import { resolveTenant } from "@/lib/tenant";
import { deleteFile, MAX_FILE_BYTES, putFile, sniffFile } from "@/lib/storage";

/** Envia (ou troca) o arquivo de um documento da própria inscrição. */
export async function uploadDocumentAction(
  slug: string,
  enrollmentId: string,
  typeId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const tenant = await resolveTenant(slug);
  const session = await getSession();
  if (!tenant || tenant.status !== "active" || !session) return { error: "Sua sessão expirou. Entre de novo." };

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Escolha um arquivo." };
  if (file.size > MAX_FILE_BYTES) return { error: "O arquivo passa de 4 MB. Reduza a foto ou comprima o PDF." };
  const bytes = Buffer.from(await file.arrayBuffer());
  const kind = sniffFile(bytes);
  if (!kind) return { error: "Envie um PDF, JPG ou PNG." };

  const key = `${tenant.id}/${enrollmentId}/${typeId}-${randomUUID()}.${kind.ext}`;
  const ctx = { tenantId: tenant.id, userId: session.user.id };
  await putFile(key, bytes, kind.contentType);

  try {
    const result = await withContext(ctx, async (c) => {
      const owned = (
        await c.query(
          `select 1 from enrollments e where e.id = $1 and e.user_id = $2 and e.status <> 'canceled'
             and exists (select 1 from document_types t where t.id = $3 and t.active)`,
          [enrollmentId, session.user.id, typeId],
        )
      ).rowCount;
      if (!owned) return null;
      const rec = await recordDocument(c, {
        tenantId: tenant.id, enrollmentId, typeId, storageKey: key,
        fileName: file.name.replace(/[^\p{L}\p{N}._ -]/gu, "").slice(0, 120) || `documento.${kind.ext}`,
        contentType: kind.contentType, size: bytes.length,
      });
      await advanceStage(c, tenant.id, enrollmentId, session.user.name);
      return rec;
    });
    if (!result) {
      await deleteFile(key);
      return { error: "Não encontramos esta inscrição." };
    }
    if (result.previousKey) await deleteFile(result.previousKey);
  } catch (error) {
    await deleteFile(key);
    throw error;
  }
  revalidatePath(`/t/${slug}/inscricoes`);
  return { ok: "Documento enviado." };
}

export async function markNoticesReadAction(slug: string, _: ActionState): Promise<ActionState> {
  const tenant = await resolveTenant(slug);
  const session = await getSession();
  if (!tenant || !session) return { error: "Sua sessão expirou." };
  await withContext({ tenantId: tenant.id, userId: session.user.id }, (c) =>
    c.query(`update notifications set read_at = now() where user_id = $1 and read_at is null`, [session.user.id]),
  );
  revalidatePath(`/t/${slug}`, "layout");
  return { ok: "Avisos marcados como lidos." };
}
