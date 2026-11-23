import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { Icon, type IconName } from "./icon";

/**
 * Componentes base do sistema de design (protótipo, aba "Sistema de design" · Componentes).
 * Neutro por padrão: a única variação por instituição é --color-brand (e o logo).
 * Estados globais (foco, indisponível, carregando, campo com erro) ficam em app/globals.css.
 */

/* ---------- Junção de classes ---------- */

/** Grupos que se substituem: se o ajuste traz um deles, o do padrão sai (no Tailwind, a ordem no className não decide). */
const GROUPS: RegExp[] = [
  /^h-/,
  /^min-h-/,
  /^w-/,
  /^p-/,
  /^px-/,
  /^py-/,
  /^pl-/,
  /^pr-/,
  /^gap-/,
  /^rounded(-|$)/,
  /^font-(thin|light|normal|medium|semibold|bold|extrabold|black|\[\d+\])$/,
  /^text-(xs|sm|base|lg|\d?xl|\[\d+(\.\d+)?px\])$/,
  /^(flex|inline-flex|block|inline-block|grid|hidden)$/,
  /^border(-[0248])?$/,
  /^border-(line|line-strong|danger|brand|transparent)$/,
  /^bg-(surface|sunken|canvas|transparent|brand|danger)$/,
  /^text-(ink|ink-muted|ink-subtle|danger|brand-ink|on-brand|white)$/,
];
const groupOf = (c: string) => GROUPS.findIndex((g) => g.test(c));

/** Junta classes do padrão com um ajuste; o ajuste vence nos grupos acima (altura, largura, espaçamento, fonte, cor…). */
export function cx(base: string, extra = "") {
  const extras = extra.split(/\s+/).filter(Boolean);
  const taken = new Set(extras.map(groupOf).filter((g) => g >= 0));
  return [...base.split(/\s+/).filter((c) => c && !taken.has(groupOf(c))), ...extras].join(" ");
}

/* ---------- Botão ---------- */

export type ButtonVariant = "primary" | "secondary" | "text" | "danger" | "dangerOutline";

const BTN_BASE = "inline-flex items-center justify-center gap-2 whitespace-nowrap no-underline";
const BTN_SIZE = {
  /** 44px: padrão no computador. */
  md: "h-11 rounded-[10px] px-[18px] text-[15px] font-semibold",
  /** 52px: ação principal no celular. */
  lg: "h-[52px] rounded-[12px] px-6 text-base font-semibold",
  /** 56px: ação principal de largura total no celular (inscrição, login, área do aluno). */
  xl: "h-14 rounded-[14px] px-5 text-[17px] font-bold",
};
export type ButtonSize = keyof typeof BTN_SIZE;
const BTN_LOOK: Record<ButtonVariant, string> = {
  primary: "bg-brand text-on-brand hover:bg-brand-strong hover:text-on-brand",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-sunken hover:text-ink",
  text: "bg-transparent text-brand-ink hover:bg-brand-soft hover:text-brand-ink",
  danger: "bg-danger text-white hover:bg-[color-mix(in_oklch,var(--color-danger)_85%,black)] hover:text-white",
  /** Ação destrutiva que ainda pede confirmação (abre o modal, cancela inscrição). */
  dangerOutline: "border border-danger bg-surface text-danger hover:bg-danger-soft hover:text-danger",
};

/** Classes de botão para usar em <Link> ou <a> com o mesmo visual de <Button>. */
export function btn(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra = "") {
  return cx(`${BTN_BASE} ${BTN_SIZE[size]} ${BTN_LOOK[variant]}`, extra);
}

/** Aro girando do estado "Salvando…". Herda a cor do texto do botão. */
export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        border: "2px solid color-mix(in srgb, currentColor 40%, transparent)",
        borderTopColor: "currentColor",
        animation: "ds-spin .8s linear infinite",
      }}
      className="inline-block shrink-0 rounded-full"
    />
  );
}

