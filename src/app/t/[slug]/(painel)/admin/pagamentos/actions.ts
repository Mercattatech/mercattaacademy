"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/components/action-form";
import { AsaasError, testConnection } from "@/lib/asaas";
import { encryptSecret } from "@/lib/crypto";
import { withContext } from "@/lib/db";
import { staffForAction } from "@/lib/guards";
import { audit } from "@/lib/services/audit";
import { newWebhookToken } from "@/lib/services/payments";

const schema = z.object({
  apiKey: z.string().trim().max(400).default(""),
  environment: z.enum(["sandbox", "production"]),
});

/** Salva a conexão com o Asaas. Chave em branco mantém a atual. A chave é testada antes de salvar. */
export async function savePaymentSettingsAction(slug: string, _: ActionState, form: FormData): Promise<ActionState> {
  const s = await staffForAction(slug, []);
  if ("error" in s) return s;
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Escolha o ambiente (Sandbox ou Produção)." };
  const { apiKey, environment } = parsed.data;

  const existing = await withContext({ tenantId: s.tenant.id, userId: s.userId }, async (c) =>
    (await c.query<{ api_key_enc: string }>("select api_key_enc from payment_settings")).rows[0],
  );
  if (!apiKey && !existing) return { error: "Informe a chave de API do Asaas." };
  if (!apiKey && existing) {
    // Só troca o ambiente. A chave guardada precisa ser da conta certa, então peça a chave de novo.
    return { error: "Ao trocar o ambiente, cole a chave de API correspondente." };
  }

  try {
    await testConnection(environment, apiKey);
  } catch (error) {
    const reason = error instanceof AsaasError && error.status === 401 ? "O Asaas recusou a chave. Confira se ela é do ambiente escolhido." : "Não consegui falar com o Asaas agora. Tente de novo em instantes.";
    return { error: reason };
  }

  await withContext({ tenantId: s.tenant.id, userId: s.userId }, async (c) => {
    await c.query(
      `insert into payment_settings (tenant_id, api_key_enc, environment, webhook_token) values ($1, $2, $3, $4)
       on conflict (tenant_id) do update set api_key_enc = excluded.api_key_enc, environment = excluded.environment, updated_at = now()`,
      [s.tenant.id, encryptSecret(apiKey), environment, newWebhookToken()],
    );
    await audit(c, { tenantId: s.tenant.id, actorUserId: s.userId, action: "payment_settings_saved", entity: "payment_settings", data: { environment } });
  });
  revalidatePath(`/t/${slug}/admin/pagamentos`);
  return { ok: "Conexão com o Asaas salva." };
}
