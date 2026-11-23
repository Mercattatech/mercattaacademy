/**
 * Lê a planilha de alunos (CSV) com as colunas nome e e-mail.
 * Aceita vírgula ou ponto e vírgula (Excel em português salva com ponto e vírgula),
 * cabeçalho opcional, aspas e BOM. Linhas inválidas viram erros sem barrar as válidas.
 */
export type StudentRow = { line: number; name: string; email: string };
export type CsvIssue = { line: number; message: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const CSV_MAX_ROWS = 2000;

export function parseStudentsCsv(input: string): { rows: StudentRow[]; issues: CsvIssue[] } {
  const text = input.replace(/^﻿/, "");
  const lines = text.split(/\r?\n/);
  const delimiter = detectDelimiter(lines.find((l) => l.trim()) ?? "");
  const rows: StudentRow[] = [];
  const issues: CsvIssue[] = [];
  const seen = new Set<string>();
  let nameIdx = 0;
  let emailIdx = 1;
  let started = false;

  lines.forEach((raw, i) => {
    const line = i + 1;
    if (!raw.trim()) return;
    const cells = splitLine(raw, delimiter).map((c) => c.trim());

    if (!started) {
      started = true;
      const lower = cells.map((c) => c.toLowerCase());
      const e = lower.findIndex((c) => c === "email" || c === "e-mail");
      const n = lower.findIndex((c) => c === "nome" || c === "name" || c === "nome completo");
      if (e >= 0) {
        emailIdx = e;
        nameIdx = n >= 0 ? n : e === 0 ? 1 : 0;
        return; // era o cabeçalho
      }
      // Sem cabeçalho: descobre qual coluna parece e-mail
      if (EMAIL.test(cells[0] ?? "") && !EMAIL.test(cells[1] ?? "")) {
        emailIdx = 0;
        nameIdx = 1;
      }
    }

    const name = cells[nameIdx] ?? "";
    const email = (cells[emailIdx] ?? "").toLowerCase();
    if (!EMAIL.test(email)) {
      issues.push({ line, message: email ? `E-mail inválido: ${email}` : "E-mail em branco" });
      return;
    }
    if (name.length < 2) {
      issues.push({ line, message: `Nome em branco para ${email}` });
      return;
    }
    if (seen.has(email)) {
      issues.push({ line, message: `E-mail repetido na planilha: ${email}` });
      return;
    }
    if (rows.length >= CSV_MAX_ROWS) {
      issues.push({ line, message: `Limite de ${CSV_MAX_ROWS} alunos por planilha` });
      return;
    }
    seen.add(email);
    rows.push({ line, name, email });
  });

  return { rows, issues };
}

function detectDelimiter(firstLine: string): string {
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return semicolons > commas ? ";" : ",";
}

function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === delimiter && !quoted) {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}
