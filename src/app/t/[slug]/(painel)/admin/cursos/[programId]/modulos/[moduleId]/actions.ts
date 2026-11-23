"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/components/action-form";
import { withContext } from "@/lib/db";
import { staffForAction } from "@/lib/guards";
import { audit } from "@/lib/services/audit";
import { isVideoType, videoKey, type VideoRow } from "@/lib/services/videos";
import { deleteFile, fileSize, MAX_VIDEO_BYTES, presignUpload, readRange, sniffVideo } from "@/lib/storage";
import { getEnabledFeatures } from "@/lib/tenant";

const page = (slug: string, programId: string, moduleId: string) => `/t/${slug}/admin/cursos/${programId}/modulos/${moduleId}`;
const MSG_OFF = "O recurso de aulas gravadas não está ligado para esta instituição. Peça à plataforma para ativar.";

async function guard(slug: string) {
  const s = await staffForAction(slug, ["coordenacao"]);
  if ("error" in s) return s;
  if (!(await getEnabledFeatures(s.tenant.id)).has("aulas_gravadas")) return { error: MSG_OFF };
  return s;
}

const startSchema = z.object({
  title: z.string().trim().min(2, "Dê um título ao vídeo (mínimo 2 letras).").max(160),
  description: z.string().trim().max(2000).default(""),
  fileName: z.string().max(300),
  size: z.number().int().positive(),
  contentType: z.string(),
});

export type StartUpload = { error: string } | { videoId: string; uploadUrl: string };

/** Passo 1: registra o vídeo e devolve o endereço para o navegador enviar o arquivo direto ao armazenamento. */
export async function startVideoUploadAction(slug: string, programId: string, moduleId: string, input: z.input<typeof startSchema>): Promise<StartUpload> {
  const s = await guard(slug);
  if ("error" in s) return s;
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (!isVideoType(d.contentType)) return { error: "Formato não aceito. Envie MP4, WebM ou MOV." };
  if (d.size > MAX_VIDEO_BYTES) return { error: "O vídeo passa de 2 GB. Comprima ou divida em partes." };

  const videoId = randomUUID();
  const key = videoKey(s.tenant.id, moduleId, videoId, d.contentType);
  const ok = await withContext({ tenantId: s.tenant.id, userId: s.userId }, async (c) => {
    const m = await c.query("select 1 from program_modules where id = $1 and program_id = $2", [moduleId, programId]);
    if (!m.rowCount) return false;
    await c.query(
      `insert into module_videos (id, tenant_id, module_id, position, title, description, storage_key, content_type, size_bytes, uploaded_by)
       values ($1, $2, $3, (select coalesce(max(position), 0) + 1 from module_videos where module_id = $3), $4, $5, $6, $7, $8, $9)`,
      [videoId, s.tenant.id, moduleId, d.title, d.description, key, d.contentType, d.size, s.userId],
    );
    return true;
  });
  if (!ok) return { error: "Módulo não encontrado." };
  const uploadUrl = (await presignUpload(key, d.contentType)) ?? `/api/video-upload/${slug}/${videoId}`;
  return { videoId, uploadUrl };
}

/** Passo 2: confere o arquivo enviado (tamanho e formato) e libera o vídeo para os alunos. */
export async function finishVideoUploadAction(slug: string, programId: string, moduleId: string, videoId: string): Promise<ActionState> {
  const s = await guard(slug);
  if ("error" in s) return s;
  const v = await withContext({ tenantId: s.tenant.id, userId: s.userId }, async (c) =>
    (await c.query<VideoRow>("select * from module_videos where id = $1 and module_id = $2 and status = 'uploading'", [videoId, moduleId])).rows[0],
  );
  if (!v) return { error: "Envio não encontrado." };

  const size = await fileSize(v.storage_key);
  let reason: string | null = null;
  if (size == null) reason = "O arquivo não chegou ao armazenamento. Tente enviar de novo.";
  else if (String(size) !== v.size_bytes) reason = "O arquivo chegou incompleto. Tente enviar de novo.";
  else {
    const head = new Uint8Array(await new Response(await readRange(v.storage_key, 0, 11)).arrayBuffer());
    if (!sniffVideo(head)) reason = "O arquivo não parece ser um vídeo MP4, WebM ou MOV.";
  }
  if (reason) {
    await discard(s.tenant.id, s.userId, v);
    return { error: reason };
  }
  await withContext({ tenantId: s.tenant.id, userId: s.userId }, async (c) => {
    await c.query("update module_videos set status = 'ready' where id = $1", [videoId]);
    await audit(c, { tenantId: s.tenant.id, actorUserId: s.userId, action: "video_added", entity: "module_video", entityId: videoId, data: { title: v.title } });
  });
  revalidatePath(page(slug, programId, moduleId));
  return { ok: "Vídeo enviado e liberado para os alunos." };
}

