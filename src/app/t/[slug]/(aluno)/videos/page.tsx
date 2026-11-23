import { notFound } from "next/navigation";
import { Empty, Group, RowLink, Screen, ScreenTitle, SectionTitle } from "@/components/student-ui";
import { withContext } from "@/lib/db";
import { videosForStudent } from "@/lib/services/videos";
import { loadStudent } from "../../_shell/student-context";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** Vídeos gravados dos módulos dos cursos em que o aluno tem acesso liberado. */
export default async function StudentVideosPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await loadStudent(slug, `/t/${slug}/videos`);
  if (!ctx.enabled.has("aulas_gravadas")) notFound();
  const groups = await withContext({ tenantId: ctx.tenant.id, userId: ctx.userId }, (c) => videosForStudent(c, ctx.userId));

  const programs = [...new Set(groups.map((g) => g.program_id))];

  return (
    <Screen gap="gap-6">
      <ScreenTitle sub={`Assista quando quiser, no seu ritmo.`}>Vídeos gravados</ScreenTitle>
      {groups.length === 0 ? (
        <Empty icon="video" title="Nenhum vídeo por enquanto">
          Os vídeos aparecem aqui quando a coordenação enviar e o seu acesso estiver liberado.
        </Empty>
      ) : (
        programs.map((pid) => {
          const mods = groups.filter((g) => g.program_id === pid);
          return (
            <section key={pid} className="flex flex-col gap-5">
              {programs.length > 1 && <SectionTitle>{mods[0].program_name}</SectionTitle>}
              {mods.map((g) => (
                <div key={g.module_id} className="flex flex-col gap-2">
                  <h2 className="m-0 flex items-baseline justify-between gap-3 font-sans text-[15px] font-semibold text-ink-muted">
                    <span>{g.module_name}</span>
                    <span className="text-[13px] font-medium">{g.videos.filter((v) => v.progress?.completed).length} de {g.videos.length} assistidos</span>
                  </h2>
                  <Group>
                    {g.videos.map((v) => (
                      <RowLink
                        key={v.id}
                        href={`/t/${slug}/videos/${v.id}`}
                        icon={v.progress?.completed ? "checkCircle" : "playCircle"}
                        iconTone={v.progress?.completed ? "success" : undefined}
                        title={v.title}
                        detail={v.progress?.completed ? "Assistido" : v.progress && v.progress.position > 5 ? `Parou em ${clock(v.progress.position)}` : v.description || undefined}
                        detailTone={v.progress?.completed ? "success" : undefined}
                      />
                    ))}
                  </Group>
                </div>
              ))}
            </section>
          );
        })
      )}
    </Screen>
  );
}
