import { notFound } from "next/navigation";
import { Page } from "@/components/ui";
import { resolveTenant } from "@/lib/tenant";

export const metadata = { title: "Privacidade" };

/** Modelo de aviso de privacidade. A revisão jurídica é da instituição. */
export default async function PrivacyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await resolveTenant(slug);
  if (!tenant) notFound();
  return (
    <Page>
      <h1 className="text-4xl font-bold tracking-tight">Privacidade</h1>
      <div className="mt-4 grid max-w-prose gap-4 leading-relaxed">
        <p>A {tenant.name} usa esta plataforma para matrícula, aulas, notas e certificados. Aqui está, em poucas linhas, como seus dados são tratados.</p>
        <h2 className="text-xl font-semibold">O que guardamos</h2>
        <p>Nome, e-mail, CPF (informado só para gerar a cobrança, não fica guardado aqui), documentos enviados para a matrícula, pagamentos, presenças, notas, certificados, comentários e conversas com a secretaria.</p>
        <h2 className="text-xl font-semibold">Para que usamos</h2>
        <p>Para fazer sua matrícula, liberar o acesso, registrar sua frequência e notas, emitir seu certificado e falar com você. Não vendemos seus dados.</p>
        <h2 className="text-xl font-semibold">Quem recebe</h2>
        <p>A instituição é a responsável pelos dados. A plataforma opera a plataforma. Para funcionar, usamos serviços de pagamento (Asaas), videoconferência (Daily), e-mail (Resend) e hospedagem.</p>
        <h2 className="text-xl font-semibold">Seus direitos</h2>
        <p>Você pode baixar seus dados e pedir a exclusão em <a className="text-brand underline" href={`/t/${slug}/meus-dados`}>Meus dados</a>. Certificados, pagamentos e registros de auditoria podem ter guarda obrigatória por lei.</p>
        <h2 className="text-xl font-semibold">Dúvidas</h2>
        <p>Fale com a secretaria pelo <a className="text-brand underline" href={`/t/${slug}/atendimento`}>Atendimento</a>.</p>
      </div>
    </Page>
  );
}
