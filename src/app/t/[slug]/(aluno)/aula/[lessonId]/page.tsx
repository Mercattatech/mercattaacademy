import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Icon } from "@/components/icon";
import { Avatar, BackHeader, Chip, primaryBtn, Screen, SectionTitle, StateBlock, textBtn } from "@/components/student-ui";
import { withContext } from "@/lib/db";
import { agoText, formatDuration, shortDate, whenText } from "@/lib/format";
import { listComments } from "@/lib/services/communication";
import { joinUrlFor, lessonState, roomAccess } from "@/lib/services/lessons";
import { getSession } from "@/lib/session";
import { getLabels, getRoles, resolveTenant } from "@/lib/tenant";
import { recordingLink } from "@/lib/video";
import { addCommentAction, deleteCommentAction } from "./actions";
import { btn, fieldLargeCls } from "@/components/ui";

type Lesson = { id: string; title: string; starts_at: Date; duration_minutes: number; status: string; recording_id: string | null; recording_seconds: number | null; module_name: string; teacher_name: string | null };

export default async function LessonPage({ params }: { params: Promise<{ slug: string; lessonId: string }> }) {
  const { slug, lessonId } = await params;
  const tenant = await resolveTenant(slug);
  if (!tenant || !/^[0-9a-f-]{36}$/i.test(lessonId)) notFound();
  const session = await getSession();
  if (!session) redirect(`/login?voltar=${encodeURIComponent(`/t/${slug}/aula/${lessonId}`)}`);
  const labels = await getLabels(tenant.id);
  const roles = await getRoles(tenant.id, session.user.id);

  const data = await withContext({ tenantId: tenant.id, userId: session.user.id }, async (c) => {
    const access = await roomAccess(c, lessonId, session.user.id, roles);
    if (!access) {
      const exists = (await c.query<{ module_name: string }>(
        `select cm.name as module_name from lessons l join cohort_modules cm on cm.tenant_id = l.tenant_id and cm.id = l.cohort_module_id where l.id = $1`, [lessonId],
      )).rows[0];
      return exists ? { locked: true as const, moduleName: exists.module_name } : null;
    }
    const lesson = (await c.query<Lesson>(
      `select l.id, l.title, l.starts_at, l.duration_minutes, l.status, l.recording_id, l.recording_seconds, cm.name as module_name, u.name as teacher_name
       from lessons l join cohort_modules cm on cm.tenant_id = l.tenant_id and cm.id = l.cohort_module_id left join "user" u on u.id = l.teacher_id where l.id = $1`, [lessonId],
    )).rows[0];
    const materials = (await c.query<{ id: string; file_name: string }>("select id, file_name from lesson_materials where lesson_id = $1 order by created_at", [lessonId])).rows;
    let joinUrl: string | null = null;
    let videoError: string | null = null;
    if (lesson.status === "live") {
      try {
        joinUrl = await joinUrlFor(c, { lessonId, userId: session.user.id, userName: session.user.name, owner: access.kind === "manager" });
      } catch {
        videoError = "Não foi possível abrir a sala agora. Atualize a página em instantes.";
      }
    }
    return { locked: false as const, access, lesson, materials, joinUrl, videoError, comments: await listComments(c, lessonId) };
  });
  if (!data) notFound();

  if (data.locked) {
    return (
      <div className="flex min-h-[calc(100dvh-110px)] flex-col md:min-h-0">
        <BackHeader href={`/t/${slug}/aulas`} title={labels.lesson.singular} />
        <div className="flex flex-1 flex-col gap-4 px-6 pt-6 pb-7 md:px-0">
          <div className="flex flex-1 flex-col justify-center">
            <StateBlock icon="lock" tone="muted" title={`Esta ${labels.lesson.singular.toLowerCase()} ainda não está liberada`}>
              {data.moduleName} abre quando sua matrícula estiver completa: documentos enviados e pagamento confirmado. Pagamentos por Pix são confirmados em poucos minutos.
            </StateBlock>
          </div>
          <Link href={`/t/${slug}/inscricoes`} className={primaryBtn}>Ver minha matrícula</Link>
          <Link href={`/t/${slug}/aulas`} className={textBtn}>Voltar para {labels.lesson.plural.toLowerCase()}</Link>
        </div>
      </div>
    );
  }

  const { access, lesson, materials, joinUrl, videoError, comments } = data;
  const canModerate = roles.some((r) => r === "admin" || r === "coordenacao") || (roles.includes("professor") && access.kind === "manager");
  const state = lessonState(lesson);
  const seconds = lesson.recording_seconds ?? lesson.duration_minutes * 60;

  let videoUrl: string | null = null;
  if (state === "recorded" && lesson.recording_id) {
    try {
      videoUrl = await recordingLink(lesson.recording_id);
    } catch {
      videoUrl = null;
    }
  }

  const Placeholder = ({ icon, text }: { icon: "clock" | "video" | "lock" | "cancel"; text: string }) => (
    <div className="flex aspect-video flex-col items-center justify-center gap-2 bg-[repeating-linear-gradient(135deg,#2A2B30_0_10px,#232428_10px_20px)] px-6 text-center text-[#C9CAC6] md:rounded-2xl">
      <Icon name={icon} size={32} />
      <span className="max-w-[34ch] text-sm">{text}</span>
    </div>
  );

  return (
    <>
      <BackHeader href={`/t/${slug}/aulas`} title={labels.lesson.singular} />

      <section aria-label="Vídeo da aula">
        {state === "live" && joinUrl && (
          <iframe title={`Sala da aula ${lesson.title}`} src={joinUrl} allow="camera; microphone; fullscreen; display-capture; autoplay" className="h-[70dvh] min-h-96 w-full border-0 bg-black md:rounded-2xl" />
        )}
        {state === "live" && !joinUrl && <Placeholder icon="video" text={videoError ?? "A sala ainda não está disponível. Atualize em instantes."} />}
        {state === "scheduled" && <Placeholder icon="clock" text={`${whenText(lesson.starts_at)}. A sala abre quando o professor iniciar a aula.`} />}
        {state === "ended" && <Placeholder icon="video" text="A aula foi encerrada. A gravação aparece aqui assim que estiver pronta." />}
        {state === "canceled" && <Placeholder icon="cancel" text="Esta aula foi cancelada." />}
        {state === "recorded" &&
          (videoUrl ? (
            <video controls preload="metadata" src={videoUrl} className="aspect-video w-full bg-black md:rounded-2xl" aria-label={`Gravação da aula ${lesson.title}`} />
          ) : (
            <Placeholder icon="video" text="Não foi possível carregar a gravação agora. Atualize a página." />
          ))}
      </section>

      <Screen gap="gap-5" className="pt-5 md:pt-6">
        <div>
          <span className="text-[13px] font-semibold text-ink-subtle">{lesson.module_name.toUpperCase()}</span>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="m-0 font-display text-2xl font-[650] leading-[1.15] tracking-[-0.015em]">{lesson.title}</h1>
            {state === "live" && <Chip tone="brand" icon="video">Ao vivo agora</Chip>}
          </div>
          <p className="mt-1.5 mb-0 text-sm text-ink-muted">
            {lesson.teacher_name ? `${lesson.teacher_name} · ` : ""}{shortDate(lesson.starts_at)} · {formatDuration(seconds)}
          </p>
          {access.kind === "manager" && (
            <p className="mt-2 mb-0 text-sm"><Link href={`/t/${slug}/admin/aulas/${lesson.id}`} className="font-semibold text-brand-ink underline">Gerenciar esta aula</Link></p>
          )}
        </div>

        {state === "live" && joinUrl && (
          <a href={joinUrl} target="_blank" rel="noreferrer" className={primaryBtn}>
            <Icon name="external" />
            Abrir a sala em outra aba
          </a>
        )}

        {materials.length > 0 ? (
          <div className="flex flex-col gap-2">
            {materials.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-[14px] bg-surface px-3.5 py-3">
                <Icon name="file" size={24} className="text-ink-muted" />
                <a href={`/t/${slug}/materiais/${m.id}`} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 flex-col text-ink no-underline">
                  <span className="truncate text-[15px] font-semibold">{m.file_name}</span>
                  <span className="text-[13px] text-ink-subtle">PDF · toque para ler</span>
                </a>
                <a href={`/t/${slug}/materiais/${m.id}`} download={m.file_name} className="flex min-h-11 items-center px-2 text-sm font-semibold text-brand-ink no-underline hover:underline">Baixar</a>
              </div>
            ))}
          </div>
        ) : (
          <p className="m-0 text-sm text-ink-subtle">O professor ainda não anexou materiais a esta aula.</p>
        )}

        <section aria-labelledby="coment" className="flex flex-col gap-3.5">
          <SectionTitle id="coment">Comentários{comments.length ? ` · ${comments.length}` : ""}</SectionTitle>
          {comments.length === 0 && <p className="m-0 text-sm text-ink-muted">Ninguém comentou ainda. Tire uma dúvida ou compartilhe o que aprendeu.</p>}
          {comments.map((cm) => (
            <div key={cm.id} className={`flex gap-2.5 ${cm.is_teacher ? "pl-[46px]" : ""}`}>
              <Avatar name={cm.author} brand={cm.is_teacher} />
              <div className="min-w-0 flex-1">
                <p className="m-0 flex flex-wrap items-center gap-x-1.5">
                  <span className="text-sm font-semibold">{cm.author}</span>
                  {cm.is_teacher && <span className="inline-flex h-5 items-center rounded-[5px] bg-brand-soft px-1.5 text-[11px] font-bold text-brand-ink">PROFESSOR</span>}
                  <span className="text-[13px] text-ink-subtle">· {agoText(cm.created_at)}</span>
                </p>
                <p className="mt-0.5 mb-0 text-[15px] whitespace-pre-line break-words">{cm.body}</p>
                {(cm.user_id === session.user.id || canModerate) && (
                  <ActionForm
                    action={deleteCommentAction.bind(null, slug, lesson.id, cm.id)}
                    submitLabel="Apagar"
                    pendingLabel="Apagando..."
                    confirm="Apagar este comentário?"
                    submitClassName="min-h-9 text-[13px] font-semibold text-ink-subtle underline hover:text-danger"
                    className="flex"
                  />
                )}
              </div>
            </div>
          ))}
          <ActionForm
            action={addCommentAction.bind(null, slug, lesson.id)}
            submitLabel="Enviar"
            pendingLabel="..."
            resetOnSuccess
            inline
            submitClassName={btn("primary", "lg", "shrink-0 px-4")}
            className="mt-1 flex flex-col gap-1.5"
          >
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Escreva um comentário
              <input name="body" required maxLength={2000} placeholder="Sua dúvida ou observação" className={fieldLargeCls} />
            </label>
          </ActionForm>
        </section>
      </Screen>
    </>
  );
}
