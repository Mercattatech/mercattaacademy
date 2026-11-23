"use client";

import Link from "next/link";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { AuthBadge, AuthTitle, authCta, authSpinner } from "@/components/auth-shell";
import { Icon } from "@/components/icon";
import { Field } from "@/components/ui";

const backCls = "inline-flex min-h-11 items-center gap-1.5 self-start text-[15px] font-semibold text-brand-ink no-underline";

/** Criar uma nova senha (protótipo): pede o e-mail e mostra "Confira seu e-mail". */
export function ForgotForm({ backHref }: { backHref: string }) {
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string>();
  const [resent, setResent] = useState(false);

  async function send(email: string) {
    setPending(true);
    setError(undefined);
    // A resposta é a mesma exista ou não a conta, para não revelar quem tem cadastro.
    await authClient.requestPasswordReset({ email, redirectTo: "/redefinir-senha" }).catch(() => undefined);
    setPending(false);
    if (sentTo) setResent(true);
    setSentTo(email);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Informe um e-mail válido.");
      return;
    }
    await send(email);
  }

  if (sentTo) {
    return (
      <div role="status" className="flex flex-col gap-[18px]">
        <AuthBadge icon="mail" tone="brand" />
        <h1 className="m-0 font-display text-[30px] leading-[1.1] font-[650] tracking-[-0.02em]">Confira seu e-mail</h1>
        <p className="m-0 text-base text-ink-muted">
          Se houver uma conta com <strong className="text-ink">{sentTo}</strong>, você vai receber um link para criar a nova senha. Ele vale por 1 hora. Veja também a caixa de spam.
        </p>
        <Link href={backHref} className={authCta}>
          Voltar para entrar
        </Link>
        <button
          type="button"
          disabled={pending || resent}
          onClick={() => send(sentTo)}
          className="h-12 rounded-[14px] text-base font-semibold text-brand-ink hover:bg-brand-soft disabled:text-ink-subtle disabled:hover:bg-transparent"
        >
          {pending ? "Enviando..." : resent ? "E-mail reenviado" : "Reenviar o e-mail"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Link href={backHref} className={backCls}>
        <Icon name="arrowBack" size={20} />
        Voltar para entrar
      </Link>
      <AuthTitle title="Criar uma nova senha" subtitle="Informe o e-mail da sua conta. Enviamos um link que vale por 1 hora." />
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <Field large label="E-mail" name="email" type="email" autoComplete="email" required error={error} />
        <button type="submit" disabled={pending} aria-busy={pending || undefined} className={authCta}>
          {pending && authSpinner}
          {pending ? "Enviando..." : "Enviar link"}
        </button>
      </form>
    </div>
  );
}
