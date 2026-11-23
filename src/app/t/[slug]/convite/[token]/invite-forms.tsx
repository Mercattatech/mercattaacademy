"use client";

import { startTransition, useActionState } from "react";
import type { ActionState } from "@/components/action-form";
import { AuthAlert, authCta, authSpinner } from "@/components/auth-shell";
import { PasswordField } from "@/components/password-field";
import { Field } from "@/components/ui";

type Action = (s: ActionState, f: FormData) => Promise<ActionState>;

function useSubmit(action: Action) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  };
  return { state, pending, onSubmit };
}

/** Pessoa nova: nome e senha (protótipo, tela Aceitar convite). */
export function InviteSignupForm({ action, defaultName }: { action: Action; defaultName: string }) {
  const { state, pending, onSubmit } = useSubmit(action);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {state?.error && <AuthAlert title={state.error} />}
      <Field large label="Seu nome" name="name" autoComplete="name" required minLength={3} defaultValue={defaultName} />
      <PasswordField label="Crie uma senha" name="password" autoComplete="new-password" minLength={8} />
      <button type="submit" disabled={pending} aria-busy={pending || undefined} className={authCta}>
        {pending && authSpinner}
        {pending ? "Criando acesso..." : "Aceitar e criar acesso"}
      </button>
    </form>
  );
}

/** Já conectado com o e-mail certo: um botão. */
export function InviteAcceptButton({ action }: { action: Action }) {
  const { state, pending, onSubmit } = useSubmit(action);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      {state?.error && <AuthAlert title={state.error} />}
      <button type="submit" disabled={pending} aria-busy={pending || undefined} className={authCta}>
        {pending && authSpinner}
        {pending ? "Aceitando..." : "Aceitar convite"}
      </button>
    </form>
  );
}
