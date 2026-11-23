/** Endereço público da instituição: https://<slug>.<ROOT_DOMAIN><path> (http em localhost). */
export function tenantUrl(slug: string, path = "/"): string {
  const root = process.env.ROOT_DOMAIN ?? "localhost:3000";
  const protocol = root.startsWith("localhost") ? "http" : "https";
  return `${protocol}://${slug}.${root}${path}`;
}

/** Caminho interno das páginas da instituição (funciona no domínio raiz e no subdomínio). */
export function tenantPath(slug: string, path = ""): string {
  return `/t/${slug}${path}`;
}
