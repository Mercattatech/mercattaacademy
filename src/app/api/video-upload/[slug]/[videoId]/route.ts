import { NextResponse } from "next/server";
import { withContext } from "@/lib/db";
import { staffForAction } from "@/lib/guards";
import { MAX_VIDEO_BYTES, putStreamLocal, usesObjectStorage } from "@/lib/storage";

/**
 * Envio de vídeo SÓ no desenvolvimento (sem S3): grava o corpo direto na pasta .storage.
 * Com S3/MinIO configurado, o navegador envia ao armazenamento por link assinado e esta rota não existe.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ slug: string; videoId: string }> }) {
  if (usesObjectStorage()) return new NextResponse("Não encontrado", { status: 404 });
  const { slug, videoId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(videoId) || !request.body) return new NextResponse("Pedido inválido", { status: 400 });
  const s = await staffForAction(slug, ["coordenacao"]);
  if ("error" in s) return new NextResponse("Sem permissão", { status: 403 });

  const v = await withContext({ tenantId: s.tenant.id, userId: s.userId }, async (c) =>
    (await c.query<{ storage_key: string; content_type: string }>("select storage_key, content_type from module_videos where id = $1 and status = 'uploading'", [videoId])).rows[0],
  );
  if (!v) return new NextResponse("Não encontrado", { status: 404 });
  if (request.headers.get("content-type") !== v.content_type) return new NextResponse("Formato diferente do informado", { status: 400 });

  try {
    await putStreamLocal(v.storage_key, request.body, MAX_VIDEO_BYTES);
  } catch {
    return new NextResponse("Falha ao gravar", { status: 500 });
  }
  return new NextResponse(null, { status: 200 });
}
