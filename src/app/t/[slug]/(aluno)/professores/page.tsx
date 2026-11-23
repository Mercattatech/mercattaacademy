import { Page } from "@/components/ui";
import { withContext } from "@/lib/db";
import { requireMember } from "@/lib/guards";
import { listTeachers } from "@/lib/services/communication";

export default async function TeachersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await requireMember(slug, `/t/${slug}/professores`);
  const teachers = await withContext({ tenantId: m.tenant.id, userId: m.userId }, (c) => listTeachers(c, m.userId, m.staff));

  return (
    <Page>
      <h1 className="text-4xl font-bold tracking-tight">Professores</h1>
      {teachers.length === 0 ? <p className="mt-4 max-w-prose text-ink-muted">Os professores das suas turmas aparecem aqui quando o acesso estiver liberado.</p> : (
        <ul className="mt-6 grid max-w-3xl gap-8">
          {teachers.map((t) => (
            <li key={t.user_id} className="border-t border-line pt-4">
              <h2 className="text-2xl font-semibold">{t.name}</h2>
              {t.headline && <p className="text-ink-muted">{t.headline}</p>}
              {t.bio && <p className="mt-2 max-w-prose whitespace-pre-line">{t.bio}</p>}
              {t.link_url && <p className="mt-2"><a href={t.link_url} target="_blank" rel="noreferrer noopener" className="text-brand underline">Currículo e publicações</a></p>}
              {t.modules.length > 0 && (
                <>
                  <h3 className="mt-3 font-bold">Módulos</h3>
                  <ul className="list-disc pl-5">{t.modules.map((mod) => <li key={`${mod.cohort}-${mod.name}`}>{mod.name}{mod.cohort ? ` (${mod.cohort})` : ""}</li>)}</ul>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
