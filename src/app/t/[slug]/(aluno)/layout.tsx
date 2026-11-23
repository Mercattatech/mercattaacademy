import { StudentShell } from "../_shell/shells";
import { loadStudent } from "../_shell/student-context";

/** Área do aluno: exige login e perfil na instituição. */
export default async function StudentLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await loadStudent(slug, `/t/${slug}`);
  return (
    <StudentShell slug={slug} ctx={ctx}>
      {children}
    </StudentShell>
  );
}
