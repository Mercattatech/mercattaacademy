export function VerifyIntro() {
  return (
    <div>
      <h1 className="m-0 font-display text-[32px] leading-[1.08] font-[650] tracking-[-0.025em] sm:text-[40px]">Conferir certificado</h1>
      <p className="mt-2 mb-0 max-w-[52ch] text-base text-ink-muted">Digite o código impresso no certificado ou aponte a câmera para o QR code.</p>
    </div>
  );
}

export function PrivacyNote() {
  return (
    <p className="m-0 text-[13px] text-ink-subtle">
      Esta página mostra só os dados necessários para conferir a autenticidade. Documentos e dados pessoais do aluno não ficam públicos.
    </p>
  );
}
