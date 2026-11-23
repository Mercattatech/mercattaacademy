import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icon";
import {
  btn,
  Button,
  EmptyState,
  Field,
  LoadingCard,
  MetricCard,
  ModalCard,
  NoAccess,
  Notice,
  SelectField,
  StatusTag,
  StepTimeline,
  TextareaField,
} from "@/components/ui";
import { requireMaster } from "@/lib/guards";

export const metadata = { title: "Sistema de design", robots: { index: false } };

const mono = "font-mono";

function Section({ n, title, aside, children }: { n: string; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={`ds-${n}`} className="flex flex-col gap-8">
      <div className="flex flex-wrap items-baseline gap-4 border-b border-line pb-3">
        <span className={`${mono} text-[13px] text-ink-subtle`}>{n}</span>
        <h2 id={`ds-${n}`} className="m-0 font-display text-[28px] font-[650] tracking-[-0.015em]">
          {title}
        </h2>
        {aside && <span className="text-sm text-ink-subtle">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function Block({ title, note, wide, children }: { title: string; note?: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={`flex min-w-0 flex-col gap-4 ${wide ? "md:col-span-full" : ""}`}>
      <h3 className="m-0 font-sans text-[15px] font-semibold tracking-normal">{title}</h3>
      {children}
      {note && <p className="m-0 text-[13px] text-ink-subtle">{note}</p>}
    </div>
  );
}

const NEUTRALS: [string, string, boolean][] = [
  ["ink", "#16171A", true],
  ["ink-muted", "#4B4E55", true],
  ["ink-subtle · 5.1:1", "#696D75", true],
  ["line-strong", "#C9CAC6", false],
  ["line", "#E3E3E0", false],
  ["sunken", "#EFEFEC", false],
  ["canvas", "#F5F5F3", false],
  ["surface", "#FFFFFF", false],
];

const STATES: [string, string, string][] = [
  ["success", "#1E7A4C", "#E8F4EC"],
  ["warning", "#8F5B00", "#FBF1DC"],
  ["danger", "#B42318", "#FCEBE8"],
];

const TYPE: [string, string, string][] = [
  ["display 40/44", "font-display text-[40px] leading-[1.1] font-[650] tracking-[-0.025em]", "Sua próxima aula"],
  ["h1 32/37", "font-display text-[32px] leading-[1.15] font-[650] tracking-[-0.02em]", "Inscrições da turma"],
  ["h2 24/30", "font-display text-2xl leading-[1.25] font-semibold tracking-[-0.01em]", "Módulo 3 · Preenchedores"],
  ["h3 20/26", "text-xl leading-[1.3] font-semibold", "Documentos para aprovar"],
  ["body 16/24", "text-base", "A secretaria analisa seu documento em até 2 dias úteis."],
  ["sm 14/20", "text-sm text-ink-muted", "Turma 2026.1 · 38 alunos"],
  ["xs 13/18", "text-[13px] text-ink-subtle", "Atualizado há 5 minutos"],
];

const SPACES: [string, number][] = [
  ["1", 4],
  ["2", 8],
  ["3", 12],
  ["4", 16],
  ["6", 24],
  ["8", 32],
  ["12", 48],
  ["16", 64],
];

const RADII: [string, number, string][] = [
  ["sm 6", 6, "etiquetas"],
  ["md 10", 10, "botões, campos"],
  ["lg 16", 16, "blocos"],
  ["xl 24", 24, "modal, destaque"],
  ["full", 999, "avatar"],
];

const NAV: { icon: IconName; label: string; badge?: number; group?: string }[] = [
  { icon: "dashboard", label: "Visão geral", group: "ACADÊMICO" },
  { icon: "school", label: "Pós-graduações" },
  { icon: "file", label: "Documentos", badge: 12 },
  { icon: "payments", label: "Pagamentos", group: "FINANCEIRO" },
];

const BOTTOM: { icon: IconName; label: string }[] = [
  { icon: "home", label: "Início" },
  { icon: "playCircle", label: "Aulas" },
  { icon: "grading", label: "Notas" },
  { icon: "award", label: "Certificados" },
  { icon: "menu", label: "Mais" },
];

const ROWS: { name: string; email: string; cohort: string; tone: "warn" | "ok"; icon: IconName; step: string; checked: boolean }[] = [
  { name: "Mariana Souza", email: "mariana@email.com", cohort: "2026.1 · Noite", tone: "warn", icon: "file", step: "Documentos", checked: true },
  { name: "Rafael Lima", email: "rafael.lima@email.com", cohort: "2026.1 · Noite", tone: "warn", icon: "payments", step: "Pagamento", checked: true },
  { name: "Juliana Prates", email: "ju.prates@email.com", cohort: "2025.2 · Sábado", tone: "ok", icon: "checkCircle", step: "Liberado", checked: false },
];

function Check({ on }: { on: boolean }) {
  return on ? (
    <span aria-label="Selecionada" className="flex size-[18px] items-center justify-center rounded-[5px] bg-brand text-white">
      <Icon name="check" size={14} strong />
    </span>
  ) : (
    <span aria-label="Não selecionada" className="inline-block size-[18px] rounded-[5px] border-[1.5px] border-line-strong" />
  );
}

/** Miniatura do painel com a marca de uma instituição (seção 05). */
function ThemedPanel({ theme, mark }: { theme: string; mark: ReactNode }) {
  return (
    <div data-theme={theme} className="grid min-h-[380px] grid-cols-1 overflow-hidden rounded-[20px] border border-line bg-canvas sm:grid-cols-[184px_1fr]">
      <aside className="hidden flex-col gap-0.5 border-r sm:flex border-line bg-surface px-2.5 py-4 text-[13px]">
        <div className="mx-1.5 mb-3.5 flex h-10 items-center gap-2">{mark}</div>
        {NAV.map((n, i) => (
          <div key={n.label} className="contents">
            {n.group && <span className={`px-2 ${i ? "pt-2.5" : "pt-1.5"} pb-0.5 text-[11px] font-semibold tracking-[.03em] text-ink-subtle`}>{n.group}</span>}
            <span className={`flex h-9 items-center gap-2 rounded-lg px-2 ${i === 0 ? "bg-brand-soft font-semibold text-brand-ink" : "text-ink-muted"}`}>
              <Icon name={n.icon} size={18} />
              <span className="truncate">{n.label}</span>
            </span>
          </div>
        ))}
      </aside>
      <div className="flex min-w-0 flex-col gap-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="font-display text-[22px] font-semibold tracking-[-0.01em]">Bom dia, Carla</span>
          <span className="inline-flex h-10 items-center rounded-[10px] bg-brand px-3.5 text-sm font-semibold whitespace-nowrap text-on-brand">Abrir turma</span>
        </div>
        <span className="text-[13px] font-semibold text-ink-subtle">PRECISA DE AÇÃO HOJE</span>
        <div className="rounded-[14px] border border-line bg-surface">
          {(
            [
              [12, "documentos para aprovar", "Revisar"],
              [5, "pagamentos pendentes", "Ver lista"],
              [4, "aulas nesta semana", "Abrir agenda"],
            ] as const
          ).map(([n, t, a], i) => (
            <div key={t} className={`flex items-center gap-3 px-3.5 py-3 ${i ? "border-t border-line" : ""}`}>
              <span className="w-9 font-display text-2xl font-semibold">{n}</span>
              <span className="flex-1 text-sm">{t}</span>
              <span className="text-sm font-semibold text-brand-ink underline underline-offset-2">{a}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusTag tone="brand">Publicado</StatusTag>
          <StatusTag tone="ok">Liberado</StatusTag>
        </div>
      </div>
    </div>
  );
}

/**
 * Sistema de design (protótipo, aba "Sistema de design"), montado com os componentes reais
 * de src/components/ui.tsx. Serve de referência viva: se um componente mudar, muda aqui também.
 */
export default async function DesignSystemPage() {
  await requireMaster("/master/design-system");
  const tokens = await readFile(path.join(process.cwd(), "src/styles/theme.css"), "utf8").catch(() => "");

  return (
    <div className="flex flex-col gap-[72px] pb-16 md:gap-[88px]">
      <section className="grid items-end gap-6 md:grid-cols-2 md:gap-12">
        <div>
          <p className="m-0 mb-3 text-sm font-semibold text-brand-ink">Sistema de design</p>
          <h1 className="m-0 font-display text-[36px] leading-[1.05] font-[650] tracking-[-0.025em] text-balance md:text-[48px]">
            Neutro por padrão. A marca de cada instituição entra em um só lugar.
          </h1>
        </div>
        <p className="m-0 max-w-[52ch] text-[17px] text-pretty text-ink-muted">
          Uma única variável, <code className={`${mono} rounded-md bg-sunken px-1.5 py-0.5 text-sm`}>--color-brand</code>, define botões, links, item ativo e
          destaques. Tons suaves e escuros são derivados dela. O resto da interface é tinta, papel e linha.
        </p>
      </section>

      <Section n="01" title="Cores">
        <div className="grid gap-10 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
          <Block title="Marca · variável" note="strong, soft e ink são calculados com color-mix. A instituição informa só uma cor.">
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2 flex h-24 flex-col justify-between rounded-2xl bg-brand px-4 py-3.5 text-on-brand">
                <span className="font-semibold">brand</span>
                <span className={`${mono} text-xs`}>texto branco ≥ 4.5:1</span>
              </div>
              <div className="h-16 rounded-[12px] bg-brand-strong px-3 py-2.5 text-[13px] font-semibold text-white">brand-strong</div>
              <div className="h-16 rounded-[12px] bg-brand-soft px-3 py-2.5 text-[13px] font-semibold text-brand-ink">brand-soft / brand-ink</div>
            </div>
          </Block>
          <Block title="Neutros">
            <div className="flex flex-col overflow-hidden rounded-2xl border border-line">
              {NEUTRALS.map(([name, hex, dark]) => (
                <div key={name} className={`flex items-center gap-3 px-3 py-2.5 text-[13px] ${dark ? "text-white" : ""}`} style={{ background: hex }}>
                  <span className="flex-1 font-semibold">{name}</span>
                  <span className={mono}>{hex}</span>
                </div>
              ))}
            </div>
          </Block>
          <Block title="Estados" note="Todo estado vem com ícone e texto. A cor nunca é o único sinal.">
            <div className="flex flex-col gap-2">
              {STATES.map(([name, strong, soft]) => (
                <div key={name} className="grid grid-cols-[56px_1fr] gap-2">
                  <div className="h-14 rounded-[12px]" style={{ background: strong }} />
                  <div className="rounded-[12px] px-3 py-2 text-[13px]" style={{ background: soft, color: strong }}>
                    <strong>{name}</strong> · {strong}
                    <br />
                    {name}-soft · {soft}
                  </div>
                </div>
              ))}
            </div>
          </Block>
        </div>
      </Section>

      <Section n="02" title="Tipografia">
        <div className="grid gap-12 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="flex flex-col gap-5">
            <div>
              <div className="font-display text-[56px] leading-none font-[650] tracking-[-0.03em]">Aa</div>
              <p className="m-0 mt-2 text-sm">
                <strong>Bricolage Grotesque</strong>
                <br />
                <span className="text-ink-subtle">Títulos e números. Pesos 500–700.</span>
              </p>
            </div>
            <div>
              <div className="text-[56px] leading-none font-medium">Aa</div>
              <p className="m-0 mt-2 text-sm">
                <strong>Instrument Sans</strong>
                <br />
                <span className="text-ink-subtle">Interface e leitura. Pesos 400–600.</span>
              </p>
            </div>
          </div>
          <div className="flex flex-col">
            {TYPE.map(([k, cls, sample], i) => (
              <div key={k} className={`grid grid-cols-[96px_1fr] items-baseline gap-4 py-3.5 sm:grid-cols-[120px_1fr] ${i < TYPE.length - 1 ? "border-b border-line" : ""}`}>
                <span className={`${mono} text-xs text-ink-subtle`}>{k}</span>
                <span className={`min-w-0 ${cls}`}>{sample}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section n="03" title="Espaçamento e raios">
        <div className="grid gap-12 [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]">
          <div className="flex flex-col gap-2.5">
            {SPACES.map(([k, px]) => (
              <div key={k} className="flex items-center gap-4 text-[13px]">
                <span className={`${mono} w-[72px] text-ink-subtle`}>
                  {k} · {px}px
                </span>
                <span className="h-3 rounded-[2px] bg-brand" style={{ width: px }} />
              </div>
            ))}
            <p className="m-0 mt-2 text-[13px] text-ink-subtle">
              Base 4px (<code className={mono}>--spacing: 0.25rem</code>). Alvos de toque: mínimo 44px, 52–56px para ação principal no celular.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            {RADII.map(([k, r, use]) => (
              <div key={k} className="flex flex-col items-center gap-2">
                <div className="size-[72px] border-[1.5px] border-ink" style={{ borderRadius: r }} />
                <span className={`${mono} text-[13px]`}>{k}</span>
                <span className="text-xs text-ink-subtle">{use}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section n="04" title="Componentes">
        <div className="grid gap-x-12 gap-y-14 md:grid-cols-[repeat(auto-fit,minmax(340px,1fr))]">
          <Block title="Botão" note="Primário: uma vez por tela. Rótulo sempre com verbo. Altura 44px (desktop) e 52px (celular).">
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button">Salvar alterações</Button>
              <Button type="button" variant="secondary">
                Abrir turma
              </Button>
              <Button type="button" variant="text">
                Ver detalhes
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className={btn("primary", "md", "outline-2 outline-offset-3 outline-brand outline-solid")}>Foco visível</span>
              <Button type="button" disabled>
                Indisponível
              </Button>
              <Button type="button" loading>
                Salvando…
              </Button>
              <Button type="button" variant="danger">
                Recusar
              </Button>
            </div>
          </Block>

          <Block title="Campo de formulário">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome completo" name="ds-nome" defaultValue="Mariana Souza" />
              <Field label="E-mail" name="ds-email" type="email" defaultValue="mariana@" hint="Usado para login e avisos." />
              <Field label="CPF" name="ds-cpf" defaultValue="123.456.789-0" error="Faltam dígitos. O CPF tem 11 números." />
              <SelectField label="Turma" name="ds-turma" defaultValue="noite">
                <option value="noite">2026.1 · Noite</option>
                <option value="sabado">2025.2 · Sábado</option>
              </SelectField>
            </div>
          </Block>

          <Block title="Etiqueta de status">
            <div className="flex flex-wrap gap-2">
              <StatusTag tone="ok">Aprovado</StatusTag>
              <StatusTag tone="warn">Em análise</StatusTag>
              <StatusTag tone="danger">Recusado</StatusTag>
              <StatusTag tone="brand">Publicado</StatusTag>
              <StatusTag tone="muted">Rascunho</StatusTag>
              <StatusTag tone="muted" icon="archive">
                Arquivado
              </StatusTag>
            </div>
          </Block>

          <Block title="Aviso">
            <div className="flex flex-col gap-3">
              <Notice tone="ok" title="Alterações salvas.">
                Os alunos já veem a nova grade.
              </Notice>
              <Notice tone="warn" title="Parcela vence em 3 dias.">
                Pague por Pix para manter o acesso.
              </Notice>
              <Notice tone="danger" title="Não foi possível enviar.">
                Verifique sua conexão e tente de novo.
              </Notice>
              <Notice tone="brand" title="Novo aviso da coordenação.">
                A aula de sábado será presencial.
              </Notice>
            </div>
          </Block>

          <Block title="Cartão de métrica">
            <div className="grid grid-cols-2 gap-3">
              <MetricCard label="Matrículas ativas" value="248" tone="ok" icon="arrowUp" note="12 neste mês" />
              <MetricCard label="Pagamentos pendentes" value="5" tone="warn" icon="clock" note="R$ 2.445 em aberto" />
            </div>
          </Block>

          <Block title="Tabela" wide>
            <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
              <div className="flex min-w-[640px] flex-wrap items-center gap-3 bg-brand-soft px-4 py-2.5 text-sm font-semibold text-brand-ink">
                2 selecionadas
                <span className="inline-flex h-9 items-center rounded-lg bg-brand px-3 text-sm font-semibold text-on-brand">Liberar acesso</span>
                <span className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold">Enviar lembrete</span>
              </div>
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="text-left text-[13px] text-ink-subtle">
                    <th className="w-6 px-4 py-2.5 font-semibold">
                      <Check on={false} />
                    </th>
                    <th className="px-2 py-2.5 font-semibold">Aluno</th>
                    <th className="px-2 py-2.5 font-semibold">Turma</th>
                    <th className="px-2 py-2.5 font-semibold">Etapa</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((r) => (
                    <tr key={r.email} className="border-t border-line">
                      <td className="px-4 py-3">
                        <Check on={r.checked} />
                      </td>
                      <td className="px-2 py-3">
                        <strong className="font-semibold">{r.name}</strong>
                        <br />
                        <span className="text-[13px] text-ink-subtle">{r.email}</span>
                      </td>
                      <td className="px-2 py-3">{r.cohort}</td>
                      <td className="px-2 py-3">
                        <StatusTag tone={r.tone} icon={r.icon}>
                          {r.step}
                        </StatusTag>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-semibold text-brand-ink underline underline-offset-2">Abrir</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Block>

          <Block title="Menu lateral · aberto e recolhido" note="Grupos por tarefa. Itens sem permissão não aparecem. Recolhido mostra rótulo ao passar o mouse.">
            <div className="flex items-start gap-4">
              <div className="flex w-[220px] flex-col gap-0.5 rounded-2xl border border-line bg-surface p-3 text-sm">
                {NAV.map((n, i) => (
                  <div key={n.label} className="contents">
                    {n.group && <span className={`px-2.5 ${i ? "pt-3" : "pt-2"} pb-1 text-xs font-semibold tracking-[.02em] text-ink-subtle`}>{n.group}</span>}
                    <span className={`flex h-10 items-center gap-2.5 rounded-[10px] px-2.5 ${i === 0 ? "bg-brand-soft font-semibold text-brand-ink" : "text-ink-muted"}`}>
                      <Icon name={n.icon} size={20} />
                      {n.label}
                      {n.badge && <span className="ml-auto rounded-md bg-sunken px-1.5 py-px text-xs font-semibold text-ink">{n.badge}</span>}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex w-16 flex-col items-center gap-1 rounded-2xl border border-line bg-surface px-2 py-3">
                {NAV.map((n, i) => (
                  <div key={n.label} className="contents">
                    {n.group && i > 0 && <span className="my-1.5 h-px w-6 bg-line" />}
                    <span title={n.label} className={`flex size-11 items-center justify-center rounded-[10px] ${i === 0 ? "bg-brand-soft text-brand-ink" : "text-ink-muted"}`}>
                      <Icon name={n.icon} size={22} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Block>

          <Block title="Navegação inferior">
            <nav aria-label="Exemplo de navegação inferior" className="grid max-w-[390px] grid-cols-5 rounded-2xl border border-line bg-surface px-1 py-1.5">
              {BOTTOM.map((b, i) => (
                <span key={b.label} className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 text-xs ${i === 0 ? "font-semibold text-brand-ink" : "font-medium text-ink-muted"}`}>
                  <span className={`flex h-[30px] items-center justify-center ${i === 0 ? "w-[52px] rounded-full bg-brand-soft" : ""}`}>
                    <Icon name={b.icon} size={22} strong={i === 0} />
                  </span>
                  {b.label}
                </span>
              ))}
            </nav>
            <h3 className="m-0 mt-4 font-sans text-[15px] font-semibold tracking-normal">Linha do tempo de etapas</h3>
            <StepTimeline
              label="Etapas da inscrição"
              steps={[
                { label: "Dados", note: "Concluído", state: "done" },
                { label: "Documentos", note: "Falta 1 de 4", state: "current" },
                { label: "Pagamento", note: "Próxima etapa", state: "todo" },
              ]}
            />
          </Block>

          <Block title="Modal">
            <div className="flex justify-center rounded-2xl bg-[rgb(22_23_26/.45)] px-5 py-8">
              <ModalCard title="Recusar documento" titleId="ds-modal">
                <p className="m-0 text-sm text-ink-muted">Comprovante de residência de Mariana Souza. O motivo é enviado ao aluno.</p>
                <TextareaField label="Motivo" name="ds-motivo" defaultValue="A foto ficou ilegível. Envie uma imagem nítida, com o endereço visível." />
                <div className="flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="secondary">
                    Cancelar
                  </Button>
                  <Button type="button" variant="danger">
                    Recusar documento
                  </Button>
                </div>
              </ModalCard>
            </div>
          </Block>

          <Block title="Estados de tela">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <EmptyState icon="groupAdd" title="Nenhuma inscrição nesta turma ainda" action={<Button type="button">Copiar link da turma</Button>}>
                  Compartilhe o link da vitrine para receber as primeiras inscrições.
                </EmptyState>
              </div>
              <LoadingCard />
              <NoAccess title="Sem acesso a Financeiro">Peça ao administrador para liberar.</NoAccess>
            </div>
          </Block>
        </div>
      </Section>

      <Section n="05" title="Mesmo painel, duas instituições" aside={<>Só <code className={mono}>--color-brand</code> e o logo mudam.</>}>
        <div className="grid gap-6 xl:grid-cols-2">
          <ThemedPanel
            theme="bressane"
            mark={
              <>
                <span className="size-7 rounded-lg bg-brand" />
                <span className="font-display text-[15px] leading-[1.05] font-bold">
                  Instituto
                  <br />
                  Bressane
                </span>
              </>
            }
          />
          <ThemedPanel
            theme="aurora"
            mark={
              <>
                <span className="size-7 rounded-lg bg-brand" />
                <span className="font-display text-[15px] leading-[1.05] font-bold">
                  Instituto
                  <br />
                  Aurora
                </span>
              </>
            }
          />
        </div>
      </Section>

      {tokens && (
        <Section n="06" title="Tokens Tailwind v4" aside={<>Arquivo completo em <code className={mono}>src/styles/theme.css</code></>}>
          <pre className={`${mono} m-0 overflow-x-auto rounded-2xl bg-ink p-6 text-[13px] leading-[1.6] text-[#E9E9E6]`}>{tokens.trim()}</pre>
        </Section>
      )}
    </div>
  );
}
