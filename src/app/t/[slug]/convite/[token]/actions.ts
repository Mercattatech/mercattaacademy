"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/components/action-form";
import { auth } from "@/lib/auth";
import { pool, withContext } from "@/lib/db";
import { acceptInvite, lookupInvite } from "@/lib/services/invites";
import { getSession } from "@/lib/session";

const destination = (slug: string, role: string) => (role === "aluno" ? `/t/${slug}` : `/t/${slug}/admin`);

/** Pessoa já conectada com o e-mail do convite. */
export async function acceptInviteAction(slug: string, token: string, _: ActionState): Promise<ActionState> {
  const { state, invite } = await lookupInvite(pool, token);
  if (state !== "valid" || !invite || invite.tenant_slug !== slug) return { error: "Este convite não está mais disponível." };
  const session = await getSession();
  if (!session) return { error: "Entre na sua conta para aceitar." };
  if (session.user.email.toLowerCase() !== invite.email.toLowerCase()) {
    return { error: `Este convite é para ${invite.email}. Saia e entre com esse e-mail.` };
  }
  await withContext({ tenantId: invite.tenant_id, userId: session.user.id }, (c) => acceptInvite(c, invite, session.user.id));
  redirect(destination(slug, invite.role));
}

// Protótipo: nome e uma senha (com botão de mostrar), sem "repita a senha".
const signupSchema = z.object({
  name: z.string().trim().min(3, "Informe seu nome completo."),
  password: z.string().min(8, "A senha precisa de pelo menos 8 caracteres."),
});

/** Pessoa nova: cria a conta com o e-mail do convite, entra e aceita. */
export async function signUpAndAcceptAction(slug: string, token: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { state, invite } = await lookupInvite(pool, token);
  if (state !== "valid" || !invite || invite.tenant_slug !== slug) return { error: "Este convite não está mais disponível." };
  const parsed = signupSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const exists = await pool.query(`select 1 from "user" where lower(email) = lower($1)`, [invite.email]);
  if (exists.rowCount) return { error: "Já existe uma conta com este e-mail. Entre com sua senha para aceitar." };

  const result = await auth.api.signUpEmail({
    body: { name: parsed.data.name, email: invite.email, password: parsed.data.password },
    headers: await headers(),
  });
  await withContext({ tenantId: invite.tenant_id, userId: result.user.id }, (c) => acceptInvite(c, invite, result.user.id));
  redirect(destination(slug, invite.role));
}
