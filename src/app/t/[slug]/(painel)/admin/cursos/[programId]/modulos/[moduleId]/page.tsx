import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { btnText, EmptyBox, PageHead, panelCls, Tag } from "@/components/admin-ui";
import { Icon } from "@/components/icon";
import { Notice, TextareaField, Field } from "@/components/ui";
import { withContext } from "@/lib/db";
import { can, requireStaff, STAFF_ROLES } from "@/lib/guards";
import { formatDateTime } from "@/lib/format";
import { moduleReport, videosOfModule } from "@/lib/services/videos";
import { getEnabledFeatures, getLabels } from "@/lib/tenant";
import { deleteVideoAction, moveVideoAction, updateVideoAction } from "./actions";
import { UploadVideo } from "./upload-video";

const sizeText = (bytes: string) => {
  const n = Number(bytes);
  return n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2).replace(".", ",")} GB` : `${Math.max(1, Math.round(n / 1024 ** 2))} MB`;
};

/** Vídeos gravados de um módulo do curso (recurso "aulas gravadas"). */
export default async function ModuleVideosPage({ params }: { params: Promise<{ slug: string; programId: string; moduleId: string }> }) {
  const { slug, programId, moduleId } = await params;
  const ctx = await requireStaff(slug, STAFF_ROLES, `/t/${slug}/admin/cursos/${programId}/modulos/${moduleId}`);
  const [labels, enabled] = await Promise.all([getLabels(ctx.tenant.id), getEnabledFeatures(ctx.tenant.id)]);
  const editable = can(ctx, "coordenacao");

  const data = await withContext({ tenantId: ctx.tenant.id, userId: ctx.userId }, async (c) => {
    const m = (
      await c.query<{ name: string; program_name: string }>(
        `select m.name, p.name as program_name from program_modules m join programs p on p.tenant_id = m.tenant_id and p.id = m.program_id
          where m.id = $1 and m.program_id = $2`,
        [moduleId, programId],
      )
    ).rows[0];
    if (!m) return null;
    const videos = await videosOfModule(c, moduleId);
    return { module: m, videos, report: await moduleReport(c, moduleId, videos.filter((v) => v.status === "ready").map((v) => v.id)) };
  });
  if (!data) notFound();
  const { module: mod, videos, report } = data;
  const ready = videos.filter((v) => v.status === "ready");

  return (
    <div className="flex flex-col gap-8">
      <PageHead
        crumbs={[
          { href: `/t/${slug}/admin/cursos`, label: labels.program.plural },
          { href: `/t/${slug}/admin/cursos/${programId}`, label: data.module.program_name },
        ]}
        title={`Vídeos: ${mod.name}`}
        tag={<Tag tone="muted">{ready.length} {ready.length === 1 ? "vídeo" : "vídeos"}</Tag>}
        sub={`Aulas gravadas deste ${labels.module.singular.toLowerCase()}. Os alunos de todas as ${labels.cohort.plural.toLowerCase()} com acesso liberado assistem na área deles.`}
      />

      {!enabled.has("aulas_gravadas") && (
        <Notice tone="warn" title="Recurso não ligado.">
          As aulas gravadas ainda não estão ativas para esta instituição. Peça à plataforma para ligar o recurso &quot;Aulas gravadas em blocos&quot;.
        </Notice>
      )}

      <section aria-labelledby="lista" className={`${panelCls} flex flex-col gap-3 p-5`}>
        <h2 id="lista" className="m-0 font-sans text-lg font-semibold">Vídeos do {labels.module.singular.toLowerCase()}</h2>
        {ready.length === 0 ? (
          <EmptyBox icon="video" title="Nenhum vídeo ainda">
            {editable && enabled.has("aulas_gravadas") ? "Envie o primeiro vídeo no formulário abaixo." : "A coordenação envia os vídeos deste módulo."}
          </EmptyBox>
        ) : (
          <ol className="m-0 flex list-none flex-col p-0">
            {ready.map((v, i) => (
              <li key={v.id} className={`py-3 ${i ? "border-t border-line" : ""}`}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sunken text-sm font-semibold text-ink-muted">{i + 1}</span>
                  <span className="flex min-w-[200px] flex-1 flex-col">
                    <span className="text-[15px] font-semibold">{v.title}</span>
                    <span className="text-[13px] text-ink-subtle">{sizeText(v.size_bytes)} · enviado em {formatDateTime(v.created_at)} · assistido por {report.perVideo[v.id]?.done ?? 0} de {report.total} {report.total === 1 ? "aluno" : "alunos"}</span>
                  </span>
                  <a href={`/t/${slug}/videos/${v.id}`} target="_blank" rel="noreferrer" className={btnText}>
                    <Icon name="play" size={16} />
                    Assistir
                  </a>
                  {editable && (
                    <span className="flex gap-1">
                      <form action={moveVideoAction.bind(null, slug, programId, moduleId, v.id, "up")}>
                        <button type="submit" disabled={i === 0} aria-label={`Mover ${v.title} para cima`} className="flex size-10 items-center justify-center rounded-[9px] border border-line-strong bg-surface text-ink-muted hover:bg-sunken disabled:opacity-30">
                          <Icon name="arrowUp" size={18} />
                        </button>
                      </form>
                      <form action={moveVideoAction.bind(null, slug, programId, moduleId, v.id, "down")}>
                        <button type="submit" disabled={i === ready.length - 1} aria-label={`Mover ${v.title} para baixo`} className="flex size-10 items-center justify-center rounded-[9px] border border-line-strong bg-surface text-ink-muted hover:bg-sunken disabled:opacity-30">
                          <Icon name="arrowDown" size={18} />
                        </button>
                      </form>
                    </span>
                  )}
                </div>
                {editable && (
                  <details className="group mt-1 pl-12">
                    <summary className={`${btnText} -ml-2.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>Editar</summary>
                    <div className="mt-2 flex max-w-xl flex-col gap-3 rounded-xl bg-canvas p-4">
                      <ActionForm action={updateVideoAction.bind(null, slug, programId, moduleId, v.id)} submitLabel="Salvar" className="flex flex-col gap-3">
                        <Field label="Título" name="title" defaultValue={v.title} required maxLength={160} id={`vt-${v.id}`} />
                        <TextareaField label="Descrição" name="description" rows={2} defaultValue={v.description} maxLength={2000} id={`vd-${v.id}`} />
                      </ActionForm>
                      <form action={deleteVideoAction.bind(null, slug, programId, moduleId, v.id)}>
                        <button type="submit" className="min-h-11 text-sm font-semibold text-danger hover:underline">Excluir este vídeo (apaga o arquivo)</button>
                      </form>
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {ready.length > 0 && (
        <section aria-labelledby="alunos" className={`${panelCls} flex flex-col gap-3 p-5`}>
          <h2 id="alunos" className="m-0 font-sans text-lg font-semibold">Quem assistiu</h2>
          <p className="m-0 text-sm text-ink-muted">Alunos com acesso liberado. Conta como assistido ao chegar a 90% do vídeo ou ao fim.</p>
          {report.students.length === 0 ? (
            <p className="m-0 text-[15px] text-ink-muted">Nenhum aluno com acesso liberado nas turmas deste curso.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr className="text-left text-[13px] text-ink-subtle">
                    <th className="py-2 pr-3 font-semibold">Aluno</th>
                    <th className="px-3 py-2 font-semibold">{labels.cohort.singular}</th>
                    <th className="px-3 py-2 font-semibold">Assistidos</th>
                    {ready.map((v, i) => (
                      <th key={v.id} className="px-2 py-2 text-center font-semibold" title={v.title}>{i + 1}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.students.map((st) => (
                    <tr key={st.user_id} className="border-t border-line">
                      <td className="py-2.5 pr-3 font-semibold">{st.name}</td>
                      <td className="px-3 py-2.5 text-ink-muted">{st.cohort}</td>
                      <td className="px-3 py-2.5">{st.watched} de {ready.length}</td>
                      {ready.map((v) => {
                        const state = st.perVideo[v.id];
                        return (
                          <td key={v.id} className="px-2 py-2.5 text-center">
                            {state === "done" ? (
                              <Icon name="checkCircle" size={20} className="inline text-success" aria-label="Assistiu" />
                            ) : state === "partial" ? (
                              <span className="text-xs font-semibold text-warning" title="Começou a assistir">…</span>
                            ) : (
                              <span className="text-ink-subtle" aria-label="Não assistiu">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {editable && enabled.has("aulas_gravadas") && (
        <section aria-labelledby="enviar" className={`${panelCls} flex flex-col gap-3 p-5`}>
          <h2 id="enviar" className="m-0 font-sans text-lg font-semibold">Enviar vídeo</h2>
          <UploadVideo slug={slug} programId={programId} moduleId={moduleId} />
        </section>
      )}
    </div>
  );
}
