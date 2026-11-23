"use server";

import { withContext } from "@/lib/db";
import { memberForAction } from "@/lib/guards";
import { saveProgress } from "@/lib/services/videos";

const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n >= 0 && n < 1e7 ? n : 0);

/** Guarda onde o aluno parou e se já assistiu. Chamada de tempos em tempos pelo player. */
export async function saveVideoProgressAction(slug: string, videoId: string, position: number, duration: number, ended: boolean): Promise<{ completed: boolean } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(videoId)) return null;
  const m = await memberForAction(slug);
  if ("error" in m) return null;
  return withContext({ tenantId: m.tenant.id, userId: m.userId }, (c) =>
    saveProgress(c, { tenantId: m.tenant.id, userId: m.userId, videoId, position: num(position), duration: num(duration), ended: ended === true }),
  );
}
