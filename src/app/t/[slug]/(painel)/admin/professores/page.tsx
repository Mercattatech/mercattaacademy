import Link from "next/link";
import { redirect } from "next/navigation";
import { withContext } from "@/lib/db";
import { requireStaff } from "@/lib/guards";
import { listTeachers } from "@/lib/services/communication";

export default async function AdminTeachersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireStaff(slug, ["coordenacao", "professor"], `/t/${slug}/admin/professores`);
  const manager = ctx.roles.some((r) => r === "admin" || r === "coordenacao");
  if (!manager) redirect(`/t/${slug}/admin/professores/${ctx.userId}`);
  const teachers = await withContext({ tenantId: ctx.tenant.id, userId: ctx.userId }, (c) => listTeachers(c, ctx.userId, true));

  return (
    <div className="flex flex-col gap-8">
      <h1 className="m-0 font-display text-[30px] leading-[1.15] font-[650] tracking-[-0.02em]">Professores</h1>
      <p className="mt-2 max-w-prose text-ink-muted">O mini CV aparece para os alunos das turmas em que a pessoa dá aula. Para incluir alguém, convide em Equipe com o perfil Professor.</p>
      {teachers.length === 0 ? <p className="mt-6 text-ink-muted">Nenhum professor ainda.</p> : (
        <ul className="mt-4 max-w-2xl border-t border-line">
          {teachers.map((t) => (
            <li key={t.user_id} className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line py-3">
              <div>
                <Link href={`/t/${slug}/admin/professores/${t.user_id}`} className="font-semibold text-ink no-underline hover:underline">{t.name}</Link>
                <p className="text-sm text-ink-muted">{t.headline || "Sem título"}. {t.visible ? "Visível" : "Oculto"}. {t.modules.length} módulo(s)</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
