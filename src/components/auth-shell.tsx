import type { ReactNode } from "react";
import type { PublicTenant } from "@/lib/tenant";
import { btn, Notice, Spinner } from "./ui";
import { Icon, type IconName } from "./icon";

/**
 * Moldura das telas de acesso (protótipo, aba Login e cadastro):
 * logo no topo, formulário de até 400px no meio, links no rodapé e, em telas largas,
 * um painel na cor da instituição à direita (no lugar da foto do protótipo).
 * Vindo de uma instituição, usa o logo e a cor dela; senão, a marca da plataforma.
 */
export function AuthShell({ tenant, children }: { tenant?: PublicTenant | null; children: ReactNode }) {
  const style = tenant?.brand.primary ? ({ "--color-brand": tenant.brand.primary } as React.CSSProperties) : undefined;
  return (
    <div style={style} data-theme={tenant ? "tenant" : "ssd"} className="flex min-h-dvh bg-surface">
      <div className="flex min-w-0 flex-[1_1_50%] flex-col">
        <div className="px-6 pt-6 sm:px-12 sm:pt-10">
          {tenant ? (
            <a href={`/t/${tenant.slug}`} aria-label={`${tenant.name}, início`} className="inline-flex text-ink no-underline">
              {tenant.brand.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tenant.brand.logoUrl} alt={tenant.name} className="h-11 w-auto" />
              ) : (
                <span className="font-display text-xl font-semibold">{tenant.name}</span>
              )}
            </a>
          ) : (
            <span className="inline-flex items-center gap-2.5">
              <span className="flex size-11 items-center justify-center rounded-[12px] bg-ink font-display text-sm font-bold text-white">SSD</span>
              <span className="font-display text-base font-bold">Plataforma de Cursos</span>
            </span>
          )}
        </div>
        <main className="flex flex-1 items-center justify-center px-6 pt-8 pb-10 sm:px-12">
          <div className="flex w-full max-w-[400px] flex-col gap-5">{children}</div>
        </main>
        <footer className="flex flex-wrap gap-4 px-6 pb-6 text-[13px] text-ink-subtle sm:px-12">
          {tenant && (
            <a href={`/t/${tenant.slug}/privacidade`} className="text-ink-muted">
              Privacidade
            </a>
          )}
          <span>Plataforma de Cursos</span>
        </footer>
      </div>
      <aside aria-hidden="true" className="hidden min-w-0 flex-[1_1_50%] p-4 lg:flex">
        <div className="relative flex flex-1 flex-col justify-end gap-2.5 overflow-hidden rounded-[24px] bg-brand p-10 text-on-brand">
          <span className="absolute -top-24 -right-24 size-80 rounded-full bg-white/10" />
          <span className="absolute top-40 -right-10 size-40 rounded-full bg-white/10" />
          <span className="text-sm font-semibold opacity-80">{tenant ? "Área do aluno e da equipe" : "Plataforma de pós-graduação"}</span>
          <span className="max-w-[14ch] font-display text-[44px] leading-[1.05] font-[650] tracking-[-0.02em]">{tenant ? tenant.name : "Plataforma de Cursos"}</span>
        </div>
      </aside>
    </div>
  );
}

export function AuthTitle({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div>
      <h1 className="m-0 font-display text-[32px] leading-[1.1] font-[650] tracking-[-0.02em]">{title}</h1>
      {subtitle && <p className="mt-1.5 mb-0 text-[15px] text-ink-muted">{subtitle}</p>}
    </div>
  );
}

/** Círculo de 64px com ícone para telas de resultado (conta criada, e-mail enviado). */
export function AuthBadge({ icon, tone = "ok" }: { icon: IconName; tone?: "ok" | "brand" }) {
  return (
    <span aria-hidden="true" className={`flex size-16 items-center justify-center rounded-full ${tone === "ok" ? "bg-success-soft text-success" : "bg-brand-soft text-brand-ink"}`}>
      <Icon name={icon} size={34} strong />
    </span>
  );
}

/** Aviso de erro no topo do formulário (protótipo: caixa vermelha clara com ícone). */
/** Erro de login/cadastro: o Aviso vermelho do sistema. */
export function AuthAlert({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Notice tone="danger" title={title}>
      {children}
    </Notice>
  );
}

export const authCta = btn("primary", "xl", "w-full gap-2.5");
export const authCtaOutline = btn("secondary", "lg", "w-full rounded-[14px]");
export const authSpinner = <Spinner size={16} />;
