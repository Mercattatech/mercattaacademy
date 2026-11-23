import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { dirname, join, resolve, sep } from "node:path";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Armazenamento privado de arquivos (documentos dos alunos).
 * Com S3_ENDPOINT definido usa S3 (MinIO na VPS); sem ele, grava em .storage/ (só desenvolvimento).
 * Não existe URL pública: o download passa pela rota que confere o perfil.
 */
export const MAX_FILE_BYTES = 4 * 1024 * 1024;

export type FileKind = { contentType: "application/pdf" | "image/jpeg" | "image/png"; ext: string };

/** Descobre o tipo pelo conteúdo, não pela extensão informada. */
export function sniffFile(bytes: Uint8Array): FileKind | null {
  const startsWith = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) return { contentType: "application/pdf", ext: "pdf" };
  if (startsWith([0xff, 0xd8, 0xff])) return { contentType: "image/jpeg", ext: "jpg" };
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { contentType: "image/png", ext: "png" };
  return null;
}

let s3: S3Client | null = null;
function client(): S3Client {
  s3 ??= new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? "", secretAccessKey: process.env.S3_SECRET_KEY ?? "" },
  });
  return s3;
}
const bucket = () => process.env.S3_BUCKET ?? "pos-saas";
const s3Enabled = () => Boolean(process.env.S3_ENDPOINT);

function localPath(key: string): string {
  const root = resolve(process.env.STORAGE_DIR ?? ".storage");
  const full = resolve(join(root, key));
  if (!full.startsWith(root + sep)) throw new Error("Chave de arquivo inválida");
  return full;
}

export async function putFile(key: string, body: Buffer, contentType: string): Promise<void> {
  if (s3Enabled()) {
    await client().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }));
    return;
  }
  const path = localPath(key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
}

export async function getFile(key: string): Promise<Buffer> {
  if (s3Enabled()) {
    const out = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    return Buffer.from(await out.Body!.transformToByteArray());
  }
  return readFile(localPath(key));
}

export async function deleteFile(key: string): Promise<void> {
  if (s3Enabled()) {
    await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
    return;
  }
  await rm(localPath(key), { force: true });
}

// ---------------------------------------------------------------- vídeos (arquivos grandes)
// O vídeo NÃO passa pelo servidor do app: o navegador envia direto ao S3/MinIO por um link
// assinado e temporário, e o aluno assiste por outro link assinado. Sem S3 (desenvolvimento),
// o app grava e serve da pasta .storage.

export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;
export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"] as const;

/** Endereço do S3 que o NAVEGADOR alcança. Por padrão é o mesmo do servidor (S3_ENDPOINT). */
const publicEndpoint = () => process.env.S3_PUBLIC_ENDPOINT || process.env.S3_ENDPOINT;

let signer: S3Client | null = null;
function signingClient(): S3Client {
  signer ??= new S3Client({
    endpoint: publicEndpoint(),
    region: process.env.S3_REGION ?? "us-east-1",
    forcePathStyle: true,
    // O navegador não calcula checksum: sem isto o link assinado exigiria um cabeçalho que ele não manda.
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? "", secretAccessKey: process.env.S3_SECRET_KEY ?? "" },
  });
  return signer;
}

export const usesObjectStorage = s3Enabled;

/** Link para o navegador enviar o arquivo (PUT). Null no modo local. */
export async function presignUpload(key: string, contentType: string, expiresInSeconds = 6 * 3600): Promise<string | null> {
  if (!s3Enabled()) return null;
  return getSignedUrl(signingClient(), new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }), { expiresIn: expiresInSeconds });
}

/** Link temporário para assistir (GET). Null no modo local. */
export async function presignDownload(key: string, contentType: string, expiresInSeconds = 3600): Promise<string | null> {
  if (!s3Enabled()) return null;
  return getSignedUrl(
    signingClient(),
    new GetObjectCommand({ Bucket: bucket(), Key: key, ResponseContentType: contentType, ResponseContentDisposition: "inline" }),
    { expiresIn: expiresInSeconds },
  );
}

/** Tamanho do arquivo guardado, ou null se não existe. */
export async function fileSize(key: string): Promise<number | null> {
  try {
    if (s3Enabled()) {
      const head = await client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
      return head.ContentLength ?? null;
    }
    return (await stat(localPath(key))).size;
  } catch {
    return null;
  }
}

/** Lê um trecho do arquivo (bytes start a end, inclusive), sem carregar tudo na memória. */
export async function readRange(key: string, start: number, end: number): Promise<ReadableStream<Uint8Array>> {
  if (s3Enabled()) {
    const out = await client().send(new GetObjectCommand({ Bucket: bucket(), Key: key, Range: `bytes=${start}-${end}` }));
    return out.Body!.transformToWebStream();
  }
  return Readable.toWeb(createReadStream(localPath(key), { start, end })) as ReadableStream<Uint8Array>;
}

/** Só modo local (desenvolvimento): grava o corpo da requisição direto em disco. */
export async function putStreamLocal(key: string, body: ReadableStream<Uint8Array>, maxBytes: number): Promise<number> {
  if (s3Enabled()) throw new Error("Envio local desligado: use o S3.");
  const path = localPath(key);
  await mkdir(dirname(path), { recursive: true });
  let total = 0;
  const limited = Readable.fromWeb(body as import("node:stream/web").ReadableStream).on("data", (chunk: Buffer) => {
    total += chunk.length;
    if (total > maxBytes) limited.destroy(new Error("Arquivo grande demais"));
  });
  await pipeline(limited, createWriteStream(path));
  return total;
}

/** Confere pelos primeiros bytes se é mesmo um vídeo MP4/MOV ou WebM. */
export function sniffVideo(head: Uint8Array): boolean {
  const mp4 = head.length >= 12 && String.fromCharCode(head[4], head[5], head[6], head[7]) === "ftyp";
  const webm = head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
  return mp4 || webm;
}