/**
 * Botão. Primário uma vez por tela; rótulo sempre com verbo.
 * `loading` desativa o clique e mostra o aro girando sem apagar a cor (aria-busy).
 * `variant="quiet"` é o nome antigo de "secondary".
 */
export function Button({
  variant = "primary",
  large = false,
  loading = false,
  className = "",
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant | "quiet"; large?: boolean; loading?: boolean }) {
  const v: ButtonVariant = variant === "quiet" ? "secondary" : variant;
  return (
    <button
      className={btn(v, large ? "lg" : "md", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

/* ---------- Campos ---------- */

/** Visual do campo: 44px, borda de 1px, cantos de 10px, texto de 16px. Foco e erro vêm do CSS global. */
export const fieldCls =
  "h-11 w-full rounded-[10px] border border-line-strong bg-surface px-3 text-base font-normal text-ink placeholder:text-ink-subtle";
export const fieldLargeCls =
  "h-[52px] w-full rounded-[12px] border border-line-strong bg-surface px-3.5 text-base font-normal text-ink placeholder:text-ink-subtle";
/** Campo composto (prefixo + input, ex.: "R$" ou o endereço): foco igual ao do campo simples. */
export const fieldGroupFocus =
  "focus-within:border-brand focus-within:shadow-[inset_0_0_0_1px_var(--color-brand)] focus-within:outline-3 focus-within:outline-brand-soft focus-within:outline-solid";
export const textareaFieldCls =
  "min-h-[84px] w-full resize-y rounded-[10px] border border-line-strong bg-surface px-3 py-2.5 text-[15px] font-normal text-ink placeholder:text-ink-subtle";

function FieldMessages({ id, hint, error }: { id?: string; hint?: string; error?: string }) {
  return (
    <>
      {hint && !error && (
        <p id={`${id}-dica`} className="m-0 text-[13px] font-normal text-ink-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-erro`} role="alert" className="m-0 flex items-center gap-1.5 text-[13px] font-medium text-danger">
          <Icon name="error" size={16} />
          {error}
        </p>
      )}
    </>
  );
}

const describedBy = (id: string | undefined, hint?: string, error?: string) => (error ? `${id}-erro` : hint ? `${id}-dica` : undefined);

/** Campo de texto com rótulo, dica e erro (o erro diz o que fazer, com ícone). */
export function Field({
  label,
  hint,
  error,
  large = false,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string; large?: boolean }) {
  const id = props.id ?? props.name;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cx(large ? fieldLargeCls : fieldCls, `${error ? "border-2" : ""} ${className}`)}
        {...props}
      />
      <FieldMessages id={id} hint={hint} error={error} />
    </div>
  );
}

/** Lista de escolha com a seta do protótipo. */
export function SelectField({
  label,
  hint,
  error,
  children,
  className = "",
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string; error?: string }) {
  const id = props.id ?? props.name;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <span className="relative">
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={cx(fieldCls, `appearance-none pr-10 ${error ? "border-2" : ""} ${className}`)}
          {...props}
        >
          {children}
        </select>
        <Icon name="expand" size={20} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-subtle" />
      </span>
      <FieldMessages id={id} hint={hint} error={error} />
    </div>
  );
}

/** Texto longo (motivo de recusa, comentário). */
export function TextareaField({
  label,
  hint,
  error,
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string; error?: string }) {
  const id = props.id ?? props.name;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cx(textareaFieldCls, `${error ? "border-2" : ""} ${className}`)}
        {...props}
      />
      <FieldMessages id={id} hint={hint} error={error} />
    </div>
  );
}

/* ---------- Etiqueta de status ---------- */

