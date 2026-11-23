import Link from "next/link";
import { notFound } from "next/navigation";
import { BackHeader, Group, Screen, ScreenTitle } from "@/components/student-ui";
import { Icon } from "@/components/icon";
import { withContext } from "@/lib/db";
import { STAFF_ROLES } from "@/lib/guards";
import { progressOfUser, studentCanWatch, type VideoRow } from "@/lib/services/videos";
import { loadStudent } from "../../../_shell/student-context";
import { VideoPlayer } from "./video-player";

/** Player do vídeo gravado, com a lista dos outros vídeos do mesmo módulo. */
export default async function WatchVideoPage({ params }: { params: Promise<{ slug: string; videoId: string }> }) {
  const { slug, videoId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(videoId)) notFound();
  const ctx = await loadStudent(slug, `/t/${slug}/videos/${videoId}`);
  if (!ctx.enabled.has("aulas_gravadas")) notFound();

  const data = await withContext({ tenantId: ctx.tenant.id, userId: ctx.userId }, async (c) => {
    const v = (await c.query<VideoRow & { module_name: string }>(
      `select v.*, m.name as module_name from module_videos v join program_modules m on m.tenant_id = v.tenant_id and m.id = v.module_id
        where v.id = $1 and v.status = 'ready'`,
      [videoId],
    )).rows[0];
    if (!v) return null;
    const staff = ctx.roles.some((r) => (STAFF_ROLES as readonly string[]).includes(r));
    const student = await studentCanWatch(c, v.module_id, ctx.userId);
    if (!staff && !student) return null;
    const siblings = (await c.query<{ id: string; title: string }>("select id, title from module_videos where module_id = $1 and status = 'ready' order by position", [v.module_id])).rows;
    return { v, siblings, student, progress: await progressOfUser(c, ctx.userId) };
  });
  if (!data) notFound();
  const { v, siblings, student, progress } = data;
  const mine = progress.get(v.id);
  const i = siblings.findIndex((s) => s.id === v.id);
  const next = siblings[i + 1];

  return (
    <Screen gap="gap-5">
      <BackHeader href={`/t/${slug}/videos`} title="Vídeos gravados" />
      <VideoPlayer
        key={v.id}
        slug={slug}
        videoId={v.id}
        src={`/t/${slug}/video-arquivo/${v.id}`}
        startAt={mine?.position ?? 0}
        alreadyWatched={mine?.completed ?? false}
        track={student}
      />
      <ScreenTitle size="md" sub={v.module_name}>{v.title}</ScreenTitle>
      {v.description && <p className="m-0 whitespace-pre-line text-[15px] text-ink-muted">{v.description}</p>}

      {siblings.length > 1 && (
        <div className="flex flex-col gap-2">
          <h2 className="m-0 font-sans text-[15px] font-semibold text-ink-muted">Neste módulo</h2>
          <Group>
            {siblings.map((s, n) => (
              <Link
                key={s.id}
                href={`/t/${slug}/videos/${s.id}`}
                aria-current={s.id === v.id ? "page" : undefined}
                className={`flex min-h-14 items-center gap-3 border-t border-line px-4 py-3 text-[15px] no-underline first:border-t-0 hover:bg-canvas ${s.id === v.id ? "font-semibold text-brand-ink" : "text-ink"}`}
              >
                <Icon name={s.id === v.id ? "play" : "playCircle"} size={20} className={s.id === v.id ? "text-brand" : "text-ink-muted"} />
                <span className="flex-1">{n + 1}. {s.title}</span>
                {student && progress.get(s.id)?.completed && <Icon name="checkCircle" size={20} className="text-success" aria-label="Assistido" />}
              </Link>
            ))}
          </Group>
          {next && <Link href={`/t/${slug}/videos/${next.id}`} className="text-sm font-semibold text-brand-ink">Próximo: {next.title}</Link>}
        </div>
      )}
    </Screen>
  );
}
