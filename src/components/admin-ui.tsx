import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";
import { btn, EmptyState, fieldCls, MetricCard, StatusTag as DsStatusTag, textareaFieldCls, type ToneAlias } from "./ui";

/**
 * Peças do painel da instituição (protótipo, aba "Painel da instituição").
 * Títulos em Bricolage 30px, tabelas em caixa branca com borda, etiquetas de 26px com ícone.
 */

/* Botões e campos vêm do sistema de design (components/ui.tsx); aqui só ficam os nomes usados no painel. */
export const btnPrimary = btn("primary", "md", "gap-1.5");
export const btnOutline = btn("secondary", "md", "gap-1.5");
export const btnText = btn("text", "md", "gap-1.5 px-3");
/** Gatilho de recusa ao lado de "Aprovar": contorno vermelho; a confirmação dentro do modal usa btn("danger"). */
export const btnDanger = btn("dangerOutline", "md", "gap-1.5");
export const inputCls = fieldCls;
export const textareaCls = textareaFieldCls;
export const labelCls = "flex flex-col gap-1.5 text-sm font-semibold";
export const panelCls = "rounded-2xl border border-line bg-surface";
export const tableWrap = "overflow-x-auto rounded-2xl border border-line bg-surface";
export const tableCls = "w-full min-w-[640px] border-collapse text-sm";
export const thCls = "px-2 py-3 text-left text-[13px] font-semibold text-ink-subtle first:pl-4 last:pr-4";
export const tdCls = "px-2 py-3 align-middle first:pl-4 last:pr-4";
export const trCls = "border-t border-line";

/** Cabeçalho de tela: título, linha de apoio, ação à direita e caminho (opcional). */
export function PageHead({
  title,
  sub,
  action,
  crumbs,
  tag,
}: {
  title: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
  crumbs?: { href: string; label: string }[];
  tag?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Caminho" className="flex flex-wrap items-center gap-1 text-sm">
          {crumbs.map((c) => (
            <span key={c.href} className="flex items-center gap-1">
              <Link href={c.href} className="font-semibold text-brand-ink no-underline hover:underline">{c.label}</Link>
              <Icon name="chevronRight" size={16} className="text-ink-subtle" />
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="m-0 font-display text-[30px] leading-[1.15] font-[650] tracking-[-0.02em]">{title}</h1>
            {tag}
          </div>
          {sub && <p className="mt-1 mb-0 max-w-[70ch] text-[15px] text-ink-muted">{sub}</p>}
        </div>
        {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
      </div>
    </div>
  );
}

export type Tone = "ok" | "warn" | "bad" | "brand" | "muted";
const TONE_ICON: Record<Tone, IconName> = { ok: "checkCircle", warn: "clock", bad: "error", brand: "currentStep", muted: "emptyStep" };

/** Etiqueta de situação do painel: a StatusTag do sistema, com os ícones padrão do painel. */
export function Tag({ tone, icon, small, children }: { tone: Tone; icon?: IconName | null; small?: boolean; children: ReactNode }) {
  return (
    <DsStatusTag tone={tone} icon={icon === null ? null : (icon ?? TONE_ICON[tone])} small={small}>
      {children}
    </DsStatusTag>
  );
}

/** Título de seção em caixa alta e cinza ("PRECISA DE AÇÃO HOJE"). */
export function Eyebrow({ children, id }: { children: ReactNode; id?: string }) {
  return <h2 id={id} className="m-0 font-sans text-[13px] font-semibold tracking-[.03em] text-ink-subtle uppercase">{children}</h2>;
}

export function SectionHead({ title, id, aside }: { title: ReactNode; id?: string; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <h2 id={id} className="m-0 font-sans text-lg font-semibold tracking-normal">{title}</h2>
      {aside}
    </div>
  );
}

/** Número grande com rótulo (cartões de Pagamentos): o cartão de métrica do sistema. */
export function Kpi({ label, value, foot, tone }: { label: string; value: ReactNode; foot?: ReactNode; tone?: "warn" | "bad" }) {
  return <MetricCard label={label} value={value} note={foot} tone={tone === "bad" ? "danger" : tone} icon={tone === "warn" ? "clock" : tone === "bad" ? "error" : undefined} />;
}

/** Barra de matrículas por turma. Sem número de vagas cadastrado, a escala é a maior turma da lista. */
export function Bar({ label, note, value, scale, unit = "alunos", muted }: { label: string; note?: string; value: number; scale: number; unit?: string; muted?: boolean }) {
  const pct = scale > 0 ? Math.min(100, Math.round((value / scale) * 1000) / 10) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between gap-3 text-sm">
        <span className="font-semibold">
          {label}
          {note && <span className="font-medium text-ink-subtle"> · {note}</span>}
        </span>
        <span className="whitespace-nowrap">
          <strong>{value}</strong>
          <span className="text-ink-subtle"> {unit}</span>
        </span>
      </div>
      <div className="h-3 rounded-md bg-sunken" role="presentation">
        <span className={`block h-full rounded-md ${muted ? "bg-ink-subtle" : "bg-brand"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Filtro em pílula com contagem (Etapa: Todas 8, Documentos 3...). */
export function Pill({ href, active, label, count }: { href: string; active: boolean; label: string; count?: number }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold whitespace-nowrap no-underline ${
        active ? "border-brand bg-brand-soft text-brand-ink hover:text-brand-ink" : "border-line-strong bg-surface text-ink hover:bg-sunken hover:text-ink"
      }`}
    >
      {label}
      {count != null && <span className={`font-medium ${active ? "text-brand-ink" : "text-ink-subtle"}`}>{count}</span>}
    </Link>
  );
}

/** Estado vazio com borda tracejada: o EmptyState do sistema (ícone cinza por padrão no painel). */
export function EmptyBox({ icon = "checkCircle", title, children, action, success }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode; success?: boolean }) {
  return (
    <EmptyState icon={icon} title={title} action={action} success={success}>
      {children}
    </EmptyState>
  );
}

/** Lista lateral com seleção (fila de documentos, chamados). */
export function QueueItem({ href, current, children }: { href: string; current: boolean; children: ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        scroll={false}
        aria-current={current ? "true" : undefined}
        className={`flex w-full flex-col items-start gap-0.5 rounded-[10px] px-3 py-2.5 text-left no-underline ${
          current ? "bg-brand-soft ring-[1.5px] ring-brand ring-inset" : "hover:bg-sunken"
        }`}
      >
        {children}
      </Link>
    </li>
  );
}

export function Initials({ name, size = 36 }: { name: string; size?: number }) {
  const ini = name.split(" ").filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase()).join("");
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, flexBasis: size }}
      className="flex shrink-0 items-center justify-center rounded-full bg-sunken text-[13px] font-bold text-ink-muted"
    >
      {ini}
    </span>
  );
}

/** Compatível com o StatusTag antigo (ok, warn, muted, danger). */
export function StatusTag({ tone, children }: { tone: ToneAlias; children: ReactNode }) {
  return <DsStatusTag tone={tone}>{children}</DsStatusTag>;
}
