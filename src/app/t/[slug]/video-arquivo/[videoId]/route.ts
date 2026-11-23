import { NextResponse } from "next/server";
import { withContext } from "@/lib/db";
import { STAFF_ROLES } from "@/lib/guards";
import { studentCanWatch } from "@/lib/services/videos";
import { getSession } from "@/lib/session";
import { fileSize, presignDownload, readRange } from "@/lib/storage";
import { getEnabledFeatures, getRoles, resolveTenant } from "@/lib/tenant";

const notFound = () => new NextResponse("Não encontrado", { status: 404 });

/**
 * Entrega o vídeo: equipe da instituição, ou aluno com acesso liberado ao curso do módulo.
 * Com S3/MinIO, redireciona para um link assinado que vence em 1 hora (o arquivo nunca é público).
 * Sem S3 (desenvolvimento), serve da pasta .storage com suporte a avançar no vídeo (Range).
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string; videoId: string }> }) {
  const { slug, videoId } = await params;
  const tenant = await resolveTenant(slug);
  const session = await getSession();
  if (!tenant || !session || !/^[0-9a-f-]{36}$/i.test(videoId)) return notFound();
  if (!(await getEnabledFeatures(tenant.id)).has("aulas_gravadas")) return notFound();
  const roles = await getRoles(tenant.id, session.user.id);

  const video = await withContext({ tenantId: tenant.id, userId: session.user.id }, async (c) => {
    const v = (await c.query<{ module_id: string; storage_key: string; content_type: string }>("select module_id, storage_key, content_type from module_videos where id = $1 and status = 'ready'", [videoId])).rows[0];
    if (!v) return null;
    const staff = roles.some((r) => (STAFF_ROLES as readonly string[]).includes(r));
    return staff || (await studentCanWatch(c, v.module_id, session.user.id)) ? v : null;
  });
  if (!video) return notFound();

  const link = await presignDownload(video.storage_key, video.content_type);
  if (link) return NextResponse.redirect(link, { status: 302, headers: { "Cache-Control": "private, no-store" } });

  const size = await fileSize(video.storage_key);
  if (size == null) return notFound();
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  let start = 0;
  let end = size - 1;
  if (range) {
    if (range[1] === "" && range[2] !== "") {
      start = Math.max(0, size - Number(range[2]));
    } else {
      start = Number(range[1] || 0);
      if (range[2] !== "") end = Math.min(end, Number(range[2]));
    }
    if (start > end || start >= size) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  const headers: Record<string, string> = {
    "Content-Type": video.content_type,
    "Accept-Ranges": "bytes",
    "Content-Length": String(end - start + 1),
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (range) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  return new NextResponse(await readRange(video.storage_key, start, end), { status: range ? 206 : 200, headers });
}
