import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { btnPrimary, inputCls, labelCls, PageHead, panelCls, Tag, tableCls, tableWrap, tdCls, thCls, trCls } from "@/components/admin-ui";
import { Icon } from "@/components/icon";
import { withContext } from "@/lib/db";
import { requireStaff } from "@/lib/guards";
import { ROLE_LABELS, type Role } from "@/lib/services/invites";
import { inviteStaffAction, removeMemberAction, revokeInviteAction } from "../actions";
import { cx } from "@/components/ui";

const ROLES = ["admin", "coordenacao", "secretaria", "financeiro", "professor"] as const;
const SHORT: Record<(typeof ROLES)[number], string> = { admin: "Admin.", coordenacao: "Coord.", secretaria: "Secretaria", financeiro: "Financeiro", professor: "Professor" };

/** Mesmas regras do menu e das páginas do painel: 1 = total, 0.5 = parcial, 0 = sem acesso. */
const PERM: [string, string, number[]][] = [
  ["Cursos e grade", "Coordenação edita; os demais só consultam.", [1, 1, 0.5, 0.5, 0.5]],
  ["Inscrições e documentos", "Financeiro vê inscrições e libera acesso, sem documentos.", [1, 0, 1, 0.5, 0]],
  ["Aulas e avaliações", "Professor vê só as próprias.", [1, 1, 0, 0, 0.5]],
  ["Notas e frequência", "Secretaria consulta; professor, só as próprias turmas.", [1, 1, 0.5, 0, 0.5]],
  ["Certificados", "", [1, 0, 1, 0, 0]],
  ["Pagamentos", "", [1, 0, 1, 1, 0]],
  ["Avisos e atendimento", "", [1, 1, 1, 0, 0]],
  ["Equipe, auditoria e configurações", "", [1, 0, 0, 0, 0]],
];

