import { ActionForm } from "@/components/action-form";
import { btnPrimary, inputCls, labelCls, PageHead, panelCls, textareaCls } from "@/components/admin-ui";
import { withContext } from "@/lib/db";
import { shortDate } from "@/lib/format";
import { requireStaff } from "@/lib/guards";
import { visibleAnnouncements } from "@/lib/services/communication";
import { createAnnouncementAction, deleteAnnouncementAction } from "../actions";
import { cx } from "@/components/ui";

/** Avisos (protótipo): "Novo aviso" à esquerda, publicados à direita. */
export default async function AnnouncementsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await requireStaff(slug, ["coordenacao", "secretaria"], `/t/${slug}/admin/avisos`);
  const { items, cohorts } = await withContext({ tenantId: ctx.tenant.id, userId: ctx.userId }, async (c) => ({
    items: await visibleAnnouncements(c, ctx.userId, true),
    cohorts: (await c.query<{ id: string; name: string }>("select id, name from cohorts where status <> 'closed' order by created_at desc")).rows,
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHead title="Avisos" sub="Aparecem no início da área do aluno e chegam por notificação." />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] items-start gap-6">
        <section aria-labelledby="novo" className={`${panelCls} flex flex-col gap-4 p-5`}>
          <h2 id="novo" className="m-0 font-sans text-lg font-semibold">Novo aviso</h2>
          <ActionForm
            action={createAnnouncementAction.bind(null, slug)}
            submitLabel="Publicar aviso"
            pendingLabel="Publicando..."
            resetOnSuccess
            submitClassName={cx(btnPrimary, "self-start")}
            className="flex flex-col gap-4"
          >
            <label className={labelCls}>
              Para quem
              <select name="cohortId" className={inputCls}>
                <option value="">Todos os alunos</option>
                {cohorts.map((co) => (
                  <option key={co.id} value={co.id}>{co.name}</option>
                ))}
              </select>
            </label>
            <label className={labelCls}>
              Título
              <input name="title" required maxLength={160} placeholder="Ex.: Aula de sábado será presencial" className={inputCls} />
            </label>
            <label className={labelCls}>
              Mensagem
              <textarea name="body" rows={5} maxLength={4000} placeholder="Escreva de forma curta e direta." className={textareaCls} />
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" name="email" className="size-5 accent-[var(--color-brand)]" />
              Enviar também por e-mail
            </label>
          </ActionForm>
        </section>

        <section aria-labelledby="publicados" className="flex flex-col">
          <h2 id="publicados" className="mt-0 mb-1.5 font-sans text-lg font-semibold">Publicados</h2>
          {items.length === 0 ? (
            <p className="m-0 border-t border-line py-3.5 text-[15px] text-ink-muted">Nenhum aviso publicado.</p>
          ) : (
            items.map((a) => (
              <article key={a.id} className="flex flex-col gap-1 border-t border-line py-3.5">
                <h3 className="m-0 font-sans text-[15px] font-semibold">{a.title}</h3>
                <p className="m-0 text-[13px] text-ink-muted">
                  {shortDate(a.published_at)} · {a.cohort_name ? a.cohort_name : "Todos os alunos"}
                </p>
                {a.body && <p className="m-0 line-clamp-3 text-sm whitespace-pre-line text-ink-muted">{a.body}</p>}
                <form action={deleteAnnouncementAction.bind(null, slug, a.id)}>
                  <button type="submit" className="-ml-2.5 inline-flex h-10 items-center rounded-[9px] px-2.5 text-sm font-semibold text-danger hover:bg-danger-soft">
                    Apagar
                  </button>
                </form>
              </article>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
