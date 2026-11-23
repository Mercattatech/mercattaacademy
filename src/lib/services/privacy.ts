import type { PoolClient } from "pg";

/** Tudo o que a instituição guarda sobre a pessoa. Sem conteúdo de arquivos e sem dados de outras pessoas. */
export async function exportMyData(c: PoolClient, userId: string, tenantName: string) {
  const q = async <T extends object>(sql: string, params: unknown[] = [userId]) => (await c.query<T>(sql, params)).rows;
  const profile = (await q<{ name: string; email: string; created_at: Date }>(`select name, email, "createdAt" as created_at from "user" where id = $1`))[0];
  const enrollments = await q<{ id: string }>(
    `select e.id, co.name as turma, p.name as curso, e.status, e.stage as etapa, e.created_at from enrollments e
     join cohorts co on co.tenant_id = e.tenant_id and co.id = e.cohort_id join programs p on p.tenant_id = co.tenant_id and p.id = co.program_id where e.user_id = $1 order by e.created_at`);
  const ids = enrollments.map((e) => e.id);
  const byEnr = <T extends object>(sql: string) => q<T>(sql, [ids]);
  return {
    gerado_em: new Date().toISOString(),
    instituicao: tenantName,
    perfil: profile ?? null,
    perfis_de_acesso: await q(`select role as perfil, created_at from memberships where user_id = $1`),
    inscricoes: enrollments.map(({ id: _id, ...rest }) => rest),
    documentos_enviados: await byEnr(`select dt.name as tipo, sd.status, sd.file_name as arquivo, sd.size_bytes as tamanho, sd.sent_at, sd.rejected_reason as motivo_da_recusa
      from student_documents sd join document_types dt on dt.id = sd.document_type_id where sd.enrollment_id = any($1::uuid[]) order by sd.sent_at`),
    pagamentos: await byEnr(`select installment_no as parcela, installments as total_de_parcelas, amount_cents as valor_em_centavos, status, due_date as vencimento, paid_at as pago_em
      from payments where enrollment_id = any($1::uuid[]) order by due_date`),
    notas: await byEnr(`select a.title as avaliacao, g.score as nota, a.max_score as nota_maxima, g.updated_at from grades g join assessments a on a.id = g.assessment_id where g.enrollment_id = any($1::uuid[]) order by a.created_at`),
    presencas: await byEnr(`select l.title as aula, l.starts_at as data, att.seconds as segundos_conectado, att.present as presente from attendance att join lessons l on l.id = att.lesson_id where att.enrollment_id = any($1::uuid[]) order by l.starts_at`),
    certificados: await byEnr(`select program_name as curso, cohort_name as turma, code as codigo, final_grade as media_final, frequency_percent as frequencia, issued_at as emitido_em, revoked_at as anulado_em from certificates where enrollment_id = any($1::uuid[])`),
    comentarios_em_aulas: await q(`select l.title as aula, lc.body as texto, lc.created_at from lesson_comments lc join lessons l on l.tenant_id = lc.tenant_id and l.id = lc.lesson_id where lc.user_id = $1 order by lc.created_at`),
    atendimento: await q(`select t.subject as assunto, t.status, m.staff as mensagem_da_equipe, m.body as texto, m.created_at from support_threads t join support_messages m on m.thread_id = t.id where t.user_id = $1 order by t.created_at, m.created_at`),
    notificacoes: await q(`select message as mensagem, read_at as lida_em, created_at from notifications where user_id = $1 order by created_at desc limit 500`),
  };
}
