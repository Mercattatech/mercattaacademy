/**
 * Estimativa da cobrança da plataforma para uma instituição.
 * Regra (valores fictícios de 11/11/2026): por curso publicado, um valor fixo
 * que inclui N alunos ativos; cada aluno além disso custa um valor extra.
 */
export type Plan = { price_per_course_cents: number; included_students: number; extra_student_cents: number };
export type CourseUsage = { programId: string; name: string; activeStudents: number };
export type EstimateLine = CourseUsage & { extraStudents: number; amountCents: number };

export function estimateBilling(plan: Plan, courses: CourseUsage[]): { lines: EstimateLine[]; totalCents: number } {
  const lines = courses.map((course) => {
    const extraStudents = Math.max(0, course.activeStudents - plan.included_students);
    return {
      ...course,
      extraStudents,
      amountCents: plan.price_per_course_cents + extraStudents * plan.extra_student_cents,
    };
  });
  return { lines, totalCents: lines.reduce((sum, l) => sum + l.amountCents, 0) };
}

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
