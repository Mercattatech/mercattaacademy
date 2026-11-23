import { headers } from "next/headers";
import { resolveTenant, type PublicTenant } from "./tenant";

const RESERVED = new Set(["www", "app", "master", "api", "arquivos"]);

/**
 * Instituição de onde a pessoa veio, para as telas de acesso mostrarem o logo e a cor dela:
 * pelo endereço de volta (/t/<slug>/...) ou pelo subdomínio (bressane.dominio/login).
 * Sem instituição, as telas usam a marca da plataforma.
 */
export async function getAuthTenant(voltar?: string | null): Promise<PublicTenant | null> {
  let slug = voltar ? /^\/t\/([a-z0-9-]+)/.exec(voltar)?.[1] : undefined;
  if (!slug) {
    const root = (process.env.ROOT_DOMAIN ?? "localhost:3000").toLowerCase();
    const host = ((await headers()).get("host") ?? "").toLowerCase();
    const sub = host.endsWith(`.${root}`) ? host.slice(0, -(root.length + 1)) : "";
    if (sub && !sub.includes(".") && !RESERVED.has(sub)) slug = sub;
  }
  if (!slug) return null;
  const tenant = await resolveTenant(slug);
  return tenant && tenant.status === "active" ? tenant : null;
}