async function discard(tenantId: string, userId: string, v: Pick<VideoRow, "id" | "storage_key">) {
  await deleteFile(v.storage_key).catch(() => {});
  await withContext({ tenantId, userId }, (c) => c.query("delete from module_videos where id = $1", [v.id]));
}

/** Desistência no meio do envio: apaga o registro e o que já chegou. */
export async function cancelVideoUploadAction(slug: string, moduleId: string, videoId: string): Promise<void> {
  const s = await guard(slug);
  if ("error" in s) return;
  const v = await withContext({ tenantId: s.tenant.id, userId: s.userId }, async (c) =>
    (await c.query<VideoRow>("select * from module_videos where id = $1 and module_id = $2 and status = 'uploading'", [videoId, moduleId])).rows[0],
  );
  if (v) await discard(s.tenant.id, s.userId, v);
}

const editSchema = z.object({ title: z.string().trim().min(2, "Dê um título ao vídeo.").max(160), description: z.string().trim().max(2000).default("") });

export async function updateVideoAction(slug: string, programId: string, moduleId: string, videoId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const s = await guard(slug);
  if ("error" in s) return s;
  const parsed = editSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await withContext({ tenantId: s.tenant.id, userId: s.userId }, (c) =>
    c.query("update module_videos set title = $2, description = $3 where id = $1", [videoId, parsed.data.title, parsed.data.description]),
  );
  revalidatePath(page(slug, programId, moduleId));
  return { ok: "Vídeo salvo." };
}

export async function deleteVideoAction(slug: string, programId: string, moduleId: string, videoId: string): Promise<void> {
  const s = await guard(slug);
  if ("error" in s) return;
  await withContext({ tenantId: s.tenant.id, userId: s.userId }, async (c) => {
    const v = (await c.query<VideoRow>("delete from module_videos where id = $1 and module_id = $2 returning *", [videoId, moduleId])).rows[0];
    if (!v) return;
    await c.query("update module_videos set position = position - 1 where module_id = $1 and position > $2", [moduleId, v.position]);
    await audit(c, { tenantId: s.tenant.id, actorUserId: s.userId, action: "video_deleted", entity: "module_video", entityId: videoId, data: { title: v.title } });
    await deleteFile(v.storage_key).catch(() => {});
  });
  revalidatePath(page(slug, programId, moduleId));
}

export async function moveVideoAction(slug: string, programId: string, moduleId: string, videoId: string, dir: "up" | "down"): Promise<void> {
  const s = await guard(slug);
  if ("error" in s) return;
  await withContext({ tenantId: s.tenant.id, userId: s.userId }, async (c) => {
    const list = (await c.query<{ id: string; position: number }>("select id, position from module_videos where module_id = $1 order by position", [moduleId])).rows;
    const i = list.findIndex((x) => x.id === videoId);
    const j = dir === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= list.length) return;
    // Troca em duas etapas para não esbarrar em posições repetidas.
    await c.query("update module_videos set position = position + 1000 where id = any($1)", [[list[i].id, list[j].id]]);
    await c.query("update module_videos set position = $2 where id = $1", [list[i].id, list[j].position]);
    await c.query("update module_videos set position = $2 where id = $1", [list[j].id, list[i].position]);
  });
  revalidatePath(page(slug, programId, moduleId));
}
