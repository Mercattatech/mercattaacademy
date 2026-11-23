/**
 * Teste de fumaça depois de implantar:
 *   npm run smoke -- https://bressane.seudominio.com.br
 * Confere health e as páginas públicas principais.
 */
const base = (process.argv[2] ?? "").replace(/\/$/, "");
if (!base) {
  console.error("Uso: npm run smoke -- https://bressane.seudominio.com.br");
  process.exit(1);
}
const checks: [string, string, number][] = [
  ["Health", "/api/health", 200],
  ["Vitrine", "/", 200],
  ["Cursos", "/cursos", 200],
  ["Login", "/login", 200],
  ["Privacidade", "/privacidade", 200],
  ["Página inexistente dá 404", "/isto-nao-existe", 404],
  ["Agenda sem token dá 404", "/agenda/invalido", 404],
];
let failed = 0;
for (const [name, path, expected] of checks) {
  try {
    const r = await fetch(base + path, { redirect: "manual" });
    const ok = r.status === expected;
    if (!ok) failed++;
    console.log(`${ok ? "OK   " : "FALHA"} ${name} (${path}): ${r.status}${ok ? "" : `, esperado ${expected}`}`);
  } catch (e) {
    failed++;
    console.log(`FALHA ${name} (${path}): ${(e as Error).message}`);
  }
}
const h = await fetch(base + "/").catch(() => null);
for (const header of ["x-content-type-options", "x-frame-options", "permissions-policy"]) {
  const ok = !!h?.headers.get(header);
  if (!ok) failed++;
  console.log(`${ok ? "OK   " : "FALHA"} Cabeçalho ${header}`);
}
process.exit(failed ? 1 : 0);

export {};
