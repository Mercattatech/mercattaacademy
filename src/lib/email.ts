/**
 * Envio de e-mails (convites, avisos, recibos) pelo Resend.
 * Remetente: nome da instituição + endereço do domínio da plataforma, com
 * resposta indo para o e-mail da secretaria (replyTo).
 * Sem RESEND_API_KEY (desenvolvimento), só registra no console e não envia.
 */
export type EmailMessage = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  /** Nome que aparece como remetente, ex.: "Instituto Bressane". */
  fromName?: string;
  replyTo?: string;
};

export type EmailResult = { id: string; delivered: boolean };

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.EMAIL_FROM ?? "nao-responda@localhost";
  const from = message.fromName ? `${message.fromName} <${fromAddress}>` : fromAddress;

  if (!apiKey) {
    console.info("[email:dev] não enviado (sem RESEND_API_KEY)", { from, to: message.to, subject: message.subject });
    return { id: "dev", delivered: false };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      reply_to: message.replyTo,
    }),
  });

  if (!response.ok) {
    throw new Error(`Falha ao enviar e-mail (Resend ${response.status}): ${await response.text()}`);
  }
  const data = (await response.json()) as { id: string };
  return { id: data.id, delivered: true };
}
