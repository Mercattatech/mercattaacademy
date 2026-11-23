import { NextResponse } from "next/server";
import { pool, withContext } from "@/lib/db";
import { buildIcs } from "@/lib/ics";
import { agendaForUser } from "@/lib/services/lessons";
import { resolveTenant } from "@/lib/tenant";
import { tenantUrl } from "@/lib/urls";

/** Calendário .ics pessoal. O endereço secreto (token) é a credencial; serve para baixar ou assinar no Google Agenda. */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const tenant = await resolveTenant(slug);
  const owner = (await pool.query<{ tenant_id: string; user_id: string }>("select * from app.calendar_owner($1)", [token])).rows[0];
  if (!tenant || !owner || owner.tenant_id !== tenant.id) return new NextResponse("Não encontrado", { status: 404 });

  const modulo = new URL(request.url).searchParams.get("modulo");
  const moduleId = modulo && /^[0-9a-f-]{36}$/i.test(modulo) ? modulo : null;
  const items = await withContext({ tenantId: tenant.id, userId: owner.user_id }, (c) => agendaForUser(c, owner.user_id, moduleId));
  const ics = buildIcs(
    `${tenant.name}: aulas`,
    items.map((l) => ({
      uid: `${l.id}@${slug}`,
      title: `${l.title} (${l.module_name})`,
      start: l.starts_at,
      end: new Date(l.starts_at.getTime() + l.duration_minutes * 60_000),
      description: `${l.program_name}, ${l.cohort_name}${l.teacher_name ? `. Professor: ${l.teacher_name}` : ""}`,
      url: tenantUrl(slug, `/aula/${l.id}`),
      canceled: l.status === "canceled",
    })),
  );
  return new NextResponse(ics, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="aulas.ics"', "Cache-Control": "private, max-age=300" },
  });
}
