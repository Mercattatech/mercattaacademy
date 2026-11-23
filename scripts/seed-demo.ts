import "dotenv/config";
import { Client } from "pg";

/**
 * Dados de DEMONSTRAÇÃO para conferir o visual (só desenvolvimento).
 * Roda depois de `npm run db:seed`. Popula a instituição Bressane com cursos,
 * turmas, aulas, alunos em várias etapas, notas, avisos e atendimento, e cria
 * a instituição Aurora (suspensa, com cobrança em atraso) para o painel master.
 * Se a Bressane já tem o curso de demonstração, não faz nada.
 *
 *   npm run db:seed:demo
 *
 * Todos os usuários usam a senha de MASTER_PASSWORD. Os arquivos (documentos e
 * materiais) são fictícios: aparecem nas listas, mas o download não existe.
 */
const PEOPLE = {
  coordenacao: ["Marina Teixeira", "coordenacao@bressane.local", "coordenacao"],
  secretaria: ["Paulo Ribeiro", "secretaria@bressane.local", "secretaria"],
  financeiro: ["Renata Campos", "financeiro@bressane.local", "financeiro"],
  prof1: ["Helena Duarte", "helena@bressane.local", "professor"],
  prof2: ["Ricardo Almeida", "ricardo@bressane.local", "professor"],
  ana: ["Ana Souza", "ana@aluno.local", "aluno"],
  bruno: ["Bruno Lima", "bruno@aluno.local", "aluno"],
  carla: ["Carla Mendes", "carla@aluno.local", "aluno"],
  diego: ["Diego Rocha", "diego@aluno.local", "aluno"],
  elisa: ["Elisa Prado", "elisa@aluno.local", "aluno"],
  felipe: ["Felipe Nunes", "felipe@aluno.local", "aluno"],
} as const;
type Key = keyof typeof PEOPLE;

