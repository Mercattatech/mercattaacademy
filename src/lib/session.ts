import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "./auth";
import { pool } from "./db";

export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

/** Master da plataforma? Decidido sempre no servidor, pela tabela platform_admins. */
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const { rows } = await pool.query<{ ok: boolean }>("select app.is_platform_admin($1) as ok", [userId]);
  return rows[0]?.ok === true;
}
