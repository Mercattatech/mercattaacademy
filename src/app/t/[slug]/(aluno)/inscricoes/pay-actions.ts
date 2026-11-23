"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { parseCpf } from "@/lib/cpf";
import { startCheckout } from "@/lib/services/payments";
import { getSession } from "@/lib/session";
import { resolveTenant } from "@/lib/tenant";

const MESSAGES = {
  not_configured: "O pagamento online ainda não foi ativado. A secretaria vai combinar a forma de pagamento com você.",
  no_price: "Este curso ainda não tem valor definido. Fale com a secretaria.",
  not_in_payment: "Esta inscrição não está na etapa de pagamento.",
  bad_installments: "Escolha uma quantidade de parcelas válida para este curso.",
} as const;

/** Gera a cobrança no Asaas da instituição e leva o aluno ao link de pagamento. */
export async function payAction(slug: string, enrollmentId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const tenant = await resolveTenant(slug);
  const session = await getSession();
  if (!tenant || tenant.status !== "active" || !session) return { error: "Sua sessão expirou. Entre de novo." };
  const cpf = parseCpf(String(form.get("cpf") ?? ""));
  if (!cpf) return { error: "CPF inválido. Confira os 11 números." };

  const result = await startCheckout({
    tenantId: tenant.id, userId: session.user.id, enrollmentId, cpf, installments: Number(form.get("installments") ?? 1),
  });
  if (!result.ok) return { error: result.error === "asaas" ? `O Asaas recusou a cobrança: ${result.message}` : MESSAGES[result.error] };
  redirect(result.invoiceUrl);
}
