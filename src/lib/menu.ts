import type { IconName } from "@/components/icon";
import type { Labels } from "./tenant";

/**
 * Navegação da área do aluno, montada a partir dos recursos ligados.
 * Item sem `feature` é do núcleo e sempre aparece; com `feature`, só se o
 * recurso estiver ligado para a instituição. Rótulos vêm de tenant_labels.
 *
 * `primary`: as abas da barra inferior (celular) e o topo da barra lateral (computador).
 * `more`: o que fica dentro de "Mais" no celular e abaixo das abas no computador.
 * `match`: prefixos de caminho que acendem a aba.
 */
export type NavLink = { key: string; label: string; href: string; icon: IconName; match?: string[]; badge?: string; badgeTone?: "warning" | "muted" };

export type StudentNav = { primary: NavLink[]; more: NavLink[] };

export function studentNav(
  labels: Labels,
  enabled: Set<string>,
  opts: { staff: boolean; unread: number; openPayments: number },
): StudentNav {
  const on = (feature?: string) => !feature || enabled.has(feature);
  const grades = enabled.has("avaliacoes") || enabled.has("notas_faltas");

  const primary: NavLink[] = [
    { key: "inicio", label: "Início", href: "", icon: "home" },
    { key: "aulas", label: labels.lesson.plural, href: "/aulas", icon: "playCircle", match: ["/aulas", "/aula/"] },
    ...(grades ? [{ key: "notas", label: "Notas", href: "/notas", icon: "grading" as const }] : []),
    { key: "certificados", label: "Certificados", href: "/certificados", icon: "award" },
    {
      key: "mais",
      label: "Mais",
      href: "/mais",
      icon: "menu",
      match: ["/mais", "/videos", "/pagamentos", "/inscricoes", "/notificacoes", "/atendimento", "/meus-dados", "/professores"],
    },
  ];

  const more: NavLink[] = [
    ...(on("aulas_gravadas") ? [{ key: "videos", label: "Vídeos gravados", href: "/videos", icon: "video" as const }] : []),
    ...(on("pagamento")
      ? [{ key: "pagamentos", label: "Pagamentos", href: "/pagamentos", icon: "payments" as const, badge: opts.openPayments ? `${opts.openPayments} a pagar` : undefined, badgeTone: "warning" as const }]
      : []),
    ...(on("secretaria") ? [{ key: "inscricoes", label: "Matrícula e documentos", href: "/inscricoes", icon: "assignment" as const }] : []),
    {
      key: "notificacoes",
      label: "Notificações",
      href: "/notificacoes",
      icon: "bell",
      badge: opts.unread ? `${opts.unread} nova${opts.unread > 1 ? "s" : ""}` : undefined,
      badgeTone: "muted",
    },
    { key: "atendimento", label: "Atendimento", href: "/atendimento", icon: "support" },
    ...(on("professores") ? [{ key: "professores", label: "Professores", href: "/professores", icon: "teachers" as const }] : []),
    { key: "meus-dados", label: "Meus dados", href: "/meus-dados", icon: "person" },
  ];

  return { primary, more };
}
