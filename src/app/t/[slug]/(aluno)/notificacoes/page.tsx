import Link from "next/link";
import type { IconName } from "@/components/icon";
import { BackHeader, Empty, IconBox, Screen } from "@/components/student-ui";
import { withContext } from "@/lib/db";
import { agoText } from "@/lib/format";
import { requireMember } from "@/lib/guards";
import { listNotifications } from "@/lib/services/communication";
import { markReadAction } from "./actions";

const ICONS: Record<string, IconName> = {
  announcement: "campaign",
  document: "file",
  document_rejected: "file",
  document_approved: "checkCircle",
  documents_complete: "checkCircle",
  access_released: "checkCircle",
  enrolled: "assignment",
  payment: "payments",
  grade_posted: "grading",
  grade: "grading",
  lesson: "video",
  lesson_reminder: "video",
  certificate_issued: "award",
  recording_ready: "playCircle",
  lesson_comment: "chat",
  support: "support",
  invited: "person",
};

/** Notificações (tela 12 do protótipo). */
export default async function NotificationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await requireMember(slug, `/t/${slug}/notificacoes`);
  const list = await withContext({ tenantId: m.tenant.id, userId: m.userId }, (c) => listNotifications(c, m.userId));
  const unread = list.filter((n) => !n.read_at).length;

  return (
    <>
      <BackHeader
        href={`/t/${slug}`}
        title="Notificações"
        action={
          unread > 0 ? (
            <form action={markReadAction.bind(null, slug, null)}>
              <button type="submit" className="min-h-11 px-3 text-sm font-semibold text-brand-ink hover:underline">Marcar como lidas</button>
            </form>
          ) : undefined
        }
      />
      <Screen gap="gap-0" className="pt-1">
        {list.length === 0 ? (
          <Empty icon="bell" title="Nada por aqui ainda">Avisos, notas, respostas do atendimento e confirmações de pagamento aparecem nesta lista.</Empty>
        ) : (
          list.map((n) => {
            const content = (
              <>
                <IconBox name={ICONS[n.kind] ?? "bell"} tone="surface" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex justify-between gap-2">
                    <span className={`text-[15px] text-ink ${n.read_at ? "font-medium" : "font-semibold"}`}>{n.message}</span>
                    <span className="whitespace-nowrap text-xs text-ink-subtle">{agoText(n.created_at)}</span>
                  </span>
                  {!n.read_at && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-ink">
                      <span className="size-2 rounded-full bg-brand" />
                      Não lida
                    </span>
                  )}
                </span>
              </>
            );
            const cls = "flex gap-3 border-b border-line py-3.5 last:border-b-0";
            return n.href ? (
              <Link key={n.id} href={`/t/${slug}${n.href === "/" ? "" : n.href}`} className={`${cls} no-underline hover:bg-white/40`}>{content}</Link>
            ) : (
              <div key={n.id} className={cls}>{content}</div>
            );
          })
        )}
      </Screen>
    </>
  );
}
