import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { withContext } from "./db";
import { audit } from "./services/audit";
import { getSession, isPlatformAdmin } from "./session";
import { getRoles, resolveTenant, type PublicTenant } from "./tenant";

/** Só master da plataforma. Devolve o id do usuário. */
export async function requireMaster(returnTo = "/master"): Promise<{ userId: string; name: string }> {
  const session = await getSession();
  if (!session) redirect(`/login?voltar=${encodeURIComponent(returnTo)}`);
  if (!(await isPlatformAdmin(session.user.id))) redirect("/");
  return { userId: session.user.id, name: session.user.name };
}

export type StaffContext = {
  tenant: PublicTenant;
  userId: string;
  userName: string;
  roles: string[];
  /** Master acessando como suporte (sem vínculo na instituição). */
  support: boolean;
};

export const STAFF_ROLES = ["admin", "coordenacao", "secretaria", "financeiro", "professor"] as const;

/** Uma vez por requisição: quem é a pessoa nesta instituição. Acesso de suporte vai para a auditoria. */
const resolveStaff = cache(async (slug: string): Promise<StaffContext | "anonymous" | "outsider" | "missing"> => {
  const tenant = await resolveTenant(slug);
  if (!tenant) return "missing";
  const session = await getSession();
  if (!session) return "anonymous";
  const roles = await getRoles(tenant.id, session.user.id);
  if (roles.some((r) => (STAFF_ROLES as readonly string[]).includes(r))) {
    return { tenant, userId: session.user.id, userName: session.user.name, roles, support: false };
  }
  if (await isPlatformAdmin(session.user.id)) {
    await withContext({ tenantId: tenant.id, userId: session.user.id }, (c) =>
      audit(c, { tenantId: tenant.id, actorUserId: session.user.id, action: "support_access", entity: "admin_area" }),
    );
    return { tenant, userId: session.user.id, userName: session.user.name, roles: ["admin"], support: true };
  }
  return "outsider";
});

/**
 * Equipe da instituição com um dos perfis pedidos (administrador sempre pode).
 * Master entra como suporte com poderes de administrador.
 */
export async function requireStaff(slug: string, allowed: readonly string[], returnTo: string): Promise<StaffContext> {
  const ctx = await resolveStaff(slug);
  if (ctx === "missing") notFound();
  if (ctx === "anonymous") redirect(`/login?voltar=${encodeURIComponent(returnTo)}`);
  if (ctx === "outsider") redirect(`/t/${slug}`);
  if (ctx.tenant.status !== "active" && !ctx.support) redirect(`/t/${slug}`);
  if (!ctx.roles.some((r) => r === "admin" || allowed.includes(r))) redirect(`/t/${slug}/admin`);
  return ctx;
}

/** Para mostrar ou esconder ações: administrador sempre pode. */
export function can(ctx: StaffContext, ...roles: string[]): boolean {
  return ctx.roles.some((r) => r === "admin" || roles.includes(r));
}

/** Para Server Actions: mesma regra, mas devolve erro em vez de redirecionar quando falta perfil. */
export async function staffForAction(slug: string, allowed: readonly string[]): Promise<StaffContext | { error: string }> {
  const ctx = await resolveStaff(slug);
  if (typeof ctx === "string") return { error: "Sua sessão expirou ou você não tem acesso. Entre de novo." };
  if (!ctx.roles.some((r) => r === "admin" || allowed.includes(r))) return { error: "Seu perfil não permite esta ação." };
  return ctx;
}

export type MemberContext = { tenant: PublicTenant; userId: string; userName: string; roles: string[]; staff: boolean };

/** Qualquer pessoa com perfil na instituição (aluno ou equipe). Redireciona quem não entrou ou não é da casa. */
export async function requireMember(slug: string, returnTo: string): Promise<MemberContext> {
  const tenant = await resolveTenant(slug);
  if (!tenant) notFound();
  const session = await getSession();
  if (!session) redirect(`/login?voltar=${encodeURIComponent(returnTo)}`);
  const roles = await getRoles(tenant.id, session.user.id);
  if (roles.length === 0) redirect(`/t/${slug}`);
  return { tenant, userId: session.user.id, userName: session.user.name, roles, staff: roles.some((r) => (STAFF_ROLES as readonly string[]).includes(r)) };
}

/** Para Server Actions de aluno ou equipe. */
export async function memberForAction(slug: string): Promise<MemberContext | { error: string }> {
  const tenant = await resolveTenant(slug);
  const session = await getSession();
  if (!tenant || !session) return { error: "Sua sessão expirou. Entre de novo." };
  const roles = await getRoles(tenant.id, session.user.id);
  if (roles.length === 0) return { error: "Você não tem acesso a esta instituição." };
  return { tenant, userId: session.user.id, userName: session.user.name, roles, staff: roles.some((r) => (STAFF_ROLES as readonly string[]).includes(r)) };
}
