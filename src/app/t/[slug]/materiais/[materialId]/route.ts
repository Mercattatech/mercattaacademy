import { NextResponse } from "next/server";
import { withContext } from "@/lib/db";
import { roomAccess } from "@/lib/services/lessons";
import { getSession } from "@/lib/session";
import { getFile } from "@/lib/storage";
import { getRoles, resolveTenant } from "@/lib/tenant";

/** PDF da aula: só equipe da aula e alunos da turma com acesso liberado. */
export async function GET(_: Request, { params }: { params: Promise<{ slug: string; materialId: string }> }) {
  const { slug, materialId } = await params;
  const tenant = await resolveTenant(slug);
  const session = await getSession();
  if (!tenant || !session || !/^[0-9a-f-]{36}$/i.test(materialId)) return new NextResponse("Não encontrado", { status: 404 });
  const roles = await getRoles(tenant.id, session.user.id);

  const material = await withContext({ tenantId: tenant.id, userId: session.user.id }, async (c) => {
    const m = (await c.query<{ lesson_id: string; storage_key: string; file_name: string }>("select lesson_id, storage_key, file_name from lesson_materials where id = $1", [materialId])).rows[0];
    if (!m) return null;
    return (await roomAccess(c, m.lesson_id, session.user.id, roles)) ? m : null;
  });
  if (!material) return new NextResponse("Não encontrado", { status: 404 });

  return new NextResponse(new Uint8Array(await getFile(material.storage_key)), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(material.file_name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
