import { withContext } from "@/lib/db";
import { requireStaff, STAFF_ROLES } from "@/lib/guards";
import { ROLE_LABELS, type Role } from "@/lib/services/invites";
import { getLabels } from "@/lib/tenant";
import { TenantLogo } from "../../_shell/shells";
import { AdminShell, type NavGroup, type NavItem } from "./admin-nav";

export default async function AdminLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireStaff(slug, STAFF_ROLES, `/t/${slug}/admin`);
  const labels = await getLabels(ctx.tenant.id);
  const isAdmin = ctx.roles.includes("admin");

  const has = (...roles: string[]) => ctx.roles.some((r) => r === "admin" || roles.includes(r));
  const badges = await withContext({ tenantId: ctx.tenant.id, userId: ctx.userId }, async (c) => {
    const out: Record<string, number> = {};
    if (has("secretaria")) {
      out["/documentos"] = (
        await c.query<{ n: number }>("select count(*)::int as n from student_documents where status = 'sent' and approved_at is null")
      ).rows[0].n;
    }
    if (has("coordenacao", "secretaria")) {
      out["/atendimento"] = (
        await c.query<{ n: number }>(
          `select count(*)::int as n from support_threads t where t.status = 'open'
             and coalesce((select m.staff from support_messages m where m.thread_id = t.id order by m.created_at desc, m.id desc limit 1), false) = false`,
        )
      ).rows[0].n;
    }
    return out;
  });
  const item = (show: boolean, href: string, label: string, icon: NavItem["icon"]): NavItem[] =>
    show ? [{ href, label, icon, badge: badges[href] || undefined }] : [];

  const groups = (
    [
    { title: "", items: [{ href: "", label: "Visão geral", icon: "dashboard" }] },
    {
      title: "Acadêmico",
      items: [
        { href: "/cursos", label: labels.program.plural, icon: "school" },
        ...item(has("secretaria", "financeiro"), "/inscricoes", "Inscrições", "howToReg"),
        ...item(has("secretaria"), "/documentos", "Documentos", "file"),
        ...item(has("coordenacao", "professor"), "/aulas", labels.lesson.plural, "calendar"),
        ...item(has("coordenacao", "professor"), "/avaliacoes", "Avaliações", "grading"),
        ...item(has("coordenacao", "secretaria", "professor"), "/notas", "Notas e frequência", "assignment"),
        ...item(has("coordenacao", "professor"), "/professores", "Professores", "teachers"),
        ...item(has("secretaria"), "/certificados", "Certificados", "award"),
      ],
    },
    { title: "Financeiro", items: item(has("secretaria", "financeiro"), "/pagamentos", "Pagamentos", "payments") },
    {
      title: "Comunicação",
      items: [...item(has("coordenacao", "secretaria"), "/avisos", "Avisos", "campaign"), ...item(has("coordenacao", "secretaria"), "/atendimento", "Atendimento", "support")],
    },
    {
      title: "Configurações",
      items: [...item(isAdmin, "/equipe", "Equipe", "teachers"), ...item(isAdmin, "/auditoria", "Auditoria", "history"), ...item(isAdmin, "/configuracoes", "Configurações", "settings")],
    },
    ] satisfies NavGroup[]
  ).filter((g) => g.items.length);

  const roleLabel = ctx.support
    ? "Suporte da plataforma"
    : ctx.roles
        .filter((r) => (STAFF_ROLES as readonly string[]).includes(r))
        .map((r) => ROLE_LABELS[r as Role] ?? r)
        .join(", ");
  const root = process.env.ROOT_DOMAIN ?? "localhost:3000";
  const initials = (name: string) => name.split(" ").filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase()).join("");

  return (
    <AdminShell
      slug={slug}
      groups={groups}
      logo={<TenantLogo tenant={ctx.tenant} className="h-11 max-w-[200px] object-contain object-left" />}
      logoShort={initials(ctx.tenant.name)}
      userName={ctx.userName}
      initials={initials(ctx.userName)}
      roleLabel={roleLabel}
      canSearch={has("secretaria", "financeiro")}
      support={ctx.support}
      supportExit={`${root.startsWith("localhost") ? "http" : "https"}://${root}/master`}
    >
      {children}
    </AdminShell>
  );
}
