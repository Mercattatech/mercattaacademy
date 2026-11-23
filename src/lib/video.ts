import { createHmac } from "node:crypto";
import { safeEqual } from "./crypto";

/**
 * Interface de videoconferência. O adaptador atual é o Daily (sala privada, gravação na nuvem,
 * chat e compartilhamento de tela). Trocar de provedor mexe só neste arquivo.
 * DAILY_BASE_URL permite apontar para um simulador (testes locais).
 */
export class VideoNotConfigured extends Error {
  constructor() {
    super("Videoconferência não configurada (DAILY_API_KEY).");
  }
}
export class VideoError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const base = () => process.env.DAILY_BASE_URL ?? "https://api.daily.co/v1";

async function daily<T>(method: "GET" | "POST" | "DELETE", path: string, body?: object): Promise<T> {
  const key = process.env.DAILY_API_KEY;
  if (!key) throw new VideoNotConfigured();
  const res = await fetch(`${base()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) throw new VideoError(String(json.info ?? json.error ?? `Daily respondeu ${res.status}`), res.status);
  return json as T;
}

export const roomNameFor = (lessonId: string) => `aula-${lessonId}`;

/** Cria a sala privada da aula (ou devolve o endereço da que já existe). */
export async function ensureRoom(name: string, expiresAt: Date): Promise<{ url: string }> {
  try {
    const room = await daily<{ url: string }>("POST", "/rooms", {
      name,
      privacy: "private",
      properties: {
        exp: Math.floor(expiresAt.getTime() / 1000),
        enable_recording: "cloud",
        enable_chat: true,
        enable_screenshare: true,
        eject_at_room_exp: true,
        enable_prejoin_ui: true,
      },
    });
    return { url: room.url };
  } catch (error) {
    if (error instanceof VideoError && /already exists/i.test(error.message)) {
      return { url: (await daily<{ url: string }>("GET", `/rooms/${name}`)).url };
    }
    throw error;
  }
}

/** Entrada pessoal na sala. O professor entra como dono e inicia a gravação na nuvem. */
export async function createJoinUrl(input: { roomUrl: string; room: string; userId: string; userName: string; owner: boolean; expiresAt: Date }): Promise<string> {
  const out = await daily<{ token: string }>("POST", "/meeting-tokens", {
    properties: {
      room_name: input.room,
      user_id: input.userId,
      user_name: input.userName,
      is_owner: input.owner,
      exp: Math.floor(input.expiresAt.getTime() / 1000),
      eject_at_token_exp: true,
      enable_screenshare: input.owner,
      ...(input.owner ? { start_cloud_recording: true, enable_recording: "cloud" } : {}),
    },
  });
  return `${input.roomUrl}?t=${out.token}`;
}

/** Encerra a aula para todos (apaga a sala; a gravação continua no provedor). */
export async function endRoom(name: string): Promise<void> {
  try {
    await daily("DELETE", `/rooms/${name}`);
  } catch (error) {
    if (!(error instanceof VideoError && error.status === 404)) throw error;
  }
}

/** Link curto e assinado da gravação, gerado na hora de assistir. */
export async function recordingLink(recordingId: string): Promise<string> {
  return (await daily<{ download_link: string }>("GET", `/recordings/${recordingId}/access-link?valid_for_secs=3600`)).download_link;
}

/** Confere a assinatura do webhook: HMAC-SHA256 de "timestamp.corpo", segredo em base64. */
export function verifyWebhook(rawBody: string, signature: string | null, timestamp: string | null): boolean {
  const secret = process.env.DAILY_WEBHOOK_SECRET;
  if (!secret || !signature || !timestamp) return false;
  const expected = createHmac("sha256", Buffer.from(secret, "base64")).update(`${timestamp}.${rawBody}`).digest("base64");
  return safeEqual(expected, signature);
}
