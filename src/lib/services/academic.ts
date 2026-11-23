import type { PoolClient } from "pg";

/** Regras de cursos, grade e turmas. Todas rodam com o contexto da instituição. */

export async function addModule(
  c: PoolClient,
  input: { tenantId: string; programId: string; name: string; syllabus?: string; workloadHours?: number | null; defaultTeacherId?: string | null },
) {
  const { rows } = await c.query<{ next: number }>(
    "select coalesce(max(position), 0) + 1 as next from program_modules where program_id = $1",
    [input.programId],
  );
  const { rows: created } = await c.query<{ id: string }>(
    `insert into program_modules (tenant_id, program_id, position, name, syllabus, workload_hours, default_teacher_id)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [input.tenantId, input.programId, rows[0].next, input.name, input.syllabus ?? "", input.workloadHours ?? null, input.defaultTeacherId ?? null],
  );
  return created[0].id;
}

/** Troca o módulo de lugar com o vizinho (para cima ou para baixo). */
export async function moveModule(c: PoolClient, moduleId: string, direction: "up" | "down") {
  const { rows } = await c.query<{ program_id: string; position: number }>(
    "select program_id, position from program_modules where id = $1",
    [moduleId],
  );
  const current = rows[0];
  if (!current) throw new Error("Módulo não encontrado.");
  const neighbor = (
    await c.query<{ id: string; position: number }>(
      direction === "up"
        ? "select id, position from program_modules where program_id = $1 and position < $2 order by position desc limit 1"
        : "select id, position from program_modules where program_id = $1 and position > $2 order by position asc limit 1",
      [current.program_id, current.position],
    )
  ).rows[0];
  if (!neighbor) return false;
  await c.query("update program_modules set position = $2 where id = $1", [moduleId, neighbor.position]);
  await c.query("update program_modules set position = $2 where id = $1", [neighbor.id, current.position]);
  return true;
}

/** Exclui o módulo da grade e renumera os seguintes. Turmas já abertas não mudam. */
export async function deleteModule(c: PoolClient, moduleId: string) {
  const { rows } = await c.query<{ program_id: string; position: number }>(
    "delete from program_modules where id = $1 returning program_id, position",
    [moduleId],
  );
  if (!rows[0]) return;
  await c.query("update program_modules set position = position - 1 where program_id = $1 and position > $2", [
    rows[0].program_id,
    rows[0].position,
  ]);
}

/** Abre uma turma copiando a grade atual do curso. */
export async function createCohortFromProgram(
  c: PoolClient,
  input: { tenantId: string; programId: string; name: string; startsOn?: string | null; endsOn?: string | null },
) {
  const { rows } = await c.query<{ id: string }>(
    `insert into cohorts (tenant_id, program_id, name, starts_on, ends_on) values ($1, $2, $3, $4, $5) returning id`,
    [input.tenantId, input.programId, input.name, input.startsOn || null, input.endsOn || null],
  );
  const cohortId = rows[0].id;
  await c.query(
    `insert into cohort_modules (tenant_id, cohort_id, program_module_id, position, name, syllabus, workload_hours, teacher_id)
     select tenant_id, $2, id, position, name, syllabus, workload_hours, default_teacher_id
     from program_modules where program_id = $1 order by position`,
    [input.programId, cohortId],
  );
  return cohortId;
}

/** Contagem por curso publicado, usada na estimativa de cobrança. */
export async function courseUsage(c: PoolClient) {
  const { rows } = await c.query<{ programId: string; name: string; activeStudents: number }>(
    `select p.id as "programId", p.name,
            (select count(distinct e.user_id)::int from enrollments e join cohorts co on co.id = e.cohort_id
              where co.program_id = p.id and e.status = 'active') as "activeStudents"
     from programs p where p.status = 'published' order by p.name`,
  );
  return rows;
}
