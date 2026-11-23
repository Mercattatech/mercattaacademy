import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icon";
import { Empty, Group, RowLink, Screen, SectionTitle } from "@/components/student-ui";
import { Vitrine, VitrineHero } from "@/components/vitrine";
import { withContext } from "@/lib/db";
import { agoText, isToday, whenText } from "@/lib/format";
import { visibleAnnouncements } from "@/lib/services/communication";
import { studentHome } from "@/lib/services/home";
import { listShowcase } from "@/lib/services/showcase";
import { getSession } from "@/lib/session";
import { getLabels, getRoles, resolveTenant } from "@/lib/tenant";
import { SiteShell, StudentShell, TenantLogo } from "./_shell/shells";
import { loadStudent } from "./_shell/student-context";

/**
 * Início da instituição.
 * Visitante: vitrine pública com cursos e valores.
 * Aluno (ou equipe): tela Início do protótipo, com próxima aula, pendências e avisos.
 */
export default async function TenantHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await resolveTenant(slug);
  if (!tenant) notFound();

  const session = await getSession();
  const roles = session ? await getRoles(tenant.id, session.user.id) : [];

  if (!session || roles.length === 0) {
    const [labels, programs] = await Promise.all([getLabels(tenant.id), listShowcase(tenant.id)]);
    return (
      <SiteShell slug={slug} tenant={tenant} signedIn={!!session} programsLabel={labels.program.plural}>
        <VitrineHero tenantName={tenant.name} labels={labels} />
        <Vitrine slug={slug} labels={labels} programs={programs} />
      </SiteShell>
    );
  }

  const ctx = await loadStudent(slug, `/t/${slug}`);
  const { announcements, home } = await withContext({ tenantId: tenant.id, userId: ctx.userId }, async (c) => ({
    announcements: await visibleAnnouncements(c, ctx.userId, ctx.staff, 3),
    home: await studentHome(c, ctx.userId),
  }));
  const next = home.next;
  const live = next?.status === "live";
  const firstName = ctx.userName.split(" ")[0];

  return (
    <StudentShell slug={slug} ctx={ctx}>
      <Screen gap="gap-7">
        <div className="flex items-center justify-between md:hidden">
          <TenantLogo tenant={tenant} />
          <Link
            href={`/t/${slug}/notificacoes`}
            aria-label={ctx.unread ? `Notificações, ${ctx.unread} não lida${ctx.unread > 1 ? "s" : ""}` : "Notificações"}
            className="relative flex size-11 items-center justify-center rounded-full bg-surface text-ink no-underline"
          >
            <Icon name="bell" />
            {ctx.unread > 0 && (
              <span className="absolute top-1 right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">
                {ctx.unread > 9 ? "9+" : ctx.unread}
              </span>
            )}
          </Link>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="m-0 font-display text-[30px] font-[650] leading-[1.1] tracking-[-0.02em]">Olá, {firstName}</h1>
            {ctx.course && <p className="mt-1.5 text-sm text-ink-muted">{ctx.course.program} · {ctx.course.cohort}</p>}
          </div>
          {ctx.staff && (
            <Link href={`/t/${slug}/admin`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong px-4 text-sm font-semibold text-ink no-underline hover:bg-sunken md:hidden">
              <Icon name="dashboard" size={18} />
              Área administrativa
            </Link>
          )}
        </div>

        {next ? (
          <section aria-labelledby="proxima" className="flex flex-col gap-3.5 rounded-3xl bg-brand p-5 text-on-brand">
            <div className="flex items-center justify-between gap-2">
              <h2 id="proxima" className="m-0 font-sans text-[13px] font-semibold tracking-[.02em]">PRÓXIMA {ctx.labels.lesson.singular.toUpperCase()}</h2>
              {(live || isToday(next.starts_at)) && (
                <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-white/20 px-2.5 text-[13px] font-semibold">
                  <span className="size-2 rounded-full bg-white" />
                  {live ? "Ao vivo agora" : "Ao vivo hoje"}
                </span>
              )}
            </div>
            <div>
              <p className="m-0 font-display text-[34px] font-semibold leading-[1.05] tracking-[-0.02em]">{whenText(next.starts_at)}</p>
              <p className="mt-2 mb-0 text-[17px] font-semibold leading-[1.3]">{next.title}</p>
              <p className="mt-1 mb-0 text-sm">{next.module_name}{next.teacher_name ? ` · ${next.teacher_name}` : ""}</p>
            </div>
            <Link
              href={`/t/${slug}/aula/${next.id}`}
              className="flex h-14 items-center justify-center gap-2 rounded-[14px] bg-white text-[17px] font-bold text-brand-ink no-underline hover:bg-white/90"
            >
              <Icon name="video" size={24} />
              {live ? "Entrar na aula" : "Ver aula"}
            </Link>
            <span className="text-center text-[13px]">{live ? "A sala já está aberta." : "A sala abre quando o professor iniciar a aula."}</span>
          </section>
        ) : (
          <Empty icon="calendar" title={`Nenhuma ${ctx.labels.lesson.singular.toLowerCase()} agendada`}>
            Quando a coordenação agendar, a próxima aparece aqui com o botão para entrar.
          </Empty>
        )}

        {home.pending.length > 0 && (
          <section aria-labelledby="pendencias" className="flex flex-col gap-2.5">
            <SectionTitle id="pendencias">Pendências</SectionTitle>
            <Group>
              {home.pending.map((p, i) =>
                p.kind === "document" ? (
                  <RowLink key={i} href={`/t/${slug}/inscricoes`} icon="file" iconTone="danger" title={p.title} detail={p.detail} detailTone="danger" />
                ) : (
                  <RowLink
                    key={i}
                    href={`/t/${slug}/pagamentos`}
                    icon="payments"
                    iconTone={p.overdue ? "danger" : "warning"}
                    title={p.title}
                    detail={p.detail}
                    detailTone={p.overdue ? "danger" : "warning"}
                  />
                ),
              )}
            </Group>
          </section>
        )}

        <section aria-labelledby="avisos" className="flex flex-col gap-2.5">
          <SectionTitle id="avisos">Avisos</SectionTitle>
          {announcements.length === 0 ? (
            <p className="m-0 text-sm text-ink-muted">Nenhum aviso por enquanto.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {announcements.map((a) => (
                <li key={a.id} className="border-b border-line last:border-b-0">
                  <details className="group">
                    <summary className="flex cursor-pointer list-none gap-3 py-3 [&::-webkit-details-marker]:hidden">
                      <span aria-hidden="true" className="mt-2 size-2 shrink-0 rounded-full bg-brand" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="flex justify-between gap-2">
                          <span className="text-[15px] font-semibold">{a.title}</span>
                          <span className="whitespace-nowrap text-xs text-ink-subtle">{agoText(a.published_at)}</span>
                        </span>
                        <span className="text-sm text-ink-muted">{a.cohort_name ?? "Para todos"}{a.body ? " · toque para ler" : ""}</span>
                      </span>
                    </summary>
                    {a.body && <p className="mt-0 mb-3 ml-5 whitespace-pre-line text-[15px]">{a.body}</p>}
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>
      </Screen>
    </StudentShell>
  );
}
