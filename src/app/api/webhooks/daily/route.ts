import { NextResponse } from "next/server";
import { pool, withContext } from "@/lib/db";
import { applyVideoEvent, type VideoEvent } from "@/lib/services/lessons";
import { verifyWebhook } from "@/lib/video";

/**
 * Webhook do Daily (uma conta para a plataforma). Assinatura HMAC obrigatória.
 * Acha a aula pelo nome da sala. Responde 200 para tudo que for válido, até o que ignora.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyWebhook(raw, request.headers.get("x-webhook-signature"), request.headers.get("x-webhook-timestamp"))) {
    return new NextResponse("Assinatura inválida", { status: 401 });
  }
  let body: VideoEvent & { test?: string };
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse("JSON inválido", { status: 400 });
  }
  if (body.test) return NextResponse.json({ ok: true }); // teste de criação do webhook

  const payload = (body.payload ?? {}) as { room?: string; room_name?: string };
  const room = payload.room ?? payload.room_name;
  if (!room) return NextResponse.json({ ok: true });

  const found = (await pool.query<{ tenant_id: string; lesson_id: string }>("select * from app.lesson_by_room($1)", [room])).rows[0];
  if (!found) return NextResponse.json({ ok: true });

  await withContext({ tenantId: found.tenant_id }, (c) => applyVideoEvent(c, found.tenant_id, found.lesson_id, body));
  return NextResponse.json({ ok: true });
}
