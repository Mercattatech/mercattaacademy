import { notFound, redirect } from "next/navigation";
import { BackHeader } from "@/components/student-ui";
import { withContext } from "@/lib/db";
import { getSession } from "@/lib/session";
import { resolveTenant } from "@/lib/tenant";
import { uploadDocumentAction } from "../../../actions";
import { UploadDocument } from "./upload-document";

const UUID = /^[0-9a-f-]{36}$/i;

/** Enviar (ou trocar) um documento da matrícula. Telas 03 e 04 do protótipo. */
export default async function SendDocumentPage({ params }: { params: Promise<{ slug: string; enrollmentId: string; typeId: string }> }) {
  const { slug, enrollmentId, typeId } = await params;
  if (!UUID.test(enrollmentId) || !UUID.test(typeId)) notFound();
  const tenant = await resolveTenant(slug);
  if (!tenant) notFound();
  const session = await getSession();
  if (!session) redirect(`/login?voltar=${encodeURIComponent(`/t/${slug}/inscricoes`)}`);

  const doc = await withContext({ tenantId: tenant.id, userId: session.user.id }, async (c) =>
    (
      await c.query<{ name: string; required: boolean; status: string | null; file_name: string | null; rejected_reason: string | null; stage: string }>(
        `select t.name, t.required, d.status, d.file_name, d.rejected_reason, e.stage
         from enrollments e
         join document_types t on t.id = $2 and t.active
         left join student_documents d on d.enrollment_id = e.id and d.document_type_id = t.id
         where e.id = $1 and e.user_id = $3 and e.status <> 'canceled'`,
        [enrollmentId, typeId, session.user.id],
      )
    ).rows[0],
  );
  if (!doc || (doc.stage === "released" && doc.status === "sent")) notFound();

  return (
    <>
      <BackHeader href={`/t/${slug}/inscricoes`} title={doc.name} />
      <UploadDocument
        slug={slug}
        action={uploadDocumentAction.bind(null, slug, enrollmentId, typeId)}
        current={doc.status === "sent" ? doc.file_name : null}
        rejectedReason={doc.status === "pending" ? doc.rejected_reason : null}
      />
    </>
  );
}