/** Tons de estado. ok/warn/danger/brand/muted são os nomes do sistema; success/warning/bad são apelidos antigos. */
export type StatusTone = "ok" | "warn" | "danger" | "brand" | "muted";
export type ToneAlias = StatusTone | "success" | "warning" | "bad";
export const toneOf = (t: ToneAlias): StatusTone => (t === "success" ? "ok" : t === "warning" ? "warn" : t === "bad" ? "danger" : t);

const TONE_SOFT: Record<StatusTone, string> = {
  ok: "bg-success-soft text-success",
  warn: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  brand: "bg-brand-soft text-brand-ink",
  muted: "bg-sunken text-ink-muted",
};
const TONE_TEXT: Record<StatusTone, string> = {
  ok: "text-success",
  warn: "text-warning",
  danger: "text-danger",
  brand: "text-brand-ink",
  muted: "text-ink-muted",
};
const TONE_ICON: Record<StatusTone, IconName> = { ok: "checkCircle", warn: "clock", danger: "cancel", brand: "currentStep", muted: "edit" };

/**
 * Etiqueta de 26px, cantos de 6px, ícone e texto. A cor nunca é o único sinal.
 * `small` (22px) para listas densas; `onSurface` põe fundo branco quando a etiqueta fica sobre um bloco colorido.
 */
