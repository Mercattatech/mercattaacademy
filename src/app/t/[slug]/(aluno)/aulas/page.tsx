import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Icon } from "@/components/icon";
import { Chip, Empty, Group, IconBox, Screen, ScreenTitle, SectionTitle, secondaryBtn } from "@/components/student-ui";
import { withContext } from "@/lib/db";
import { formatDuration, shortDate, weekdayDate } from "@/lib/format";
import { agendaForUser, ensureCalendarToken, lessonState, type AgendaItem } from "@/lib/services/lessons";
import { getSession } from "@/lib/session";
import { getLabels, resolveTenant } from "@/lib/tenant";
import { tenantUrl } from "@/lib/urls";
import { rotateCalendarAction } from "./actions";

const TZ = "America/Sao_Paulo";
const dayKey = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(d);
const time = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);

function dayTitle(d: Date): string {
  const label = weekdayDate(d).toUpperCase();
  const diff = Math.round((Date.parse(dayKey(d)) - Date.parse(dayKey(new Date()))) / 86_400_000);
  return diff === 0 ? `HOJE · ${label}` : diff === 1 ? `AMANHÃ · ${label}` : label;
}

/** Cartão de uma aula na agenda. */
function LessonCard({ slug, l }: { slug: string; l: AgendaItem }) {
  const state = lessonState(l);
  return (
    <Link
      href={`/t/${slug}/aula/${l.id}`}
      className={`flex items-center gap-3.5 rounded-2xl px-4 py-3.5 no-underline ${state === "live" ? "bg-surface ring-2 ring-brand" : "bg-surface hover:bg-white/60"}`}
    >
      <span className="w-12 shrink-0 text-center font-display text-xl font-semibold text-ink">{time(l.starts_at)}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[15px] font-semibold text-ink">{l.title}</span>
        <span className="text-[13px] text-ink-muted">{l.module_name}{l.teacher_name ? ` · ${l.teacher_name}` : ""} · {formatDuration(l.duration_minutes * 60)}</span>
        {state === "live" ? (
          <Chip tone="brand" icon="video" small>Ao vivo agora</Chip>
        ) : (
          <Chip tone="muted" icon="video" small>Online</Chip>
        )}
      </span>
      <Icon name="chevronRight" className="text-ink-subtle" />
    </Link>
  );
}

