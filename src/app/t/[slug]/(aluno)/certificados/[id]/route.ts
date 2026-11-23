import { NextResponse } from "next/server";
import { buildCertificatePdf } from "@/lib/certificate-pdf";
import { withContext } from "@/lib/db";
import { certificateForDownload } from "@/lib/services/certificates";
import { getSession } from "@/lib/session";
import { getLabels, getRoles, resolveTenant } from "@/lib/tenant";
import { tenantUrl } from "@/lib/urls";

/** PDF do certificado: o próprio aluno ou a equipe da instituição. */
export async function GET(_: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const tenant = await resolveTenant(slug);
  const session = await getSession();
  if (!tenant || !session || !/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Não encontrado", { status: 404 });
  const roles = await getRoles(tenant.id, session.user.id);
  const staff = roles.some((r) => ["admin", "coordenacao", "secretaria"].includes(r));
  const cert = await withContext({ tenantId: tenant.id, userId: session.user.id }, (c) => certificateForDownload(c, id, session.user.id, staff));
  if (!cert) return new NextResponse("Não encontrado", { status: 404 });
  const labels = await getLabels(tenant.id);
  const pdf = await buildCertificatePdf(cert, tenant.name, tenantUrl(slug, `/verificar/${cert.code}`), tenant.brand.primary, labels.program.singular);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="certificado-${cert.code}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
