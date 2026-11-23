import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Field, TextareaField } from "@/components/ui";
import { withContext } from "@/lib/db";
import { requireStaff } from "@/lib/guards";
import { getProfile } from "@/lib/services/communication";
import { saveProfileAction } from "../actions";

export default async function EditTeacherPage({ params }: { params: Promise<{ slug: string; userId: string }> }) {
  const { slug, userId } = await params;
  const ctx = await requireStaff(slug, ["coordenacao", "professor"], `/t/${slug}/admin/professores/${userId}`);
  const manager = ctx.roles.some((r) => r === "admin" || r === "coordenacao");
  if (!manager && ctx.userId !== userId) notFound();
  const profile = await withContext({ tenantId: ctx.tenant.id, userId: ctx.userId }, async (c) => {
    const ok = (await c.query("select 1 from memberships where user_id = $1 and role in ('professor', 'coordenacao', 'admin')", [userId])).rowCount;
    return ok ? getProfile(c, userId) : null;
  });
  if (!profile) notFound();

  return (
    <div className="flex flex-col gap-8">
      {manager && <p className="text-sm"><Link href={`/t/${slug}/admin/professores`} className="font-semibold text-brand-ink no-underline hover:underline">Professores</Link></p>}
      <h1 className="m-0 font-display text-[30px] leading-[1.15] font-[650] tracking-[-0.02em]">{ctx.userId === userId ? "Meu perfil de professor" : profile.name}</h1>
      <ActionForm action={saveProfileAction.bind(null, slug, userId)} submitLabel="Salvar perfil" className="mt-6 flex max-w-2xl flex-col gap-4">
        <Field label="Título" name="headline" id="p-headline" defaultValue={profile.headline} maxLength={120} hint="Ex.: Doutor em Fisiologia, USP." />
        <TextareaField label="Apresentação" id="p-bio" name="bio" rows={6} maxLength={2000} defaultValue={profile.bio} />
        <Field label="Link do currículo (opcional)" name="linkUrl" id="p-link" type="url" defaultValue={profile.link_url ?? ""} placeholder="https://" />
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" name="visible" defaultChecked={profile.visible} className="size-5" /> Aparecer na página Professores</label>
      </ActionForm>
    </div>
  );
}
