import { NextResponse, type NextRequest } from "next/server";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Usado só pelo Caddy na VPS (certificado HTTPS sob demanda): antes de pedir um
 * certificado para um endereço, ele pergunta aqui se o endereço é nosso.
 * Responde 200 para o domínio raiz, para arquivos.ROOT_DOMAIN (MinIO) e para <slug>.ROOT_DOMAIN de instituição existente.
 */
export async function GET(request: NextRequest) {
  const domain = (request.nextUrl.searchParams.get("domain") ?? "").toLowerCase();
  const root = (process.env.ROOT_DOMAIN ?? "").toLowerCase().split(":")[0];
  if (!domain || !root) return new NextResponse(null, { status: 404 });
  if (domain === root || domain === `www.${root}` || domain === `arquivos.${root}`) return new NextResponse(null, { status: 200 });
  if (!domain.endsWith(`.${root}`)) return new NextResponse(null, { status: 404 });
  const slug = domain.slice(0, -(root.length + 1));
  if (!slug || slug.includes(".")) return new NextResponse(null, { status: 404 });
  try {
    const { rows } = await pool.query("select 1 from app.resolve_tenant($1)", [slug]);
    return new NextResponse(null, { status: rows.length ? 200 : 404 });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
