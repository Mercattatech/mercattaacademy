import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { checkEnv, hasErrors } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Para monitoramento e para conferir a implantação. Não expõe detalhes. */
export async function GET() {
  let db = false;
  try {
    await pool.query("select 1");
    db = true;
  } catch {
    db = false;
  }
  const config = !hasErrors(checkEnv(process.env));
  const ok = db && config;
  return NextResponse.json({ status: ok ? "ok" : "falha", db, config }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
