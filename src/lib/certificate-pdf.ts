import { degrees, PDFDocument, rgb, StandardFonts, type PDFFont } from "pdf-lib";
import QRCode from "qrcode";
import { formatCode, type CertificateRow } from "./services/certificates";

const num = (n: string | number, digits: number) => Number(n).toFixed(digits).replace(".", ",");
const DATE = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });

function hexToRgb(hex: string | undefined) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  const n = parseInt(m ? m[1] : "7B4F72", 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

type Run = { text: string; font: PDFFont };

/** Quebra um parágrafo com trechos em fontes diferentes (ex.: nome do curso em negrito) em linhas que cabem na largura. */
function wrapRuns(runs: Run[], size: number, max: number): Run[][] {
  const words = runs.flatMap((r) => r.text.split(/(\s+)/).filter(Boolean).map((t) => ({ text: t, font: r.font })));
  const lines: Run[][] = [];
  let cur: Run[] = [];
  let width = 0;
  for (const w of words) {
    const space = /^\s+$/.test(w.text);
    const ww = w.font.widthOfTextAtSize(space ? " " : w.text, size);
    if (!space && width + ww > max && cur.length) {
      while (cur.length && /^\s+$/.test(cur[cur.length - 1].text)) cur.pop();
      lines.push(cur);
      cur = [];
      width = 0;
    }
    if (space && cur.length === 0) continue;
    cur.push(space ? { text: " ", font: w.font } : w);
    width += ww;
  }
  if (cur.length) lines.push(cur);
  return lines;
}

/**
 * Certificado em A4 paisagem (protótipo, aba Certificado):
 * moldura fina, faixa vertical na cor da instituição, texto alinhado à esquerda,
 * QR code e código de conferência embaixo à esquerda e assinatura à direita.
 * Anulado: carimbo "ANULADO" em vermelho claro por cima.
 */
export async function buildCertificatePdf(
  c: CertificateRow,
  institution: string,
  verifyUrl: string,
  brandHex?: string,
  /** Tipo de curso para o cabeçalho (ex.: "Pós-graduação"). */
  kind = "Pós-graduação",
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Certificado ${c.student_name}`);
  pdf.setAuthor(institution);
  const W = 842;
  const H = 595;
  const page = pdf.addPage([W, H]);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const ink = rgb(0.086, 0.09, 0.102); // #16171A
  const muted = rgb(0.294, 0.306, 0.333); // #4B4E55
  const subtle = rgb(0.412, 0.427, 0.459); // #696D75
  const lineC = rgb(0.788, 0.792, 0.776); // #C9CAC6
  const accent = hexToRgb(brandHex);

  // Moldura e faixa lateral (medidas do protótipo em proporção da largura).
  const inset = 27;
  page.drawRectangle({ x: inset, y: inset, width: W - inset * 2, height: H - inset * 2, borderColor: lineC, borderWidth: 0.75 });
  page.drawRectangle({ x: inset, y: inset, width: 6, height: H - inset * 2, color: accent });

  const left = inset + 6 + 47;
  const right = W - inset - 47;
  const top = H - inset - 30;
  const bottom = inset + 28;

  // Cabeçalho: instituição à esquerda, tipo de certificado à direita.
  const instSize = bold.widthOfTextAtSize(institution, 22) > 380 ? 17 : 22;
  page.drawText(institution, { x: left, y: top - instSize, size: instSize, font: bold, color: accent });
  const spaced = (t: string) => t.toUpperCase().split("").join(" ");
  const h1 = spaced("Certificado de conclusão");
  const h2 = spaced(kind);
  page.drawText(h1, { x: right - bold.widthOfTextAtSize(h1, 8), y: top - 10, size: 8, font: bold, color: muted });
  page.drawText(h2, { x: right - bold.widthOfTextAtSize(h2, 8), y: top - 24, size: 8, font: bold, color: muted });

  // Corpo, centralizado na vertical entre o cabeçalho e o rodapé.
  const nameSize = bold.widthOfTextAtSize(c.student_name, 37) > right - left ? 28 : 37;
  const runs: Run[] = [
    { text: "concluiu com aproveitamento o curso ", font: sans },
    { text: c.program_name, font: bold },
    // Nomes de turma costumam já começar com "Turma"; não repete a palavra.
    { text: ` (${/^turma\b/i.test(c.cohort_name) ? c.cohort_name.replace(/^turma/i, "turma") : `turma ${c.cohort_name}`}${c.period_text ? `, ${c.period_text}` : ""})`, font: sans },
    { text: c.workload_hours ? `, com carga horária de ${c.workload_hours} horas.` : ".", font: sans },
  ];
  const bodySize = 13;
  const lines = wrapRuns(runs, bodySize, 522);
  const blockH = 13 + 12 + nameSize + 12 + lines.length * 20 + 14 + 10;
  const mid = (top - 40 + bottom + 80) / 2;
  let y = mid + blockH / 2;

  y -= 13;
  page.drawText("Certificamos que", { x: left, y, size: 12.5, font: sans, color: muted });
  y -= 12 + nameSize * 0.8;
  page.drawText(c.student_name, { x: left, y, size: nameSize, font: bold, color: ink });
  y -= 14;
  for (const ln of lines) {
    y -= 18;
    let x = left;
    for (const r of ln) {
      page.drawText(r.text, { x, y, size: bodySize, font: r.font, color: ink });
      x += r.font.widthOfTextAtSize(r.text, bodySize);
    }
  }
  y -= 26;
  const stats: [string, string][] = [
    ["Média final", num(c.final_grade, 1)],
    ["Frequência", `${num(c.frequency_percent, 0)}%`],
    ["Emitido em", DATE.format(c.issued_at)],
  ];
  let sx = left;
  for (const [k, v] of stats) {
    page.drawText(`${k} `, { x: sx, y, size: 10, font: sans, color: muted });
    sx += sans.widthOfTextAtSize(`${k} `, 10);
    page.drawText(v, { x: sx, y, size: 10, font: bold, color: ink });
    sx += bold.widthOfTextAtSize(v, 10) + 22;
  }

  // Rodapé esquerdo: QR code e código de conferência.
  const qrSize = 67;
  const qr = await pdf.embedPng(await QRCode.toBuffer(verifyUrl, { margin: 1, width: 240, errorCorrectionLevel: "M" }));
  page.drawImage(qr, { x: left, y: bottom, width: qrSize, height: qrSize });
  const tx = left + qrSize + 13;
  page.drawText("Confira a autenticidade", { x: tx, y: bottom + 30, size: 8, font: sans, color: muted });
  page.drawText(formatCode(c.code), { x: tx, y: bottom + 15, size: 10.5, font: mono, color: ink });
  const short = verifyUrl.replace(/^https?:\/\//, "").replace(/\/[^/]*$/, "");
  page.drawText(short.length > 48 ? `${short.slice(0, 45)}...` : short, { x: tx, y: bottom + 2, size: 7.5, font: sans, color: subtle });

  // Rodapé direito: assinatura (nome e cargo vêm das configurações do certificado).
  if (c.signer_name) {
    const sw = 168;
    const sxr = right - sw;
    const lineY = bottom + 30;
    page.drawLine({ start: { x: sxr, y: lineY }, end: { x: right, y: lineY }, thickness: 0.7, color: ink });
    const centerIn = (t: string, f: PDFFont, s: number, yy: number, color = ink) =>
      page.drawText(t, { x: sxr + (sw - f.widthOfTextAtSize(t, s)) / 2, y: yy, size: s, font: f, color });
    centerIn(c.signer_name, bold, 10, lineY - 15);
    if (c.signer_title) centerIn(c.signer_title, sans, 8.5, lineY - 27, muted);
  }

  if (c.footer_text) {
    const t = c.footer_text.slice(0, 160);
    page.drawText(t, { x: (W - sans.widthOfTextAtSize(t, 7)) / 2, y: inset + 8, size: 7, font: sans, color: subtle });
  }

  if (c.revoked_at) {
    const s = 92;
    const word = "ANULADO";
    const tw = bold.widthOfTextAtSize(word, s);
    const a = (18 * Math.PI) / 180;
    // Centro do texto girado no centro da página.
    const x0 = W / 2 - (Math.cos(a) * tw) / 2 + (Math.sin(a) * s * 0.35);
    const y0 = H / 2 - (Math.sin(a) * tw) / 2 - (Math.cos(a) * s * 0.35);
    page.drawText(word, { x: x0, y: y0, size: s, font: bold, color: rgb(0.706, 0.137, 0.094), opacity: 0.2, rotate: degrees(18) });
  }
  return pdf.save();
}
