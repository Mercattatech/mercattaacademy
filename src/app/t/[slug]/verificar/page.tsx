import { VerifyForm } from "./verify-form";
import { PrivacyNote, VerifyIntro } from "./verify-ui";

export const metadata = { title: "Conferir certificado", robots: { index: false } };

/** Endereço impresso no certificado: só o campo do código. */
export default async function VerifyHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <>
      <VerifyIntro />
      <VerifyForm slug={slug} initial="" />
      <PrivacyNote />
    </>
  );
}
