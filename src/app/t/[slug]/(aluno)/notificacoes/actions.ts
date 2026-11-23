"use server";

import { revalidatePath } from "next/cache";
import { withContext } from "@/lib/db";
import { memberForAction } from "@/lib/guards";
import { markRead } from "@/lib/services/communication";

export async function markReadAction(slug: string, id: string | null) {
  const m = await memberForAction(slug);
  if ("error" in m) return;
  await withContext({ tenantId: m.tenant.id, userId: m.userId }, (c) => markRead(c, m.userId, id));
  revalidatePath(`/t/${slug}`, "layout");
}
