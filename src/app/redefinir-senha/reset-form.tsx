"use client";

import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { AuthAlert, AuthBadge, AuthTitle, authCta, authSpinner } from "@/components/auth-shell";
import { PasswordField } from "@/components/password-field";

/** Nova senha (protótipo): duas vezes a senha, com verificação do tamanho ao vivo. */
export function ResetForm({ token }: { token: string }) {
  const [errors, setErrors] = useState<{ password?: string; again?: string; form?: boolean }>({});
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const again = String(data.get("again") ?? "");
    const next: typeof errors = {};
    if (password.length < 8) next.password = "A senha precisa de pelo menos 8 caracteres.";
    if (again !== password) next.again = "As senhas não são iguais.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setPending(true);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    setPending(false);
    if (error) {
      setErrors({ form: true });
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div role="status" className="flex flex-col gap-[18px]">
        <AuthBadge icon="check" />
        <h2 className="m-0 font-display text-[30px] leading-[1.1] font-[650] tracking-[-0.02em]">Senha alterada</h2>
        <p className="m-0 text-base text-ink-muted">Agora você já pode entrar com a nova senha.</p>
        <Link href="/login" className={authCta}>
          Entrar
        </Link>
      </div>
    );
  }

  return (
    <>
      <AuthTitle title="Nova senha" subtitle="Escolha a senha que vai usar para entrar." />
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        {errors.form && (
          <AuthAlert title="Este link venceu ou já foi usado.">
            <Link href="/esqueci-senha" className="font-semibold">Pedir novo link</Link>
          </AuthAlert>
        )}
        <PasswordField label="Nova senha" name="password" autoComplete="new-password" error={errors.password} minLength={8} />
        <PasswordField label="Repita a nova senha" name="again" autoComplete="new-password" error={errors.again} />
        <button type="submit" disabled={pending} aria-busy={pending || undefined} className={authCta}>
          {pending && authSpinner}
          {pending ? "Salvando..." : "Salvar nova senha"}
        </button>
      </form>
    </>
  );
}
