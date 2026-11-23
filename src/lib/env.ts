/** Verificação do ambiente de produção. Pura: recebe as variáveis e devolve o que está errado. */
export type EnvIssue = { key: string; level: "error" | "warning"; message: string };

const PLACEHOLDER = /troque|trocar|changeme|exemplo|segredo-longo|dev_?secret|pos_app_dev|pos_owner_dev/i;

export function checkEnv(env: Record<string, string | undefined>): EnvIssue[] {
  const issues: EnvIssue[] = [];
  const prod = env.NODE_ENV === "production";
  const need = (key: string, why: string) => {
    if (!env[key]) issues.push({ key, level: "error", message: `${key} não está definida. ${why}` });
    return env[key];
  };
  const secret = (key: string, why: string) => {
    const v = need(key, why);
    if (!v) return;
    if (v.length < 32) issues.push({ key, level: "error", message: `${key} é curta demais (mínimo de 32 caracteres).` });
    else if (PLACEHOLDER.test(v)) issues.push({ key, level: "error", message: `${key} ainda tem o valor de exemplo. Gere um segredo novo.` });
  };

  need("DATABASE_URL", "É a conexão do app com o Postgres (papel pos_app).");
  need("ROOT_DOMAIN", "As instituições ficam em <slug>.ROOT_DOMAIN.");
  secret("BETTER_AUTH_SECRET", "Assina as sessões de login.");
  secret("PAYMENT_SECRET", "Cifra a chave do Asaas de cada instituição.");

  const url = need("BETTER_AUTH_URL", "Endereço público da plataforma.");
  if (url && prod && !url.startsWith("https://")) issues.push({ key: "BETTER_AUTH_URL", level: "error", message: "Em produção a plataforma deve usar https." });
  if (env.ROOT_DOMAIN && prod && /localhost/.test(env.ROOT_DOMAIN)) issues.push({ key: "ROOT_DOMAIN", level: "error", message: "ROOT_DOMAIN ainda aponta para localhost." });
  if (env.DATABASE_URL && prod && PLACEHOLDER.test(env.DATABASE_URL)) issues.push({ key: "DATABASE_URL", level: "error", message: "A senha do banco ainda é a de exemplo." });

  if (prod) {
    if (!env.RESEND_API_KEY) issues.push({ key: "RESEND_API_KEY", level: "warning", message: "Sem Resend, convites e avisos por e-mail não são enviados." });
    if (!env.EMAIL_FROM || /localhost|seudominio/.test(env.EMAIL_FROM)) issues.push({ key: "EMAIL_FROM", level: "warning", message: "EMAIL_FROM precisa ser um endereço de domínio verificado no Resend." });
    if (!env.S3_ENDPOINT) issues.push({ key: "S3_ENDPOINT", level: "error", message: "Sem S3/MinIO os documentos dos alunos ficariam no disco do servidor (na Vercel somem). Configure o MinIO." });
    if (!env.DAILY_API_KEY) issues.push({ key: "DAILY_API_KEY", level: "warning", message: "Sem Daily, as aulas ao vivo não abrem sala." });
    else if (!env.DAILY_WEBHOOK_SECRET) issues.push({ key: "DAILY_WEBHOOK_SECRET", level: "error", message: "Com o Daily ligado, DAILY_WEBHOOK_SECRET é obrigatória (presença e gravação dependem do webhook)." });
  }
  return issues;
}

export const hasErrors = (issues: EnvIssue[]) => issues.some((i) => i.level === "error");
