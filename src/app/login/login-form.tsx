"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { AuthAlert, authCta, authCtaOutline, authSpinner } from "@/components/auth-shell";
import { Field } from "@/components/ui";
import { PasswordField } from "@/components/password-field";

type Errors = { email?: string; password?: string; wrong?: boolean };

/** Entrar (protótipo): erro de credencial no topo, erros de campo embaixo de cada campo. */
export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);
  const q = redirectTo !== "/escolher" ? `?voltar=${encodeURIComponent(redirectTo)}` : "";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const next: Errors = {};
    if (!/^\S+@\S+\.\S+$/.test(email)) next.email = "Informe um e-mail válido.";
    if (!password) next.password = "Informe sua senha.";
    setErrors(next);
    if (next.email || next.password) return;

    setPending(true);
    const { error } = await authClient.signIn.email({ email, password });
    if (error) {
      setPending(false);
      setErrors({ wrong: true });
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <>
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        {errors.wrong && (
          <AuthAlert title="E-mail ou senha incorretos.">
            Confira e tente de novo, ou <Link href={`/esqueci-senha${q}`} className="font-semibold">crie uma nova senha</Link>.
          </AuthAlert>
        )}
        <Field large label="E-mail" name="email" type="email" autoComplete="email" required error={errors.email} />
        <PasswordField
          label="Senha"
          name="password"
          autoComplete="current-password"
          error={errors.password}
          aside={
            <Link href={`/esqueci-senha${q}`} className="inline-flex min-h-8 items-center text-sm font-semibold text-brand-ink underline underline-offset-2">
              Esqueci minha senha
            </Link>
          }
        />
        <button type="submit" disabled={pending} aria-busy={pending || undefined} className={authCta}>
          {pending && authSpinner}
          {pending ? "Entrando..." : "Entrar"}
        </button>
      </form>
      <div className="flex items-center gap-3 text-[13px] text-ink-subtle">
        <span className="h-px flex-1 bg-line" />
        Primeira vez aqui?
        <span className="h-px flex-1 bg-line" />
      </div>
      <Link href={`/cadastro${q}`} className={authCtaOutline}>
        Criar conta
      </Link>
    </>
  );
}
