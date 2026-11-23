import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";
import { btn, EmptyState, fieldLargeCls, StatusTag } from "./ui";

/**
 * Peças da área do aluno, medidas do protótipo (design/Plataforma Pós.dc.html, aba Área do aluno).
 * Celular primeiro: alvos de toque de 44px ou mais, botão principal de 56px.
 */

export type Tone = "success" | "warning" | "danger" | "brand" | "muted";

const SOFT: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  brand: "bg-brand-soft text-brand-ink",
  muted: "bg-sunken text-ink-muted",
};
const TEXT: Record<Tone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  brand: "text-brand-ink",
  muted: "text-ink-subtle",
};

/** Conteúdo de uma tela: coluna com respiro lateral de 20px. */
export function Screen({ children, gap = "gap-6", className = "" }: { children: ReactNode; gap?: string; className?: string }) {
  return <div className={`flex flex-col px-5 pt-2 pb-7 md:px-0 md:pt-0 ${gap} ${className}`}>{children}</div>;
}

/** Barra de topo das telas internas: seta de voltar e título curto. */
export function BackHeader({ href, title, action }: { href: string; title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-1 px-2 py-1 md:px-0 md:pb-2">
      <Link href={href} aria-label="Voltar" className="flex size-11 items-center justify-center rounded-xl text-ink no-underline hover:bg-sunken md:-ml-3">
        <Icon name="arrowBack" size={24} />
      </Link>
      <span className="flex-1 text-base font-semibold">{title}</span>
      {action}
    </div>
  );
}

export function ScreenTitle({ children, sub, size = "lg" }: { children: ReactNode; sub?: ReactNode; size?: "lg" | "md" }) {
  return (
    <div>
      <h1 className={`m-0 font-display font-[650] leading-[1.1] tracking-[-0.02em] ${size === "lg" ? "text-[30px]" : "text-[28px]"}`}>{children}</h1>
      {sub && <p className="mt-1.5 text-[15px] text-ink-muted">{sub}</p>}
    </div>
  );
}

export function SectionTitle({ children, id, action }: { children: ReactNode; id?: string; action?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 id={id} className="m-0 font-sans text-[17px] font-semibold tracking-normal">{children}</h2>
      {action}
    </div>
  );
}

/** Etiqueta de status: a StatusTag do sistema (fundo suave, ícone e texto curto). */
export function Chip({ tone, icon, children, onWhite = false, small = false }: { tone: Tone; icon?: IconName; children: ReactNode; onWhite?: boolean; small?: boolean }) {
  return (
    <StatusTag tone={tone} icon={icon ?? null} small={small} onSurface={onWhite} className="self-start">
      {children}
    </StatusTag>
  );
}

/** Status em texto colorido com ícone, sem fundo (listas e boletim). */
export function StatusText({ tone, icon, children }: { tone: Tone; icon?: IconName; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[13px] font-semibold ${TEXT[tone]}`}>
      {icon && <Icon name={icon} size={16} />}
      {children}
    </span>
  );
}

/* Botões e campos do sistema de design, no tamanho de celular (largura total). */
export const primaryBtn = btn("primary", "xl", "flex w-full");
export const secondaryBtn = btn("secondary", "lg", "flex w-full");
export const textBtn = btn("text", "lg", "flex w-full");
export const inputCls = fieldLargeCls;
export const textareaCls = "w-full rounded-[12px] border border-line-strong bg-surface p-3.5 text-base font-normal text-ink placeholder:text-ink-subtle";

export function Card({ children, className = "", padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return <div className={`overflow-hidden rounded-[20px] bg-surface ${padded ? "p-5" : ""} ${className}`}>{children}</div>;
}

/** Caixa de ícone 40px usada nas listas (pendências, notificações). */
export function IconBox({ name, tone = "muted", size = 40 }: { name: IconName; tone?: Tone | "surface"; size?: number }) {
  const look = tone === "surface" ? "bg-surface text-ink-muted" : SOFT[tone];
  return (
    <span aria-hidden="true" style={{ width: size, height: size }} className={`flex shrink-0 items-center justify-center rounded-xl ${look}`}>
      <Icon name={name} size={size > 40 ? 24 : 22} />
    </span>
  );
}

/** Linha clicável de um grupo branco: ícone, título, detalhe e seta. */
export function RowLink({
  href,
  icon,
  iconTone,
  title,
  detail,
  detailTone,
  trailing,
  external = false,
}: {
  href: string;
  icon?: IconName;
  iconTone?: Tone;
  title: ReactNode;
  detail?: ReactNode;
  detailTone?: Tone;
  trailing?: ReactNode;
  external?: boolean;
}) {
  const body = (
    <>
      {icon && (iconTone ? <IconBox name={icon} tone={iconTone} /> : <Icon name={icon} className="text-ink-muted" />)}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-semibold text-ink">{title}</span>
        {detail && <span className={`text-[13px] font-medium ${detailTone ? TEXT[detailTone] : "text-ink-muted"}`}>{detail}</span>}
      </span>
      {trailing}
      <Icon name="chevronRight" className="text-ink-subtle" />
    </>
  );
  const cls = "flex min-h-16 items-center gap-3 border-t border-line px-4 py-3.5 no-underline first:border-t-0 hover:bg-canvas";
  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls}>{body}</a>
  ) : (
    <Link href={href} className={cls}>{body}</Link>
  );
}

export function Group({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`overflow-hidden rounded-[18px] bg-surface ${className}`}>{children}</div>;
}

export function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase()).join("");
}

export function Avatar({ name, size = 36, brand = false }: { name: string; size?: number; brand?: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size >= 56 ? 20 : 13 }}
      className={`flex shrink-0 items-center justify-center rounded-full font-bold ${size >= 56 ? "font-display font-semibold" : ""} ${brand ? "bg-brand-soft text-brand-ink" : "bg-sunken text-ink-muted"}`}
    >
      {initials(name)}
    </span>
  );
}

/** Tela de estado (sucesso, bloqueio, vazio): ícone grande, título e texto. */
export function StateBlock({ icon, tone, title, children }: { icon: IconName; tone: Tone; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col justify-center gap-4">
      <span aria-hidden="true" className={`flex size-[72px] items-center justify-center rounded-full ${SOFT[tone]}`}>
        <Icon name={icon} size={36} />
      </span>
      <h1 className="m-0 font-display text-[28px] font-[650] leading-[1.1] tracking-[-0.02em]">{title}</h1>
      <div className="text-base text-ink-muted">{children}</div>
    </div>
  );
}

/** Lista vazia dentro de uma tela: o EmptyState do sistema. */
export function Empty({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <EmptyState icon={icon} title={title} className="rounded-[20px] p-5">
      {children}
    </EmptyState>
  );
}

/** Barra de progresso com marca de meta opcional. */
export function Meter({ percent, goal, label }: { percent: number; goal?: number; label: string }) {
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div role="meter" aria-label={label} aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100} className="relative h-2.5 rounded-[5px] bg-sunken">
      <span className="absolute inset-y-0 left-0 rounded-[5px] bg-brand" style={{ width: `${p}%` }} />
      {goal != null && <span className="absolute -inset-y-1 w-0.5 bg-ink" style={{ left: `${Math.max(0, Math.min(100, goal))}%` }} />}
    </div>
  );
}
