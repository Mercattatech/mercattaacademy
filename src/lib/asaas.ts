/**
 * Cliente fino da API v3 do Asaas. Cada instituição usa a própria chave.
 * ASAAS_BASE_URL permite apontar para um simulador (testes locais).
 */
export type AsaasEnv = "sandbox" | "production";

export class AsaasError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function baseUrl(env: AsaasEnv): string {
  return process.env.ASAAS_BASE_URL ?? (env === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3");
}

async function call<T>(env: AsaasEnv, apiKey: string, method: "GET" | "POST", path: string, body?: object): Promise<T> {
  const res = await fetch(`${baseUrl(env)}${path}`, {
    method,
    headers: { access_token: apiKey, "Content-Type": "application/json", "User-Agent": "pos-saas-plataforma" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    const errors = json.errors as { description?: string }[] | undefined;
    throw new AsaasError(errors?.[0]?.description ?? `Asaas respondeu ${res.status}`, res.status);
  }
  return json as T;
}

/** Confere se a chave funciona (e se pertence ao ambiente escolhido). */
export async function testConnection(env: AsaasEnv, apiKey: string): Promise<void> {
  await call(env, apiKey, "GET", "/finance/balance");
}

export async function createCustomer(env: AsaasEnv, apiKey: string, c: { name: string; email: string; cpf: string; reference: string }) {
  const out = await call<{ id: string }>(env, apiKey, "POST", "/customers", {
    name: c.name, email: c.email, cpfCnpj: c.cpf, externalReference: c.reference,
  });
  return out.id;
}

export type AsaasPayment = { id: string; status: string; invoiceUrl: string; dueDate: string; value: number; installment?: string };

/** À vista (installments = 1) ou parcelado; o aluno escolhe Pix, boleto ou cartão no link. */
export async function createCharge(
  env: AsaasEnv,
  apiKey: string,
  c: { customerId: string; totalCents: number; installments: number; dueDate: string; description: string; reference: string },
) {
  const base = { customer: c.customerId, billingType: "UNDEFINED", dueDate: c.dueDate, description: c.description, externalReference: c.reference };
  const body =
    c.installments > 1
      ? { ...base, installmentCount: c.installments, totalValue: c.totalCents / 100 }
      : { ...base, value: c.totalCents / 100 };
  return call<AsaasPayment>(env, apiKey, "POST", "/payments", body);
}
