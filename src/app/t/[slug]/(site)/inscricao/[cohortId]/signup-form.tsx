"use client";

import { startTransition, useActionState, useState } from "react";
import type { ActionState } from "@/components/action-form";
import { Icon } from "@/components/icon";
import { fieldGroupFocus } from "@/components/ui";

const inputCls = "h-[52px] w-full rounded-[12px] border border-line-strong bg-surface px-3.5 text-base font-normal text-ink";
const labelCls = "flex flex-col gap-1.5 text-sm font-semibold";
export const bigCta =
  "inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-[14px] bg-brand text-[17px] font-bold text-on-brand hover:bg-brand-strong disabled:opacity-85";

/** Criar conta e se inscrever (protótipo): nome, e-mail, senha com "mostrar" e concordância. */
export function SignupForm({ action, privacyHref }: { action: (s: ActionState, f: FormData) => Promise<ActionState>; privacyHref: string }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [show, setShow] = useState(false);

  return (
    <form
      className="flex flex-col gap-[22px]"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <label className={labelCls}>
        Nome completo
        <input name="name" required minLength={3} autoComplete="name" className={inputCls} />
      </label>
      <label className={labelCls}>
        E-mail
        <input name="email" type="email" required autoComplete="email" className={inputCls} />
      </label>
      <label className={labelCls}>
        Crie uma senha
        <span className={`flex h-[52px] items-center overflow-hidden rounded-[12px] border border-line-strong bg-surface ${fieldGroupFocus}`}>
          <input
            name="password"
            type={show ? "text" : "password"}
            required
            minLength={8}
            autoComplete="new-password"
            className="h-full min-w-0 flex-1 border-0 bg-transparent px-3.5 text-base font-normal text-ink outline-none"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Esconder senha" : "Mostrar senha"}
            aria-pressed={show}
            className="flex h-full w-[52px] items-center justify-center text-ink-muted hover:bg-sunken"
          >
            <Icon name={show ? "eyeOff" : "eye"} size={22} />
          </button>
        </span>
        <span className="text-[13px] font-normal text-ink-subtle">Pelo menos 8 caracteres.</span>
      </label>
      <label className="flex cursor-pointer items-start gap-3 py-1">
        <input type="checkbox" name="consent" required className="mt-0.5 size-[22px] shrink-0 accent-[var(--color-brand)]" />
        <span className="text-sm font-normal text-ink-muted">
          Concordo com o uso dos meus dados e documentos para a matrícula, conforme a{" "}
          <a href={privacyHref} target="_blank" rel="noreferrer">política de privacidade</a>.
        </span>
      </label>
      {state?.error && (
        <p role="alert" className="-mt-2 mb-0 flex items-center gap-1.5 text-sm font-medium text-danger">
          <Icon name="error" size={18} />
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} aria-busy={pending || undefined} className={bigCta}>
        {pending && <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
        {pending ? "Criando sua conta..." : "Criar conta e me inscrever"}
      </button>
    </form>
  );
}