async function main() {
  const ownerUrl = process.env.DATABASE_OWNER_URL;
  const password = process.env.MASTER_PASSWORD ?? "trocar-esta-senha";
  if (!ownerUrl) throw new Error("Defina DATABASE_OWNER_URL no .env");
  if (process.env.NODE_ENV === "production" || !/@(localhost|127\.0\.0\.1)[:/]/.test(ownerUrl)) {
    throw new Error("Recusado: dados de demonstração só rodam em banco local.");
  }

  const { auth } = await import("../src/lib/auth");
  const { pool } = await import("../src/lib/db");

  const ids = {} as Record<Key, string>;
  for (const key of Object.keys(PEOPLE) as Key[]) {
    const [name, email] = PEOPLE[key];
    const found = await pool.query<{ id: string }>(`select id from "user" where email = $1`, [email]);
    ids[key] = found.rows[0]?.id ?? (await auth.api.signUpEmail({ body: { name, email, password } })).user.id;
  }

  const db = new Client({ connectionString: ownerUrl });
  await db.connect();
  const q = async <T extends object = Record<string, never>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
  const one = async <T extends object>(sql: string, params: unknown[] = []) => (await q<T>(sql, params))[0];

  try {
    await db.query("begin");
    await db.query("select set_config('app.is_master', 'on', true)");

    const tenant = await one<{ id: string }>(`select id from tenants where slug = 'bressane'`);
    if (!tenant) throw new Error("Rode `npm run db:seed` antes (cria a instituição Bressane).");
    const T = tenant.id;
    if (await one(`select 1 from programs where tenant_id = $1 and name = 'Gestão de Projetos'`, [T])) {
      await db.query("rollback");
      console.log("Dados de demonstração já existem na Bressane. Nada a fazer.");
      return;
    }

    // ---- equipe
    for (const key of Object.keys(PEOPLE) as Key[]) {
      await q(`insert into memberships (tenant_id, user_id, role) values ($1, $2, $3) on conflict do nothing`, [T, ids[key], PEOPLE[key][2]]);
    }
    await q(
      `insert into teacher_profiles (tenant_id, user_id, headline, bio) values
         ($1, $2, 'Mestre em Administração, gerente de projetos há 15 anos', 'Atua em PMO e transformação digital. Autora de dois livros sobre gestão ágil e mentora de líderes de projeto.'),
         ($1, $3, 'Doutor em Direito Digital e consultor em proteção de dados', 'Advogado e professor, atua em adequação à LGPD e contratos de tecnologia para empresas de médio e grande porte.')
       on conflict do nothing`,
      [T, ids.prof1, ids.prof2],
    );
    await q(
      `insert into certificate_settings (tenant_id, signer_name, signer_title, footer_text) values ($1, 'Marina Teixeira', 'Coordenadora acadêmica', 'Instituto Bressane, credenciado e em funcionamento regular.')
       on conflict do nothing`,
      [T],
    );

    // ---- cursos
    const p1 = await one<{ id: string }>(
      `insert into programs (tenant_id, name, summary, description, workload_hours, status, price_cents, max_installments, payment_note)
       values ($1, 'Gestão de Projetos', 'Planejamento, execução e controle de projetos com métodos ágeis e tradicionais.',
               'Formação para quem lidera entregas: escopo, cronograma, riscos, equipes e métricas. Aulas ao vivo semanais, estudos de caso e projeto aplicado.',
               360, 'published', 480000, 12, 'À vista ou em até 12x') returning id`,
      [T],
    );
    const p2 = await one<{ id: string }>(
      `insert into programs (tenant_id, name, summary, description, workload_hours, status, price_cents, max_installments)
       values ($1, 'Direito Digital e LGPD', 'Proteção de dados, contratos de tecnologia e responsabilidade civil na internet.',
               'Especialização voltada a advogados e profissionais de compliance, com foco em casos reais e adequação à LGPD.', 420, 'published', 540000, 12) returning id`,
      [T],
    );
    await q(
      `insert into programs (tenant_id, name, summary, workload_hours, status) values ($1, 'Liderança e Gestão de Pessoas', 'Em preparação.', 360, 'draft')`,
      [T],
    );

    const mods1 = ["Fundamentos e iniciação", "Planejamento e escopo", "Riscos e qualidade", "Agilidade e entrega"];
    const mods2 = ["Fundamentos do Direito Digital", "LGPD na prática", "Contratos de tecnologia"];
    for (const [i, n] of mods1.entries()) {
      await q(`insert into program_modules (tenant_id, program_id, position, name, workload_hours, default_teacher_id) values ($1,$2,$3,$4,90,$5)`, [T, p1.id, i + 1, n, i % 2 ? ids.prof2 : ids.prof1]);
    }
    for (const [i, n] of mods2.entries()) {
      await q(`insert into program_modules (tenant_id, program_id, position, name, workload_hours, default_teacher_id) values ($1,$2,$3,$4,140,$5)`, [T, p2.id, i + 1, n, ids.prof2]);
    }

    // ---- turmas
    const cA = await one<{ id: string }>(
      `insert into cohorts (tenant_id, program_id, name, starts_on, ends_on, status, enrollment_opens_on, enrollment_closes_on)
       values ($1, $2, 'Turma 2026.1', current_date - 45, current_date + 300, 'running', current_date - 120, current_date + 20) returning id`,
      [T, p1.id],
    );
    const cB = await one<{ id: string }>(
      `insert into cohorts (tenant_id, program_id, name, starts_on, ends_on, status, enrollment_opens_on, enrollment_closes_on)
       values ($1, $2, 'Turma 2026.2', current_date + 60, current_date + 420, 'open', current_date - 10, current_date + 50) returning id`,
      [T, p1.id],
    );
    const cC = await one<{ id: string }>(
      `insert into cohorts (tenant_id, program_id, name, starts_on, ends_on, status, enrollment_opens_on, enrollment_closes_on)
       values ($1, $2, 'Turma 1', current_date + 30, current_date + 400, 'open', current_date - 5, current_date + 25) returning id`,
      [T, p2.id],
    );
    const copyModules = async (cohortId: string, programId: string, first: number) => {
      await q(
        `insert into cohort_modules (tenant_id, cohort_id, program_module_id, position, name, workload_hours, teacher_id, starts_on, ends_on)
         select tenant_id, $1, id, position, name, workload_hours, default_teacher_id,
                current_date + ($3 + (position - 1) * 60), current_date + ($3 + position * 60 - 1)
         from program_modules where program_id = $2`,
        [cohortId, programId, first],
      );
    };
    await copyModules(cA.id, p1.id, -45);
    await copyModules(cB.id, p1.id, 60);
    await copyModules(cC.id, p2.id, 30);
    const mA = await q<{ id: string; position: number }>(`select id, position from cohort_modules where cohort_id = $1 order by position`, [cA.id]);

    // ---- matrículas
    const enroll = async (cohort: string, user: Key, stage: string, source: string, daysAgo: number) =>
      (
        await one<{ id: string }>(
          `insert into enrollments (tenant_id, cohort_id, user_id, status, source, stage, created_at, stage_changed_at)
           values ($1,$2,$3,'active',$4,$5, now() - make_interval(days => $6), now() - make_interval(days => $6)) returning id`,
          [T, cohort, ids[user], source, stage, daysAgo],
        )
      ).id;
    const eAna = await enroll(cA.id, "ana", "released", "vitrine", 70);
    const eBruno = await enroll(cA.id, "bruno", "released", "manual", 60);
    const eCarla = await enroll(cA.id, "carla", "released", "csv", 60);
    const eDiego = await enroll(cA.id, "diego", "released", "vitrine", 50);
    const eElisa = await enroll(cA.id, "elisa", "documents", "vitrine", 2);
    const eFelipe = await enroll(cA.id, "felipe", "payment", "vitrine", 1);
    await enroll(cB.id, "ana", "documents", "vitrine", 3);

    if (!(await one(`select 1 from document_types where tenant_id = $1`, [T]))) await q(`select app.seed_document_types($1)`, [T]);

    // ---- documentos: Elisa enviou 2 de 5 (a secretaria vê pendência), Felipe enviou todos
    const types = await q<{ id: string; position: number }>(`select id, position from document_types where tenant_id = $1 and active order by position`, [T]);
    for (const [i, t] of types.entries()) {
      if (i < 2) await q(`insert into student_documents (tenant_id, enrollment_id, document_type_id, status, storage_key, file_name, content_type, size_bytes, sent_at) values ($1,$2,$3,'sent',$4,$5,'application/pdf',184320, now() - interval '1 day')`, [T, eElisa, t.id, `demo/elisa-${i}.pdf`, `documento-${i + 1}.pdf`]);
      else await q(`insert into student_documents (tenant_id, enrollment_id, document_type_id, status) values ($1,$2,$3,'pending')`, [T, eElisa, t.id]);
      await q(`insert into student_documents (tenant_id, enrollment_id, document_type_id, status, storage_key, file_name, content_type, size_bytes, sent_at) values ($1,$2,$3,'sent',$4,$5,'application/pdf',204800, now() - interval '20 hours')`, [T, eFelipe, t.id, `demo/felipe-${i}.pdf`, `documento-${i + 1}.pdf`]);
    }

    // ---- aulas da Turma 2026.1
    const lessonPlan: [number, string, number, "ended" | "scheduled", string][] = [
      [0, "Abertura e visão geral do curso", -21, "ended", "prof1"],
      [0, "Ciclo de vida do projeto", -14, "ended", "prof1"],
      [0, "Partes interessadas e comunicação", -7, "ended", "prof1"],
      [1, "Definição de escopo e EAP", -3, "ended", "prof2"],
      [1, "Estimativas e cronograma", 0, "scheduled", "prof2"],
      [1, "Orçamento e custos", 3, "scheduled", "prof2"],
      [1, "Estudo de caso: projeto de TI", 10, "scheduled", "prof1"],
      [2, "Gestão de riscos", 17, "scheduled", "prof1"],
    ];
    const lessonIds: string[] = [];
    for (const [m, title, off, status, teacher] of lessonPlan) {
      const isToday = off === 0;
      const l = await one<{ id: string }>(
        `insert into lessons (tenant_id, cohort_id, cohort_module_id, title, starts_at, duration_minutes, teacher_id, status, started_at, ended_at, presence_closed_at, recording_id, recording_seconds)
         values ($1,$2,$3,$4, ${isToday ? "now() + interval '3 hours' + make_interval(days => $5)" : "date_trunc('day', now()) + make_interval(days => $5) + interval '19 hours'"}, 120, $6, $7,
                 $8::timestamptz, $9::timestamptz, $9::timestamptz, $10, $11) returning id`,
        isToday
          ? [T, cA.id, mA[m].id, title, 0, ids[teacher as Key], status, null, null, null, null]
          : [
              T, cA.id, mA[m].id, title, off, ids[teacher as Key], status,
              status === "ended" ? new Date(Date.now() + off * 864e5) : null,
              status === "ended" ? new Date(Date.now() + off * 864e5 + 72e5) : null,
              status === "ended" ? `demo-rec-${off}` : null,
              status === "ended" ? 6800 + Math.abs(off) * 37 : null,
            ],
      );
      lessonIds.push(l.id);
    }
    for (const l of lessonIds.slice(0, 2)) {
      await q(`insert into lesson_materials (tenant_id, lesson_id, file_name, storage_key, size_bytes, uploaded_by) values ($1,$2,'Slides da aula.pdf',$3,2411724,$4), ($1,$2,'Leitura complementar.pdf',$5,884201,$4)`, [T, l, `demo/slides-${l}.pdf`, ids.prof1, `demo/leitura-${l}.pdf`]);
    }

    // presenças das aulas encerradas (Bruno faltou na terceira, Diego na segunda)
    const students = [eAna, eBruno, eCarla, eDiego];
    for (const [li, l] of lessonIds.slice(0, 4).entries()) {
      for (const [si, e] of students.entries()) {
        const present = !((li === 2 && si === 1) || (li === 1 && si === 3));
        await q(`insert into attendance (tenant_id, lesson_id, enrollment_id, seconds, present) values ($1,$2,$3,$4,$5)`, [T, l, e, present ? 6300 + si * 120 : 400, present]);
      }
    }

    // ---- comentários
    await q(
      `insert into lesson_comments (tenant_id, lesson_id, user_id, body, created_at) values
         ($1,$2,$3,'Professora, o material de apoio vai ficar disponível até o fim do módulo?', now() - interval '6 days'),
         ($1,$2,$4,'Sim, fica disponível durante todo o curso. Se precisar de algo a mais, é só pedir.', now() - interval '6 days' + interval '3 hours'),
         ($1,$2,$5,'Ótima aula. O exemplo da fase de iniciação ajudou muito no meu trabalho.', now() - interval '5 days')`,
      [T, lessonIds[2], ids.ana, ids.prof1, ids.carla],
    );

    // ---- avaliações e notas (módulo 1)
    const a1 = await one<{ id: string }>(`insert into assessments (tenant_id, cohort_id, cohort_module_id, title, weight, max_score, due_on, created_by) values ($1,$2,$3,'Prova do módulo 1',2,10, current_date - 5, $4) returning id`, [T, cA.id, mA[0].id, ids.prof1]);
    const a2 = await one<{ id: string }>(`insert into assessments (tenant_id, cohort_id, cohort_module_id, title, weight, max_score, due_on, created_by) values ($1,$2,$3,'Trabalho: plano de comunicação',1,10, current_date + 7, $4) returning id`, [T, cA.id, mA[0].id, ids.prof1]);
    void a2;
    for (const [e, s] of [[eAna, 9.0], [eBruno, 6.5], [eCarla, 8.0], [eDiego, 7.5]] as const) {
      await q(`insert into grades (tenant_id, assessment_id, enrollment_id, score, graded_by) values ($1,$2,$3,$4,$5)`, [T, a1.id, e, s, ids.prof1]);
    }

    // ---- avisos, atendimento, notificações
    await q(
      `insert into announcements (tenant_id, title, body, created_by, published_at) values
         ($1,'Bem-vindos à Turma 2026.1','As aulas acontecem às quartas, às 19h. O link da sala aparece na página da aula 15 minutos antes.',$2, now() - interval '40 days'),
         ($1,'Calendário do módulo 2 publicado','As datas das próximas aulas já estão na agenda. Confira também o prazo do trabalho de comunicação.',$2, now() - interval '4 days')`,
      [T, ids.coordenacao],
    );
    const th1 = await one<{ id: string }>(`insert into support_threads (tenant_id, user_id, subject, status, created_at, last_message_at) values ($1,$2,'Como obtenho a declaração de matrícula?','open', now() - interval '5 hours', now() - interval '5 hours') returning id`, [T, ids.bruno]);
    await q(`insert into support_messages (tenant_id, thread_id, author_id, staff, body, created_at) values ($1,$2,$3,false,'Boa tarde, preciso de uma declaração de matrícula para o meu trabalho. Como solicito?', now() - interval '5 hours')`, [T, th1.id, ids.bruno]);
    const th2 = await one<{ id: string }>(`insert into support_threads (tenant_id, user_id, subject, status, created_at, last_message_at) values ($1,$2,'Dúvida sobre a data da prova','open', now() - interval '2 days', now() - interval '1 day') returning id`, [T, ids.carla]);
    await q(`insert into support_messages (tenant_id, thread_id, author_id, staff, body, created_at) values ($1,$2,$3,false,'A prova do módulo 1 será remarcada?', now() - interval '2 days'), ($1,$2,$4,true,'Não, a data está mantida. A prova foi aplicada e as notas já saíram.', now() - interval '1 day')`, [T, th2.id, ids.carla, ids.secretaria]);
    await q(
      `insert into notifications (tenant_id, user_id, kind, message, href, created_at) values
         ($1,$2,'grade','Sua nota da Prova do módulo 1 foi publicada.', null, now() - interval '4 days'),
         ($1,$2,'lesson','Aula de hoje: Estimativas e cronograma, às 19h.', null, now() - interval '1 hour')`,
      [T, ids.ana],
    );

    // ---- cobrança do mês da Bressane + instituição Aurora (suspensa, em atraso)
    const plan = await one<{ id: string }>(`select id from plans where active order by created_at limit 1`);
    await q(
      `insert into platform_invoices (tenant_id, period_start, period_end, courses, students, amount_cents, due_date)
       values ($1, date_trunc('month', now())::date, (date_trunc('month', now()) + interval '1 month - 1 day')::date, 2, 6, 60000, current_date + 8)`,
      [T],
    );
    const aurora = await one<{ id: string }>(`select id from tenants where slug = 'aurora'`);
    if (!aurora) {
      const a = await one<{ id: string }>(`insert into tenants (slug, name, plan_id, status, suspended_at, suspended_reason) values ('aurora', 'Faculdade Aurora', $1, 'suspended', now() - interval '3 days', 'Cobrança em atraso') returning id`, [plan.id]);
      await q(`insert into subscriptions (tenant_id, plan_id) values ($1,$2)`, [a.id, plan.id]);
      await q(`insert into tenant_labels (tenant_id, label_key, singular, plural) values ($1,'program','Pós-graduação','Pós-graduações'),($1,'cohort','Turma','Turmas'),($1,'module','Módulo','Módulos'),($1,'lesson','Aula','Aulas')`, [a.id]);
      await q(`insert into tenant_features (tenant_id, feature_key, enabled) select $1, key, false from features where kind = 'optional'`, [a.id]);
      await q(`select app.seed_document_types($1)`, [a.id]);
      await q(
        `insert into platform_invoices (tenant_id, period_start, period_end, courses, students, amount_cents, due_date)
         values ($1, date_trunc('month', now())::date, (date_trunc('month', now()) + interval '1 month - 1 day')::date, 3, 140, 102000, current_date - 6)`,
        [a.id],
      );
    }

    await db.query("commit");
  } catch (error) {
    await db.query("rollback").catch(() => {});
    throw error;
  } finally {
    await db.end();
    await pool.end();
  }

  console.log("Dados de demonstração criados na Bressane (e a Aurora para o master).");
  console.log("Logins (senha de MASTER_PASSWORD):");
  for (const k of Object.keys(PEOPLE) as Key[]) console.log(`  ${PEOPLE[k][2].padEnd(12)} ${PEOPLE[k][1]}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