export default async function StudentAgendaPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ modulo?: string; aba?: string }> }) {
  const { slug } = await params;
  const { modulo, aba } = await searchParams;
  const tab = aba === "gravacoes" ? "gravacoes" : "agenda";
  const tenant = await resolveTenant(slug);
  if (!tenant) notFound();
  const session = await getSession();
  if (!session) redirect(`/login?voltar=${encodeURIComponent(`/t/${slug}/aulas`)}`);
  const labels = await getLabels(tenant.id);
  const moduleId = modulo && /^[0-9a-f-]{36}$/i.test(modulo) ? modulo : null;

  const { all, token } = await withContext({ tenantId: tenant.id, userId: session.user.id }, async (c) => ({
    all: await agendaForUser(c, session.user.id),
    token: await ensureCalendarToken(c, tenant.id, session.user.id),
  }));
  const items = moduleId ? all.filter((l) => l.cohort_module_id === moduleId) : all;
  const modules = [...new Map(all.map((l) => [l.cohort_module_id, l.module_name])).entries()];
  const calUrl = tenantUrl(slug, `/agenda/${token}`);
  const now = Date.now();
  const upcoming = items.filter((l) => l.starts_at.getTime() + l.duration_minutes * 60_000 >= now && l.status !== "canceled");
  const pastNoVideo = items.filter((l) => !upcoming.includes(l) && lessonState(l) !== "recorded").reverse();

  const byDay = new Map<string, AgendaItem[]>();
  for (const l of upcoming) byDay.set(dayKey(l.starts_at), [...(byDay.get(dayKey(l.starts_at)) ?? []), l]);
  const groups = [...byDay.values()];
  const recorded = items.filter((l) => lessonState(l) === "recorded").sort((x, y) => y.starts_at.getTime() - x.starts_at.getTime());

  const query = (extra: Record<string, string>) => {
    const q = new URLSearchParams({ ...(moduleId ? { modulo: moduleId } : {}), ...extra });
    return `/t/${slug}/aulas${q.size ? `?${q}` : ""}`;
  };
  const tabCls = (active: boolean) =>
    `flex h-10 items-center justify-center rounded-[9px] text-[15px] font-semibold text-ink no-underline ${active ? "bg-surface shadow-[0_1px_2px_rgb(22_23_26/.08)]" : "hover:bg-white/50"}`;
  const lessonWord = labels.lesson.plural.toLowerCase();

  return (
    <Screen gap="gap-5">
      <ScreenTitle>{labels.lesson.plural}</ScreenTitle>

      {all.length === 0 ? (
        <Empty icon="calendar" title={`Nenhuma ${labels.lesson.singular.toLowerCase()} agendada`}>
          As {lessonWord} aparecem aqui quando a coordenação agendar e seu acesso estiver liberado.
        </Empty>
      ) : (
        <>
          <div role="tablist" aria-label="Seção" className="grid grid-cols-2 rounded-xl bg-sunken p-1">
            <Link role="tab" aria-selected={tab === "agenda"} href={query({})} className={tabCls(tab === "agenda")}>Agenda</Link>
            <Link role="tab" aria-selected={tab === "gravacoes"} href={query({ aba: "gravacoes" })} className={tabCls(tab === "gravacoes")}>Gravações</Link>
          </div>

          {modules.length > 1 && (
            <nav aria-label={`Filtrar por ${labels.module.singular.toLowerCase()}`} className="-mx-5 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0 [&::-webkit-scrollbar]:hidden">
              {[["", "Todos"], ...modules].map(([id, name]) => {
                const active = (moduleId ?? "") === id;
                const q = new URLSearchParams({ ...(id ? { modulo: id } : {}), ...(tab === "gravacoes" ? { aba: "gravacoes" } : {}) });
                return (
                  <Link
                    key={id || "all"}
                    href={`/t/${slug}/aulas${q.size ? `?${q}` : ""}`}
                    aria-current={active ? "page" : undefined}
                    className={`inline-flex min-h-9 shrink-0 items-center rounded-full px-3.5 text-sm font-semibold whitespace-nowrap no-underline ${active ? "bg-brand-soft text-brand-ink" : "bg-sunken text-ink-muted hover:text-ink"}`}
                  >
                    {name}
                  </Link>
                );
              })}
            </nav>
          )}

          {tab === "agenda" ? (
            <div className="flex flex-col gap-5">
              {groups.length === 0 && <p className="m-0 text-ink-muted">Nenhuma {labels.lesson.singular.toLowerCase()} pela frente.</p>}
              {groups.map((g) => (
                <section key={dayKey(g[0].starts_at)} aria-label={dayTitle(g[0].starts_at)} className="flex flex-col gap-2">
                  <h2 className="m-0 font-sans text-[13px] font-semibold tracking-normal text-ink-subtle">{dayTitle(g[0].starts_at)}</h2>
                  {g.map((l) => <LessonCard key={l.id} slug={slug} l={l} />)}
                </section>
              ))}
              {pastNoVideo.length > 0 && (
                <section aria-labelledby="ant" className="flex flex-col gap-2">
                  <h2 id="ant" className="m-0 font-sans text-[13px] font-semibold tracking-normal text-ink-subtle">ANTERIORES</h2>
                  <Group>
                    {pastNoVideo.map((l) => {
                      const st = lessonState(l);
                      return (
                        <Link key={l.id} href={`/t/${slug}/aula/${l.id}`} className="flex items-center gap-3 border-t border-line px-4 py-3.5 no-underline first:border-t-0 hover:bg-canvas">
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="text-[15px] font-semibold text-ink">{l.title}</span>
                            <span className="text-[13px] text-ink-muted">{l.module_name} · {shortDate(l.starts_at)}</span>
                          </span>
                          {st === "canceled" ? <Chip tone="danger" small>Cancelada</Chip> : <Chip tone="muted" icon="clock" small>Gravação em breve</Chip>}
                        </Link>
                      );
                    })}
                  </Group>
                </section>
              )}
            </div>
          ) : recorded.length === 0 ? (
            <Empty icon="playCircle" title="Ainda não há gravações">
              Cada {labels.lesson.singular.toLowerCase()} ao vivo aparece aqui assim que o vídeo fica pronto.
            </Empty>
          ) : (
            <Group>
              {recorded.map((l) => (
                <Link key={l.id} href={`/t/${slug}/aula/${l.id}`} className="flex items-center gap-3 border-t border-line px-4 py-3.5 no-underline first:border-t-0 hover:bg-canvas">
                  <IconBox name="play" tone="brand" size={44} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[15px] font-semibold text-ink">{l.title}</span>
                    <span className="text-[13px] text-ink-muted">{l.module_name} · {shortDate(l.starts_at)} · {formatDuration(l.duration_minutes * 60)}</span>
                  </span>
                  <Icon name="chevronRight" className="text-ink-subtle" />
                </Link>
              ))}
            </Group>
          )}
        </>
      )}

      <details className="group rounded-[18px] bg-surface">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 [&::-webkit-details-marker]:hidden">
          <Icon name="calendar" className="text-ink-muted" />
          <span className="flex-1 text-[15px] font-semibold">Levar para o seu calendário</span>
          <Icon name="chevronRight" className="text-ink-subtle transition-transform group-open:rotate-90" />
        </summary>
        <div className="flex flex-col gap-3 px-4 pb-4">
          <p className="m-0 text-sm text-ink-muted">No Google Agenda: Outras agendas, Por URL, e cole o endereço abaixo. Ele atualiza sozinho. Não compartilhe, ele é só seu.</p>
          <code className="block rounded-lg bg-sunken p-2.5 text-xs break-all">{calUrl}</code>
          <a href={calUrl} download="aulas.ics" className={secondaryBtn}>
            <Icon name="download" />
            Baixar arquivo .ics
          </a>
          <SectionTitle>Endereço vazou?</SectionTitle>
          <ActionForm
            action={rotateCalendarAction.bind(null, slug)}
            submitLabel="Gerar novo endereço"
            variant="quiet"
            confirm="O endereço atual deixa de funcionar. Continuar?"
            className="flex flex-col gap-2"
          />
        </div>
      </details>
    </Screen>
  );
}
