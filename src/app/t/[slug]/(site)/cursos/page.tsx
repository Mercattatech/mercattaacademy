import { notFound } from "next/navigation";
import { Vitrine, VitrineHero } from "@/components/vitrine";
import { listShowcase } from "@/lib/services/showcase";
import { getLabels, resolveTenant } from "@/lib/tenant";

/** Mesma vitrine do início da instituição, em endereço próprio. */
export default async function ShowcasePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await resolveTenant(slug);
  if (!tenant) notFound();
  const [labels, programs] = await Promise.all([getLabels(tenant.id), listShowcase(tenant.id)]);
  return (
    <>
      <VitrineHero tenantName={tenant.name} labels={labels} />
      <Vitrine slug={slug} labels={labels} programs={programs} />
    </>
  );
}
