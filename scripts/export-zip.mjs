/**
 * Gera o pacote .zip do projeto para instalar numa VPS ou na Vercel:
 *   npm run export:zip
 * Saída: dist/plataforma-de-cursos-AAAAMMDD-HHMM.zip
 *
 * Fica de fora tudo que é local, gerado ou secreto: node_modules, .next, .env (senhas),
 * .storage (arquivos de teste), .git, testes de navegador e o próprio dist.
 * Não usa dependências: monta o zip com o zlib do Node 22.2 ou mais novo.
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { deflateRawSync, crc32 } from "node:zlib";

const root = process.cwd();
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".storage", ".playwright-mcp", ".vercel", "dist", "coverage", "out"]);
const SKIP_FILES = new Set(["tsconfig.tsbuildinfo", "next-env.d.ts", ".DS_Store"]);
// Arquivos de ambiente com segredo ficam de fora; os exemplos entram.
const isSecretEnv = (name) => /^\.env(\..+)?$/.test(name) && !name.endsWith(".example");

if (typeof crc32 !== "function") {
  console.error("Use Node.js 22.2 ou mais novo para gerar o pacote.");
  process.exit(1);
}

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full);
    } else if (entry.isFile() && !SKIP_FILES.has(entry.name) && !isSecretEnv(entry.name)) {
      files.push(full);
    }
  }
})(root);

const pad = (n) => String(n).padStart(2, "0");
const now = new Date();
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
const outDir = join(root, "dist");
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, `plataforma-de-cursos-${stamp}.zip`);

const dosTime = (d) => ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
const dosDate = (d) => (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;

const parts = [];
const central = [];
let offset = 0;
const prefix = "plataforma-de-cursos/";

for (const file of files.sort()) {
  const name = prefix + relative(root, file).split(sep).join("/");
  const nameBuf = Buffer.from(name, "utf8");
  const data = readFileSync(file);
  const packed = deflateRawSync(data, { level: 9 });
  const useDeflate = packed.length < data.length;
  const body = useDeflate ? packed : data;
  const method = useDeflate ? 8 : 0;
  const mtime = statSync(file).mtime;
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6); // nomes em UTF-8
  local.writeUInt16LE(method, 8);
  local.writeUInt16LE(dosTime(mtime), 10);
  local.writeUInt16LE(dosDate(mtime), 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);
  parts.push(local, nameBuf, body);

  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02014b50, 0);
  entry.writeUInt16LE(0x031e, 4); // criado em Unix, para manter permissões
  entry.writeUInt16LE(20, 6);
  entry.writeUInt16LE(0x0800, 8);
  entry.writeUInt16LE(method, 10);
  entry.writeUInt16LE(dosTime(mtime), 12);
  entry.writeUInt16LE(dosDate(mtime), 14);
  entry.writeUInt32LE(crc, 16);
  entry.writeUInt32LE(body.length, 20);
  entry.writeUInt32LE(data.length, 24);
  entry.writeUInt16LE(nameBuf.length, 28);
  const exec = file.endsWith(".sh") ? 0o755 : 0o644;
  entry.writeUInt32LE(((0o100000 | exec) << 16) >>> 0, 38);
  entry.writeUInt32LE(offset, 42);
  central.push(entry, nameBuf);

  offset += local.length + nameBuf.length + body.length;
}

const centralBuf = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralBuf.length, 12);
end.writeUInt32LE(offset, 16);

writeFileSync(outFile, Buffer.concat([...parts, centralBuf, end]));
const mb = (statSync(outFile).size / 1024 / 1024).toFixed(2).replace(".", ",");
console.log(`Pacote gerado: ${relative(root, outFile)} (${files.length} arquivos, ${mb} MB)`);
console.log("Dentro dele, leia INSTALAR.md.");
