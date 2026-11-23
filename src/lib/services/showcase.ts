import { withContext } from "../db";

export type ShowcaseProgram = {
  id: string;
  name: string;
  summary: string;
  workload_hours: number | null;
  price_cents: number | null;
  payment_note: string;
  max_installments: number;
  open_cohorts: number;
  /** Duração em meses da próxima turma aberta (início ao fim), quando as datas existem. */
  months: number | null;
};

/** Turma aberta: situação aberta e hoje dentro do período de inscrição. */
export const OPEN_COHORT = `(co.status = 'open'
  and (co.enrollment_opens_on is null or co.enrollment_opens_on <= current_date)
  and (co.enrollment_closes_on is null or co.enrollment_closes_on >= current_date))`;

const MONTHS = `(select round(extract(epoch from age(co.ends_on, co.starts_on)) / 2629800)::int
                  from cohorts co where co.program_id = p.id and ${OPEN_COHORT} and co.starts_on is not null and co.ends_on is not null
                  order by co.starts_on limit 1)`;

/** Cursos publicados da instituição (dados públicos, sem login). */
export async function listShowcase(tenantId: string): Promise<ShowcaseProgram[]> {
  return withContext({ tenantId }, async (c) =>
    (await c.query<ShowcaseProgram>(
      `select p.id, p.name, p.summary, p.workload_hours, p.price_cents, p.payment_note, p.max_installments,
              (select count(*)::int from cohorts co where co.program_id = p.id and ${OPEN_COHORT}) as open_cohorts,
              ${MONTHS} as months
       from programs p where p.status = 'published' order by p.name`,
    )).rows,
  );
}

export type ShowcaseDetail = {
  program: ShowcaseProgram & { description: string };
  modules: { id: string; position: number; name: string; syllabus: string; workload_hours: number | null; teacher_name: string | null }[];
  cohorts: { id: string; name: string; starts_on: string | null; ends_on: string | null; enrollment_closes_on: string | null }[];
  documents: { id: string; name: string; required: boolean }[];
};

export async function getShowcaseProgram(tenantId: string, programId: string): Promise<ShowcaseDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(programId)) return null;
  return withContext({ tenantId }, async (c) => {
    const program = (
      await c.query<ShowcaseDetail["program"]>(
        `select p.id, p.name, p.summary, p.description, p.workload_hours, p.price_cents, p.payment_note, p.max_installments,
                0 as open_cohorts, ${MONTHS} as months
         from programs p where p.id = $1 and p.status = 'published'`,
        [programId],
      )
    ).rows[0];
    if (!program) return null;
    const modules = (
      await c.query<ShowcaseDetail["modules"][number]>(
        `select m.id, m.position, m.name, m.syllabus, m.workload_hours, u.name as teacher_name
         from program_modules m left join "user" u on u.id = m.default_teacher_id
         where m.program_id = $1 order by m.position`,
        [programId],
      )
    ).rows;
    const cohorts = (
      await c.query<ShowcaseDetail["cohorts"][number]>(
        `select co.id, co.name, co.starts_on::text, co.ends_on::text, co.enrollment_closes_on::text
         from cohorts co where co.program_id = $1 and ${OPEN_COHORT} order by co.starts_on nulls last, co.created_at`,
        [programId],
      )
    ).rows;
    const documents = (
      await c.query<ShowcaseDetail["documents"][number]>(
        "select id, name, required from document_types where active order by position, name",
      )
    ).rows;
    return { program, modules, cohorts, documents };
  });
}
