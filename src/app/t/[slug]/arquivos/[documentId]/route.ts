import { NextResponse } from "next/server";
import { withContext } from "@/lib/db";
import { audit } from "@/lib/services/audit";
import { getSession, isPlatformAdmin } from "@/lib/session";
import { getFile } from "@/lib/storage";
import { getRoles, resolveTenant } from "@/lib/tenant";

const REVIEWERS = ["admin", "coordenacao", "secretaria"];

/** Download de documento: só o dono do documento e a equipe da secretaria. Nunca público. */
export async function GET(_: Request, { params }: { params: Promise<{ slug: string; documentId: string }> }) {
  const { slug, documentId } = await params;
  const tenant = await resolveTenant(slug);
  const session = await getSession();
  if (!tenant || !session || !/^[0-9a-f-]{36}$/i.test(documentId)) return new NextResponse("Não encontrado", { status: 404 });

  const roles = await getRoles(tenant.id, session.user.id);
  const reviewer = roles.some((r) => REVIEWERS.includes(r)) || (await isPlatformAdmin(session.user.id));

  const doc = await withContext({ tenantId: tenant.id, userId: session.user.id }, async (c) => {
    const row = (
      await c.query<{ storage_key: string; file_name: string; content_type: string; owner: string }>(
        `select d.storage_key, d.file_name, d.content_type, e.user_id as owner
         from student_documents d join enrollments e on e.tenant_id = d.tenant_id and e.id = d.enrollment_id
         where d.id = $1 and d.status = 'sent'`,
        [documentId],
      )
    ).rows[0];
    if (!row || (row.owner !== session.user.id && !reviewer)) return null;
    if (row.owner !== session.user.id) {
      await audit(c, { tenantId: tenant.id, actorUserId: session.user.id, action: "document_viewed", entity: "student_document", entityId: documentId });
    }
    return row;
  });
  if (!doc) return new NextResponse("Não encontrado", { status: 404 });

  const body = await getFile(doc.storage_key);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": doc.content_type,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(doc.file_name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
