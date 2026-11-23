import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell, AuthTitle } from "@/components/auth-shell";
import { Icon } from "@/components/icon";
import { pool } from "@/lib/db";
import { ROLE_LABELS, type Role } from "@/lib/services/invites";
import { getSession, isPlatformAdmin } from "@/lib/session";
import { tenantPath } from "@/lib/urls";
import { SwitchAccountButton } from "./switch-account-button";

export const metadata = { title: "Escolher instituição" };

type Institution = { slug: string; name: string; brand: { primary?: string }; roles: string[] };

/** Depois do login: quem tem uma só instituição entra direto; quem tem várias escolhe aqui. */
export default async function ChooseInstitutionPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [{ rows }, master] = await Promise.all([
    pool.query<Institution>("select * from app.my_institutions($1)", [session.user.id]),
    isPlatformAdmin(session.user.id),
  ]);
  if (rows.length === 1 && !master) redirect(tenantPath(rows[0].slug));

  const first = session.user.name.split(" ")[0];
  const empty = rows.length === 0 && !master;

  return (
    <AuthShell>
      <AuthTitle
        title={`Olá, ${first}`}
        subtitle={
          empty
            ? "Sua conta ainda não está ligada a nenhuma instituição. Peça o convite à secretaria ou escolha um curso na vitrine da instituição."
            : rows.length > 1
              ? `Você tem acesso a ${rows.length} instituições. Onde quer entrar?`
              : "Onde quer entrar?"
        }
      />
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {rows.map((i) => {
          const initials = i.name.split(/\s+/).filter((w) => w.length > 2).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || i.name[0].toUpperCase();
          return (
            <li key={i.slug}>
              <Link
                href={tenantPath(i.slug)}
                style={i.brand.primary ? ({ "--color-brand": i.brand.primary } as React.CSSProperties) : undefined}
                data-theme="tenant"
                className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface p-4 text-ink no-underline hover:border-brand hover:text-ink"
              >
                <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-[12px] bg-brand-soft font-display font-bold text-brand-ink">
                  {initials}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-base font-semibold">{i.name}</span>
                  <span className="text-sm text-ink-muted">{i.roles.map((r) => ROLE_LABELS[r as Role] ?? r).join(", ")}</span>
                </span>
                <Icon name="chevronRight" size={22} className="text-ink-subtle" />
              </Link>
            </li>
          );
        })}
        {master && (
          <li>
            <Link href="/master" className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface p-4 text-ink no-underline hover:border-brand hover:text-ink">
              <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-[12px] bg-ink font-display text-sm font-bold text-white">SSD</span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-base font-semibold">Painel master</span>
                <span className="text-sm text-ink-muted">Administração da plataforma</span>
              </span>
              <Icon name="chevronRight" size={22} className="text-ink-subtle" />
            </Link>
          </li>
        )}
      </ul>
      <SwitchAccountButton />
    </AuthShell>
  );
}
