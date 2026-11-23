import Link from "next/link";
import { notFound } from "next/navigation";
import { AuthBadge, AuthShell, AuthTitle, authCta } from "@/components/auth-shell";
import { Icon } from "@/components/icon";
import { pool } from "@/lib/db";
import { lookupInvite, ROLE_LABELS } from "@/lib/services/invites";
import { getSession } from "@/lib/session";
import { resolveTenant } from "@/lib/tenant";
import { acceptInviteAction, signUpAndAcceptAction } from "./actions";
import { InviteAcceptButton, InviteSignupForm } from "./invite-forms";
import { SignOutButton } from "./sign-out-button";

const UNAVAILABLE = {
  missing: "Este link de convite não existe. Confira se copiou o endereço inteiro.",
  expired: "Este convite venceu. Peça à secretaria um novo convite.",
  used: "Este convite já foi usado. Entre com seu e-mail e senha.",
  revoked: "Este convite foi cancelado pela instituição.",
} as const;

export const metadata = { title: "Aceitar convite" };

/** Aceitar convite (protótipo, aba Login e cadastro): mesma moldura das telas de acesso, com o logo da instituição. */
export default async function InvitePage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const tenant = await resolveTenant(slug);
  if (!tenant) notFound();
  const { state, invite } = await lookupInvite(pool, token);
  const returnTo = `/t/${slug}/convite/${token}`;

  if (state !== "valid" || !invite || invite.tenant_slug !== slug) {
    const message = state === "valid" ? UNAVAILABLE.missing : UNAVAILABLE[state];
    return (
      <AuthShell tenant={tenant}>
        <AuthBadge icon="mail" tone="brand" />
        <AuthTitle title="Convite indisponível" subtitle={message} />
        <Link href={`/login?voltar=/t/${slug}`} className={authCta}>Entrar</Link>
      </AuthShell>
    );
  }

  const what = invite.cohort_id ? "como aluno(a)" : `para a equipe como ${ROLE_LABELS[invite.role]}`;
  const until = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "numeric", month: "short" }).format(invite.expires_at).replace(".", "");
  const session = await getSession();
  const sameEmail = session?.user.email.toLowerCase() === invite.email.toLowerCase();
  const hasAccount = (await pool.query(`select 1 from "user" where lower(email) = lower($1)`, [invite.email])).rowCount === 1;

  return (
    <AuthShell tenant={tenant}>
      <div className="flex gap-3 rounded-[14px] bg-brand-soft px-4 py-3.5">
        <Icon name="mail" size={24} className="text-brand-ink" />
        <span className="text-sm">
          <strong>{invite.tenant_name}</strong> convidou você {what}. O convite vale até {until}.
        </span>
      </div>
      <AuthTitle title="Aceitar convite" subtitle={invite.email} />

      {session && sameEmail && <InviteAcceptButton action={acceptInviteAction.bind(null, slug, token)} />}

      {session && !sameEmail && (
        <>
          <p className="m-0 text-[15px] text-ink-muted">
            Você está conectado(a) como <strong className="text-ink">{session.user.email}</strong>. Saia para aceitar com o e-mail do convite.
          </p>
          <SignOutButton />
        </>
      )}

      {!session && hasAccount && (
        <>
          <p className="m-0 text-[15px] text-ink-muted">Você já tem conta com este e-mail. Entre com sua senha e o convite é aceito na hora.</p>
          <Link href={`/login?voltar=${encodeURIComponent(returnTo)}`} className={authCta}>
            Entrar e aceitar
          </Link>
        </>
      )}

      {!session && !hasAccount && (
        <>
          <InviteSignupForm action={signUpAndAcceptAction.bind(null, slug, token)} defaultName={invite.name ?? ""} />
          <p className="m-0 text-sm text-ink-muted">
            Já tem conta com este e-mail?{" "}
            <Link href={`/login?voltar=${encodeURIComponent(returnTo)}`} className="font-semibold text-brand-ink underline underline-offset-2">
              Entre
            </Link>{" "}
            e o convite é aceito na hora.
          </p>
        </>
      )}
    </AuthShell>
  );
}
