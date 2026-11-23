import { notFound } from "next/navigation";
import { Page } from "@/components/ui";
import { resolveTenant } from "@/lib/tenant";

/**
 * Base de toda página de instituição: resolve pelo subdomínio, aplica a cor da marca
 * e bloqueia instituição suspensa. A casca visual fica nos grupos:
 *   (site)  páginas públicas e área administrativa (cabeçalho e rodapé)
 *   (aluno) área do aluno (abas no rodapé do celular, barra lateral no computador)
 * O início (page.tsx) escolhe a casca conforme quem está vendo.
 */
export default async function TenantLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await resolveTenant(slug);
  if (!tenant) notFound();

  const brandStyle = tenant.brand.primary ? ({ "--color-brand": tenant.brand.primary } as React.CSSProperties) : undefined;

  if (tenant.status === "suspended") {
    return (
      <div style={brandStyle} data-theme="tenant">
        <Page>
          <h1 className="text-4xl font-bold tracking-tight">{tenant.name}</h1>
          <p className="mt-4 max-w-prose">
            O acesso a este ambiente está temporariamente suspenso. Fale com a secretaria da instituição para mais
            informações.
          </p>
        </Page>
      </div>
    );
  }

  return (
    <div style={brandStyle} data-theme="tenant" className="min-h-dvh">
      {children}
    </div>
  );
}
