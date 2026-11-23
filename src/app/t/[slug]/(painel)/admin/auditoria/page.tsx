import Link from "next/link";
import { btnOutline, EmptyBox, inputCls, labelCls, PageHead, Pill } from "@/components/admin-ui";
import { withContext } from "@/lib/db";
import { requireStaff } from "@/lib/guards";

const ENTITIES: Record<string, string> = {
  lesson: "Aulas", assessment: "Avaliações", certificate: "Certificados", announcement: "Avisos", enrollment: "Inscrições",
  student_document: "Documentos", document: "Documentos", payment: "Pagamentos", payment_settings: "Pagamentos", tenant: "Instituição",
  membership: "Equipe", program: "Cursos", cohort: "Turmas", admin_area: "Suporte", feature: "Plano", plan: "Plano", platform_invoice: "Plano",
};

/** Frases curtas no lugar dos códigos gravados. */
const ACTIONS: Record<string, string> = {
  access_released: "liberou o acesso de um aluno",
  access_released_by_payment: "teve o acesso liberado pelo pagamento",
  announcement_posted: "publicou um aviso",
  assessment_created: "criou uma avaliação",
  assessment_deleted: "excluiu uma avaliação",
  assessment_updated: "alterou uma avaliação",
  certificate_issued: "emitiu um certificado",
  certificate_revoked: "anulou um certificado",
  csv_import: "importou alunos por planilha",
  document_approved: "aprovou um documento",
  document_rejected: "recusou um documento",
  document_viewed: "abriu um documento de aluno",
  enrollment_canceled: "cancelou uma matrícula",
  grades_saved: "lançou notas",
  invoice_created: "gerou uma fatura da plataforma",
  invoice_paid: "teve a fatura da plataforma paga",
  lesson_canceled: "cancelou uma aula",
  lesson_ended: "encerrou uma aula",
  lesson_scheduled: "agendou uma aula",
  lesson_started: "iniciou uma aula",
  member_removed: "removeu o acesso de alguém da equipe",
  payment_created: "gerou uma cobrança",
  payment_settings_saved: "alterou a conexão com o Asaas",
  plan_updated: "alterou o plano",
  presence_closed: "fechou a presença de uma aula",
  settings_updated: "alterou as configurações",
  support_access: "entrou no painel como suporte",
  tenant_created: "criou a instituição",
  tenant_updated: "alterou os dados da instituição",
};

/** Detalhe legível a partir do JSON gravado (só campos conhecidos). */
function detail(data: Record<string, unknown> | null): string {
  if (!data) return "";
  const parts: string[] = [];
  for (const k of ["document", "title", "student", "name", "reason", "count", "rows"]) {
    const v = data[k];
    if (typeof v === "string" || typeof v === "number") parts.push(k === "reason" ? `Motivo: ${v}` : String(v));
  }
  return parts.join(" · ").slice(0, 200);
}

const TZ = "America/Sao_Paulo";
const when = (d: Date) => {
  const day = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "numeric", month: "short" }).format(d).replace(".", "");
  const time = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
  return `${day}, ${time}`;
};

/** Auditoria (protótipo): linha do tempo "quando · quem fez o quê". */
export default async function AuditPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tipo?: string; q?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireStaff(slug, [], `/t/${slug}/admin/auditoria`); // só administração
  const base = `/t/${slug}/admin/auditoria`;
  const entity = sp.tipo && /^[a-z_]{2,40}$/.test(sp.tipo) ? sp.tipo : null;
  const q = sp.q?.trim().slice(0, 60) || null;
  const actionCodes = q ? Object.entries(ACTIONS).filter(([, t]) => t.includes(q.toLowerCase())).map(([k]) => k) : [];

  const { rows, entities } = await withContext({ tenantId: ctx.tenant.id, userId: ctx.userId }, async (c) => ({
    rows: (
      await c.query<{ id: string; action: string; entity: string; created_at: Date; actor: string | null; data: Record<string, unknown> | null }>(
        `select a.id, a.action, a.entity, a.created_at, u.name as actor, a.data
         from audit_log a left join "user" u on u.id = a.actor_user_id
         where a.tenant_id = $1 and ($2::text is null or a.entity = $2)
           and ($3::text is null or u.name ilike '%' || $3 || '%' or a.action ilike '%' || $3 || '%' or a.action = any($4::text[]))
         order by a.created_at desc, a.id desc limit 200`,
        [ctx.tenant.id, entity, q, actionCodes],
      )
    ).rows,
    entities: (await c.query<{ entity: string }>("select distinct entity from audit_log where tenant_id = $1 order by entity", [ctx.tenant.id])).rows.map((r) => r.entity),
  }));

  const groups = [...new Set(entities.map((e) => ENTITIES[e] ?? e))];
  const link = (e: string | null) => {
    const p = new URLSearchParams();
    if (e) p.set("tipo", e);
    if (q) p.set("q", q);
    return `${base}${p.size ? `?${p}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHead title="Auditoria" sub="Tudo o que foi alterado, por quem e quando. Mostra os 200 registros mais recentes." />
      <div className="flex flex-wrap items-end gap-3">
        <form method="get" action={base} className="flex flex-wrap items-end gap-2">
          {entity && <input type="hidden" name="tipo" value={entity} />}
          <label className={`${labelCls} w-[320px] max-w-full text-[13px]`}>
            Filtrar por pessoa ou ação
            <input name="q" type="search" defaultValue={q ?? ""} placeholder="Ex.: Ana, aprovou, nota" className={inputCls} />
          </label>
          <button type="submit" className={btnOutline}>Filtrar</button>
        </form>
      </div>
      {groups.length > 1 && (
        <nav aria-label="Tipo" className="flex flex-wrap gap-1.5">
          <Pill href={link(null)} active={!entity} label="Tudo" />
          {groups.map((g) => {
            const code = entities.find((e) => (ENTITIES[e] ?? e) === g)!;
            return <Pill key={g} href={link(code)} active={!!entity && (ENTITIES[entity] ?? entity) === g} label={g} />;
          })}
        </nav>
      )}
      {rows.length === 0 ? (
        <EmptyBox icon="history" title="Nenhum registro neste filtro" action={q || entity ? <Link href={base} className={btnOutline}>Limpar filtros</Link> : undefined} />
      ) : (
        <ol className="m-0 flex list-none flex-col p-0">
          {rows.map((r) => (
            <li key={r.id} className="grid grid-cols-[96px_minmax(0,1fr)] gap-4 border-t border-line py-3.5 sm:grid-cols-[120px_minmax(0,1fr)]">
              <span className="text-[13px] text-ink-subtle tabular-nums">{when(r.created_at)}</span>
              <span className="text-[15px]">
                <strong className="font-semibold">{r.actor ?? "Sistema"}</strong> {ACTIONS[r.action] ?? r.action.replaceAll("_", " ")}
                <span className="mt-0.5 block text-[13px] text-ink-muted">
                  {[ENTITIES[r.entity] ?? r.entity, detail(r.data)].filter(Boolean).join(" · ")}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
