import Link from "next/link";
import { Icon } from "@/components/icon";
import { Avatar, Group, Screen } from "@/components/student-ui";
import { loadStudent } from "../../_shell/student-context";
import { SignOut } from "../../_shell/student-nav";

/** Perfil e atalhos que não cabem nas abas (tela 10 do protótipo). */
export default async function MorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await loadStudent(slug, `/t/${slug}`);

  const row = (href: string, icon: Parameters<typeof Icon>[0]["name"], label: string, badge?: string, badgeTone?: "warning" | "muted") => (
    <Link key={href} href={href} className="flex min-h-14 w-full items-center gap-3.5 border-t border-line px-4 text-base text-ink no-underline first:border-t-0 hover:bg-canvas">
      <Icon name={icon} className="text-ink-muted" />
      <span className="flex-1">{label}</span>
      {badge && <span className={`text-[13px] font-semibold ${badgeTone === "warning" ? "text-warning" : "text-ink-muted"}`}>{badge}</span>}
      <Icon name="chevronRight" className="text-ink-subtle" />
    </Link>
  );

  return (
    <Screen>
      <div className="flex items-center gap-3.5">
        <Avatar name={ctx.userName} size={56} brand />
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold">{ctx.userName}</div>
          <div className="text-sm text-ink-muted">{ctx.course ? `${ctx.course.program} · ${ctx.course.cohort}` : ctx.tenant.name}</div>
        </div>
      </div>

      <Group>{ctx.nav.more.map((it) => row(`/t/${slug}${it.href}`, it.icon, it.label, it.badge, it.badgeTone))}</Group>

      <Group>
        {ctx.staff && row(`/t/${slug}/admin`, "dashboard", "Área administrativa")}
        {row(`/t/${slug}/privacidade`, "shield", "Privacidade")}
      </Group>

      <SignOut />
    </Screen>
  );
}
