import { NextResponse } from "next/server";
import { withContext } from "@/lib/db";
import { exportMyData } from "@/lib/services/privacy";
import { getSession } from "@/lib/session";
import { getRoles, resolveTenant } from "@/lib/tenant";

/** Baixa um JSON com os dados da própria pessoa nesta instituição. */
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await resolveTenant(slug);
  const session = await getSession();
  if (!tenant || !session) return new NextResponse("Entre para baixar seus dados.", { status: 401 });
  const roles = await getRoles(tenant.id, session.user.id);
  if (roles.length === 0) return new NextResponse("Não encontrado", { status: 404 });
  const data = await withContext({ tenantId: tenant.id, userId: session.user.id }, (c) => exportMyData(c, session.user.id, tenant.name));
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="meus-dados-${slug}.json"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
