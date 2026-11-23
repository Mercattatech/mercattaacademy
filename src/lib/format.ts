/** Formatação de datas "dia" (AAAA-MM-DD) sem conversão de fuso. */
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function formatDay(day: string | null | undefined): string {
  if (!day) return "";
  const [y, m, d] = day.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function formatMonth(day: string | null | undefined): string {
  if (!day) return "";
  const [y, m] = day.slice(0, 10).split("-");
  return `${MONTHS.at(Number(m) - 1)} de ${y}`;
}

const TZ = "America/Sao_Paulo";

/** Data e hora no horário de Brasília: "sex., 20/11/2026 às 19:00". */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const day = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
  return `${day} às ${time}`;
}

/** Valor para <input type="datetime-local"> no horário de Brasília. */
export function toLocalInput(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const p = Object.fromEntries(new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export function formatDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`;
}

/** Número em pt-BR com vírgula: formatNumber(7.5, 1) -> "7,5". */
export function formatNumber(n: number | string, digits = 1): string {
  return Number(n).toFixed(digits).replace(".", ",");
}
/** Lê nota digitada com vírgula ou ponto. Vazio vira null; texto inválido vira NaN. */
export function parseScore(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (t === "") return null;
  return /^\d+(\.\d{1,2})?$/.test(t) ? Number(t) : NaN;
}
/** Número sem zeros sobrando: 10 -> "10", 7.5 -> "7,5". */
export function trimNumber(n: number | string): string {
  return String(Number(n)).replace(".", ",");
}

/* Datas curtas da área do aluno (protótipo): "Hoje, 19h30", "sáb, 22 nov", "ontem". */

const dayKeyOf = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(d);
const daysBetween = (a: Date, b: Date) => Math.round((Date.parse(dayKeyOf(a)) - Date.parse(dayKeyOf(b))) / 86_400_000);

/** "19h30" ou "8h" no horário de Brasília. */
export function hourText(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const p = Object.fromEntries(new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "numeric", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${Number(p.hour)}h${p.minute === "00" ? "" : p.minute}`;
}

/** "22 nov" (com o ano quando não é o atual). */
export function shortDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const sameYear = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, year: "numeric" }).format(d) === new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, year: "numeric" }).format(new Date());
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) }).format(d).replaceAll(".", "").replace(/ de /g, " ");
}

/** "sáb, 22 nov". */
export function weekdayDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const wd = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "short" }).format(d).replace(".", "");
  return `${wd}, ${shortDate(d)}`;
}

/** "Hoje, 19h30", "Amanhã, 8h" ou "Sáb, 22 nov, 8h". */
export function whenText(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = daysBetween(d, new Date());
  const day = diff === 0 ? "Hoje" : diff === 1 ? "Amanhã" : weekdayDate(d).replace(/^./, (c) => c.toUpperCase());
  return `${day}, ${hourText(d)}`;
}

/** Quanto tempo atrás: "agora", "hoje", "ontem", "3 dias" ou "21 out". */
export function agoText(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = daysBetween(new Date(), d);
  if (diff <= 0) return Date.now() - d.getTime() < 3_600_000 ? "agora" : `hoje, ${hourText(d)}`;
  if (diff === 1) return "ontem";
  if (diff < 7) return `${diff} dias`;
  return shortDate(d);
}

/** O dia é hoje (Brasília)? */
export function isToday(date: Date | string): boolean {
  const d = typeof date === "string" ? new Date(date) : date;
  return dayKeyOf(d) === dayKeyOf(new Date());
}

/** "AAAA-MM-DD" (coluna date) para Date ao meio-dia, sem virar o dia por causa do fuso. */
export function dayToDate(day: string): Date {
  return new Date(`${day.slice(0, 10)}T12:00:00-03:00`);
}

/** Para frases do tipo "enviado ...": agora, hoje às 19h, ontem, há 3 dias, em 22 nov. */
export function sinceText(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = daysBetween(new Date(), d);
  if (diff <= 0) return Date.now() - d.getTime() < 3_600_000 ? "agora" : `hoje às ${hourText(d)}`;
  if (diff === 1) return "ontem";
  if (diff < 7) return `há ${diff} dias`;
  return `em ${shortDate(d)}`;
}
