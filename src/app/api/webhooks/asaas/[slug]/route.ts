import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { withContext } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { applyAsaasEvent, type AsaasWebhook } from "@/lib/services/payments";
import { resolveTenant } from "@/lib/tenant";
import { tenantUrl } from "@/lib/urls";

/**
 * Webhook do Asaas da instituição. Só aceita com o token configurado.
 * Responde 200 para eventos válidos (mesmo os ignorados), porque o Asaas pausa a fila quando recebe erro.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await resolveTenant(slug);
  if (!tenant) return new NextResponse("Não encontrado", { status: 404 });

  const expected = await withContext({ tenantId: tenant.id }, async (c) =>
    (await c.query<{ webhook_token: string }>("select webhook_token from payment_settings")).rows[0]?.webhook_token,
  );
  const received = request.headers.get("asaas-access-token") ?? "";
  if (!expected || !safeEqual(received, expected)) return new NextResponse("Token inválido", { status: 401 });

  let body: AsaasWebhook;
  try {
    body = (await request.json()) as AsaasWebhook;
  } catch {
    return new NextResponse("JSON inválido", { status: 400 });
  }

  const outcome = await withContext({ tenantId: tenant.id }, (c) => applyAsaasEvent(c, tenant.id, body));
  if (outcome.released) {
    // E-mail é cortesia: se falhar, o acesso já foi liberado e o webhook deve responder 200.
    await sendEmail({
      to: outcome.released.email,
      subject: "Pagamento confirmado, acesso liberado",
      fromName: tenant.name,
      html: `<p>Olá, ${outcome.released.name.split(" ")[0]}.</p><p>Recebemos o pagamento de <b>${outcome.released.program}</b> e seu acesso está liberado.</p><p><a href="${tenantUrl(slug, "/")}">Entrar na plataforma</a></p>`,
      text: `Recebemos o pagamento de ${outcome.released.program} e seu acesso está liberado. Entre em ${tenantUrl(slug, "/")}`,
    }).catch(() => undefined);
  }
  return NextResponse.json({ ok: true });
}