/** Equipe (protótipo): pessoas com papel, convites pendentes e a tabela do que cada papel vê. */
export default async function TeamPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ convidar?: string }> }) {
  const { slug } = await params;
  const { convidar } = await searchParams;
  const ctx = await requireStaff(slug, ["admin"], `/t/${slug}/admin/equipe`);
  const base = `/t/${slug}/admin/equipe`;
  const { members, invites } = await withContext({ tenantId: ctx.tenant.id }, async (c) => ({
    members: (
      await c.query<{ user_id: string; name: string; email: string; role: Role }>(
        `select m.user_id, u.name, u.email, m.role from memberships m join "user" u on u.id = m.user_id
         where m.role <> 'aluno' order by u.name, m.role`,
      )
    ).rows,
    invites: (
      await c.query<{ id: string; email: string; role: Role; expires_at: Date }>(
        `select id, email, role, expires_at from invites
         where role <> 'aluno' and accepted_at is null and revoked_at is null order by created_at desc`,
      )
    ).rows,
  }));
  const showInvite = convidar === "1";

  return (
    <div className="flex flex-col gap-7">
      <PageHead
        title="Equipe"
        sub="Cada pessoa vê só o que o papel dela permite. Alunos são convidados pela página da turma."
        action={
          !showInvite ? (
            <Link href={`${base}?convidar=1`} className={btnPrimary}>
              <Icon name="plus" size={20} />
              Convidar pessoa
            </Link>
          ) : undefined
        }
      />

      {showInvite && (
        <section aria-labelledby="convidar" className={`${panelCls} flex max-w-[760px] flex-col gap-4 p-5`}>
          <div className="flex items-start justify-between gap-3">
            <h2 id="convidar" className="m-0 font-sans text-lg font-semibold">Convidar pessoa</h2>
            <Link href={base} aria-label="Fechar" className="-mt-2 -mr-2 flex size-11 items-center justify-center rounded-[10px] text-ink-muted hover:bg-sunken">
              <Icon name="close" />
            </Link>
          </div>
          <ActionForm action={inviteStaffAction.bind(null, slug)} submitLabel="Enviar convite" pendingLabel="Enviando..." resetOnSuccess submitClassName={cx(btnPrimary, "self-start")} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelCls}>
                E-mail
                <input name="email" type="email" required className={inputCls} />
              </label>
              <label className={labelCls}>
                Nome
                <input name="name" className={inputCls} />
              </label>
              <label className={labelCls}>
                Papel
                <select name="role" defaultValue="professor" className={inputCls}>
                  {(["coordenacao", "professor", "secretaria", "financeiro", "admin"] as const).map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </label>
            </div>
          </ActionForm>
        </section>
      )}

      <div className={tableWrap}>
        <table className={tableCls}>
          <thead>
            <tr>
              <th scope="col" className={thCls}>Pessoa</th>
              <th scope="col" className={thCls}>Papel</th>
              <th scope="col" className={thCls}>Situação</th>
              <th scope="col" className={`${thCls} text-right`}>Ação</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={`${m.user_id}-${m.role}`} className={trCls}>
                <td className={tdCls}>
                  <strong className="font-semibold">{m.name}</strong>
                  <br />
                  <span className="text-[13px] text-ink-subtle">{m.email}</span>
                </td>
                <td className={tdCls}>{ROLE_LABELS[m.role]}</td>
                <td className={`${tdCls} text-ink-muted`}>{m.user_id === ctx.userId ? "Você" : "Ativo"}</td>
                <td className={`${tdCls} text-right`}>
                  {!(m.user_id === ctx.userId && m.role === "admin") && (
                    <form action={removeMemberAction.bind(null, slug, m.user_id, m.role)}>
                      <button type="submit" className="inline-flex h-10 items-center rounded-[9px] px-2.5 text-sm font-semibold text-danger hover:bg-danger-soft">
                        Remover acesso
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {invites.map((i) => {
              const expired = i.expires_at < new Date();
              return (
                <tr key={i.id} className={trCls}>
                  <td className={tdCls}>
                    <strong className="font-semibold">{i.email}</strong>
                  </td>
                  <td className={tdCls}>{ROLE_LABELS[i.role]}</td>
                  <td className={`${tdCls} text-ink-muted`}>
                    {expired ? <Tag tone="bad" small>Convite vencido</Tag> : <>Convite enviado · <span className="font-semibold text-warning">aguardando</span></>}
                  </td>
                  <td className={`${tdCls} text-right`}>
                    <form action={revokeInviteAction.bind(null, slug, i.id)}>
                      <button type="submit" className="inline-flex h-10 items-center rounded-[9px] px-2.5 text-sm font-semibold text-brand-ink hover:bg-brand-soft">
                        Cancelar convite
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section aria-labelledby="papeis" className="flex flex-col gap-3">
        <h2 id="papeis" className="m-0 font-sans text-lg font-semibold">O que cada papel vê</h2>
        <div className={tableWrap}>
          <table className={tableCls}>
            <thead>
              <tr>
                <th scope="col" className={thCls}>Área</th>
                {ROLES.map((r) => <th key={r} scope="col" className={`${thCls} text-center`}>{SHORT[r]}</th>)}
              </tr>
            </thead>
            <tbody>
              {PERM.map(([area, note, cells]) => (
                <tr key={area} className={trCls}>
                  <th scope="row" className={`${tdCls} text-left font-semibold`}>
                    {area}
                    {note && <span className="block text-[13px] font-normal text-ink-subtle">{note}</span>}
                  </th>
                  {cells.map((v, k) => (
                    <td key={ROLES[k]} className={`${tdCls} text-center`}>
                      <span className="inline-flex" aria-label={v === 1 ? "Acesso total" : v === 0 ? "Sem acesso" : "Acesso parcial"} role="img">
                        <Icon
                          name={v === 1 ? "checkCircle" : v === 0 ? "minus" : "pending"}
                          size={20}
                          className={v === 1 ? "text-success" : v === 0 ? "text-line-strong" : "text-warning"}
                        />
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