export function StatusTag({
  tone: t,
  icon,
  small = false,
  onSurface = false,
  className = "",
  children,
}: {
  tone: ToneAlias;
  icon?: IconName | null;
  small?: boolean;
  onSurface?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const tone = toneOf(t);
  const name = icon === null ? null : (icon ?? TONE_ICON[tone]);
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md font-semibold whitespace-nowrap ${small ? "h-[22px] pr-1.5 text-xs" : "h-[26px] pr-2 text-[13px]"} ${name ? (small ? "pl-1" : "pl-1.5") : "pl-2"} ${onSurface ? `bg-surface ${TONE_TEXT[tone]}` : TONE_SOFT[tone]} ${className}`}
    >
      {name && <Icon name={name} size={small ? 14 : 16} />}
      {children}
    </span>
  );
}

/* ---------- Aviso ---------- */

const NOTICE_ICON: Record<Exclude<StatusTone, "muted">, IconName> = { ok: "checkCircle", warn: "warning", danger: "error", brand: "info" };
const NOTICE_TEXT: Record<Exclude<StatusTone, "muted">, string> = { ok: "text-success", warn: "text-warning", danger: "text-danger", brand: "text-brand-ink" };

/** Aviso em faixa suave: título forte na cor do estado, explicação em tinta normal. */
export function Notice({
  tone: t,
  title,
  icon,
  children,
  className = "",
}: {
  tone: Exclude<ToneAlias, "muted">;
  title?: ReactNode;
  icon?: IconName;
  children?: ReactNode;
  className?: string;
}) {
  const tone = toneOf(t) as Exclude<StatusTone, "muted">;
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx(`flex gap-3 rounded-[12px] px-3.5 py-3 ${TONE_SOFT[tone]}`, className)}>
      <Icon name={icon ?? NOTICE_ICON[tone]} size={22} />
      <span className="min-w-0 self-center text-sm text-ink">
        {title && <strong className={NOTICE_TEXT[tone]}>{title}</strong>} {children}
      </span>
    </div>
  );
}

/* ---------- Cartão de métrica ---------- */

/** Número grande com rótulo e uma linha de contexto (alta, pendência ou neutra). */
export function MetricCard({
  label,
  value,
  note,
  tone,
  icon,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: "ok" | "warn" | "danger";
  icon?: IconName;
}) {
  const noteColor = tone === "ok" ? "font-semibold text-success" : tone === "warn" ? "font-semibold text-warning" : tone === "danger" ? "font-semibold text-danger" : "text-ink-subtle";
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-line bg-surface p-4">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="font-display text-4xl leading-[1.1] font-semibold tracking-[-0.02em]">{value}</span>
      {note && (
        <span className={`flex items-center gap-1 text-[13px] ${noteColor}`}>
          {icon && <Icon name={icon} size={16} />}
          {note}
        </span>
      )}
    </div>
  );
}

/* ---------- Linha do tempo de etapas ---------- */

export type Step = { label: string; note?: string; state: "done" | "current" | "todo" };

/** Etapas em colunas com barra de 4px; a atual fica meio preenchida. */
export function StepTimeline({ steps, label = "Etapas" }: { steps: Step[]; label?: string }) {
  return (
    <ol aria-label={label} className="m-0 grid list-none gap-2 p-0" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      {steps.map((s) => (
        <li key={s.label} aria-current={s.state === "current" ? "step" : undefined} className="flex flex-col gap-2">
          <span
            className="h-1 rounded-[2px]"
            style={{
              background:
                s.state === "done" ? "var(--color-brand)" : s.state === "current" ? "linear-gradient(90deg,var(--color-brand) 50%,var(--color-line) 50%)" : "var(--color-line)",
            }}
          />
          <span className={`flex items-center gap-1.5 text-sm font-semibold ${s.state === "todo" ? "text-ink-muted" : ""}`}>
            <Icon
              name={s.state === "done" ? "checkCircle" : s.state === "current" ? "currentStep" : "emptyStep"}
              size={18}
              strong={s.state === "done"}
              className={s.state === "done" ? "text-success" : s.state === "current" ? "text-brand" : ""}
            />
            {s.label}
          </span>
          {s.note && <span className="text-[13px] text-ink-subtle">{s.note}</span>}
        </li>
      ))}
    </ol>
  );
}

/* ---------- Modal ---------- */

/** Caixa do modal: 420px, cantos de 24px, sombra de sobreposição. O fundo e o abrir/fechar ficam com quem usa. */
export function ModalCard({ title, titleId, onCloseLabel = "Fechar", close, children }: { title: string; titleId: string; onCloseLabel?: string; close?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex w-full max-w-[420px] flex-col gap-4 rounded-[24px] bg-surface p-6 shadow-[var(--shadow-overlay)]">
      <div className="flex items-start justify-between gap-3">
        <h2 id={titleId} className="m-0 font-display text-[22px] font-semibold">
          {title}
        </h2>
        {close ?? (
          <button type="button" aria-label={onCloseLabel} className="-mt-2.5 -mr-2.5 flex size-11 items-center justify-center rounded-[10px] text-ink-muted hover:bg-sunken">
            <Icon name="close" size={22} />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

/* ---------- Estados de tela ---------- */

/** Vazio: borda tracejada, ícone na cor da marca, título, explicação e a próxima ação. */
export function EmptyState({
  icon,
  title,
  children,
  action,
  success = false,
  className = "",
}: {
  icon: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  /** Vazio "bom" (nada pendente): ícone verde. */
  success?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-start gap-2 rounded-2xl border-[1.5px] border-dashed border-line-strong px-6 py-7 ${className}`}>
      <Icon name={icon} size={28} className={success ? "text-success" : "text-brand"} />
      <strong className="text-base">{title}</strong>
      {children && <span className="max-w-[60ch] text-sm text-ink-muted">{children}</span>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/** Carregando: barras cinzas no lugar do conteúdo. */
export function LoadingCard({ lines = [60, 90, 75] }: { lines?: number[] }) {
  return (
    <div aria-busy="true" aria-label="Carregando" className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-4">
      <span className="text-xs font-semibold text-ink-subtle">CARREGANDO</span>
      {lines.map((w, i) => (
        <span key={i} className="h-3 rounded-md bg-sunken" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

/** Sem acesso: cadeado, o que está bloqueado e a quem pedir. */
export function NoAccess({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-line bg-surface p-4">
      <Icon name="lock" size={24} className="text-ink-muted" />
      <strong className="text-sm">{title}</strong>
      {children && <span className="text-[13px] text-ink-muted">{children}</span>}
    </div>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8">{children}</main>;
}
