import { sendEmail } from "./email";
import { ROLE_LABELS, type Role } from "./services/invites";
import { tenantUrl } from "./urls";

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

function layout(tenantName: string, body: string): string {
  return `<div style="font-family:Arial,sans-serif;max-width:520px;color:#1b2430;line-height:1.5">
  <p style="font-size:18px;font-weight:bold">${escape(tenantName)}</p>${body}
  <p style="color:#5b6675;font-size:13px">Se você não esperava este e-mail, pode ignorá-lo.</p></div>`;
}

/** Convite de equipe ou de aluno. Retorna o link para o caso de o e-mail não ser enviado (desenvolvimento). */
export async function sendInviteEmail(input: {
  tenantSlug: string;
  tenantName: string;
  email: string;
  name?: string | null;
  role: Role;
  token: string;
  cohortName?: string | null;
}) {
  const url = tenantUrl(input.tenantSlug, `/convite/${input.token}`);
  const greeting = input.name ? `Olá, ${escape(input.name.split(" ")[0])}.` : "Olá.";
  const what = input.cohortName
    ? `Você foi matriculado(a) na turma <b>${escape(input.cohortName)}</b>.`
    : `Você foi convidado(a) como <b>${escape(ROLE_LABELS[input.role])}</b>.`;
  const html = layout(
    input.tenantName,
    `<p>${greeting} ${what}</p><p>Para acessar, crie sua senha pelo link abaixo (válido por 7 dias):</p>
     <p><a href="${url}" style="background:#1f4e79;color:#fff;padding:10px 16px;text-decoration:none;border-radius:6px">Aceitar convite</a></p>`,
  );
  const result = await sendEmail({
    to: input.email,
    subject: input.cohortName ? `Sua matrícula em ${input.tenantName}` : `Convite para ${input.tenantName}`,
    html,
    text: `${what.replace(/<[^>]+>/g, "")} Acesse: ${url}`,
    fromName: input.tenantName,
  });
  return { url, delivered: result.delivered };
}

/** Aviso a quem já tinha conta e foi matriculado direto. */
export async function sendEnrolledEmail(input: { tenantSlug: string; tenantName: string; email: string; name: string; cohortName: string }) {
  const url = tenantUrl(input.tenantSlug, "/");
  await sendEmail({
    to: input.email,
    subject: `Sua matrícula em ${input.tenantName}`,
    html: layout(
      input.tenantName,
      `<p>Olá, ${escape(input.name.split(" ")[0])}. Você foi matriculado(a) na turma <b>${escape(input.cohortName)}</b>.</p>
       <p>Entre com o e-mail e a senha que você já usa: <a href="${url}">${url}</a></p>`,
    ),
    fromName: input.tenantName,
  });
}

/** Aviso da instituição enviado também por e-mail (opção de quem publica). */
export async function sendAnnouncementEmail(input: { tenantSlug: string; tenantName: string; to: string; name: string; title: string; body: string }) {
  const url = tenantUrl(input.tenantSlug, "/");
  const body = escape(input.body).replace(/\n/g, "<br>");
  await sendEmail({
    to: input.to,
    subject: `${input.tenantName}: ${input.title}`,
    html: layout(input.tenantName, `<p>Olá, ${escape(input.name.split(" ")[0])}.</p><p><b>${escape(input.title)}</b></p><p>${body}</p><p><a href="${url}">Abrir a plataforma</a></p>`),
    text: `${input.title}\n\n${input.body}\n\n${url}`,
    fromName: input.tenantName,
  });
}
