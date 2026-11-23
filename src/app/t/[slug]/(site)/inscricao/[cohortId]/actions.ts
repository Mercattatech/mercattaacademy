"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/components/action-form";
import { auth } from "@/lib/auth";
import { pool, withContext } from "@/lib/db";
import { startEnrollment } from "@/lib/services/documents";
import { getSession } from "@/lib/session";
import { resolveTenant } from "@/lib/tenant";

const CLOSED = "Esta turma não está com inscrições abertas.";

async function openTenant(slug: string) {
  const tenant = await resolveTenant(slug);
  return tenant && tenant.status === "active" ? tenant : null;
}

/** Pessoa já conectada: cria a inscrição e segue para a área do aluno. */
export async function enrollAction(slug: string, cohortId: string, _: ActionState): Promise<ActionState> {
  const tenant = await openTenant(slug);
  if (!tenant) return { error: "Esta instituição não está recebendo inscrições agora." };
  const session = await getSession();
  if (!session) return { error: "Entre na sua conta para se inscrever." };
  const result = await withContext({ tenantId: tenant.id, userId: session.user.id }, (c) =>
    startEnrollment(c, { tenantId: tenant.id, cohortId, userId: session.user.id }),
  );
  if (!result.ok) return { error: CLOSED };
  redirect(`/t/${slug}/inscricoes`);
}

// Protótipo: senha única com botão de mostrar (no lugar de "repita a senha") e concordância com a política de privacidade.
const signupSchema = z.object({
  name: z.string().trim().min(3, "Informe seu nome completo, como no diploma."),
  email: z.string().trim().email("Confira o e-mail. Ex.: nome@email.com"),
  password: z.string().min(8, "A senha precisa de pelo menos 8 caracteres."),
  consent: z.literal("on", { error: "Marque a concordância para continuar." }),
});

/** Pessoa nova: cria a conta, entra e faz a inscrição. */
export async function signUpAndEnrollAction(slug: string, cohortId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const tenant = await openTenant(slug);
  if (!tenant) return { error: "Esta instituição não está recebendo inscrições agora." };
  const parsed = signupSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const open = await withContext({ tenantId: tenant.id }, async (c) =>
    (await c.query(
      `select 1 from cohorts co join programs p on p.tenant_id = co.tenant_id and p.id = co.program_id
       where co.id = $1 and co.status = 'open' and p.status = 'published'
         and (co.enrollment_opens_on is null or co.enrollment_opens_on <= current_date)
         and (co.enrollment_closes_on is null or co.enrollment_closes_on >= current_date)`,
      [cohortId],
    )).rowCount,
  );
  if (!open) return { error: CLOSED };

  const exists = await pool.query(`select 1 from "user" where lower(email) = lower($1)`, [parsed.data.email]);
  if (exists.rowCount) return { error: "Já existe uma conta com este e-mail. Entre com sua senha para se inscrever." };

  const created = await auth.api.signUpEmail({
    body: { name: parsed.data.name, email: parsed.data.email, password: parsed.data.password },
    headers: await headers(),
  });
  await withContext({ tenantId: tenant.id, userId: created.user.id }, (c) =>
    startEnrollment(c, { tenantId: tenant.id, cohortId, userId: created.user.id }),
  );
  redirect(`/t/${slug}/inscricoes`);
}
