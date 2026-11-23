"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { AuthAlert, AuthBadge, authCta, authSpinner } from "@/components/auth-shell";
import { Icon } from "@/components/icon";
import { Field } from "@/components/ui";
import { PasswordField } from "@/components/password-field";

type Errors = { name?: string; email?: string; password?: string; consent?: string; form?: string };

/** Criar conta (protótipo): nome, e-mail, senha com verificação ao vivo e concordância. */
export function SignupForm({
  redirectTo,
  privacyHref,
  showcase,
}: {
  redirectTo: string;
  privacyHref: string | null;
  /** Vitrine da instituição, para o botão depois de criar a conta. */
  showcase: { href: string; label: string } | null;
}) {
  const router = useRouter();
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const q = redirectTo !== "/escolher" ? `?voltar=${encodeURIComponent(redirectTo)}` : "";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const email = String(data.get("email") ?? "").trim();
    const pass = String(data.get("password") ?? "");
    const next: Errors = {};
    if (name.split(/\s+/).filter(Boolean).length < 2) next.name = "Informe o nome completo.";
    if (!/^\S+@\S+\.\S+$/.test(email)) next.email = "Confira o e-mail. Ex.: nome@email.com";
    if (pass.length < 8) next.password = "A senha precisa de pelo menos 8 caracteres.";
    if (!data.get("consent")) next.consent = "Marque a concordância para criar a conta.";
    setErrors(next);
    if (Object.keys(next).length) return;

    setPending(true);
    const { error } = await authClient.signUp.email({ name, email, password: pass });
    setPending(false);
    if (error) {
      const exists = /exist|already|taken/i.test(`${error.code ?? ""} ${error.message ?? ""}`);
      setErrors(
        exists
          ? { email: "Já existe uma conta com este e-mail. Entre ou crie uma nova senha." }
          : { form: "Tente de novo em instantes." },
      );
      return;
    }
    setDone(true);
  }

  if (done) {
    // Indo para uma página específica (ex.: inscrição numa turma), continua para lá.
    const target = redirectTo !== "/escolher" ? { href: redirectTo, label: "Continuar" } : (showcase ?? { href: "/escolher", label: "Continuar" });
    return (
      <div role="status" className="flex flex-col gap-[18px]">
        <AuthBadge icon="check" />
        <h1 className="m-0 font-display text-[30px] leading-[1.1] font-[650] tracking-[-0.02em]">Conta criada</h1>
        <p className="m-0 text-base text-ink-muted">
          {showcase ? "Agora escolha uma pós-graduação e a turma para fazer sua inscrição." : "Agora é só entrar na sua instituição."}
        </p>
        <button
          type="button"
          className={authCta}
          onClick={() => {
            router.push(target.href);
            router.refresh();
          }}
        >
          {target.label}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-[18px]" noValidate>
      {errors.form && <AuthAlert title="Não foi possível criar a conta.">{errors.form}</AuthAlert>}
      <Field large label="Nome completo" name="name" autoComplete="name" required error={errors.name} hint="Como no seu diploma. Aparece no certificado." />
      <Field large label="E-mail" name="email" type="email" autoComplete="email" required error={errors.email} />
      <PasswordField label="Crie uma senha" name="password" autoComplete="new-password" error={errors.password} minLength={8} />
      <div className="flex flex-col gap-1.5">
        <label className="flex cursor-pointer items-start gap-3 py-1 text-sm text-ink-muted">
          <input
            type="checkbox"
            name="consent"
            className="mt-px size-[22px] shrink-0 accent-[var(--color-brand)]"
            aria-invalid={errors.consent ? true : undefined}
            aria-describedby={errors.consent ? "consent-erro" : undefined}
          />
          <span>
            Li e concordo com a{" "}
            {privacyHref ? (
              <Link href={privacyHref} target="_blank" className="font-semibold text-brand-ink underline underline-offset-2">
                política de privacidade
              </Link>
            ) : (
              "política de privacidade"
            )}
            .
          </span>
        </label>
        {errors.consent && (
          <p id="consent-erro" role="alert" className="m-0 flex items-center gap-1.5 text-[13px] font-medium text-danger">
            <Icon name="error" size={16} />
            {errors.consent}
          </p>
        )}
      </div>
      <button type="submit" disabled={pending} aria-busy={pending || undefined} className={authCta}>
        {pending && authSpinner}
        {pending ? "Criando conta..." : "Criar conta"}
      </button>
      <p className="m-0 text-center text-[15px] text-ink-muted">
        Já tem conta?{" "}
        <Link href={`/login${q}`} className="font-semibold text-brand-ink underline underline-offset-2">
          Entrar
        </Link>
      </p>
    </form>
  );
}
