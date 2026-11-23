"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { Button, Notice } from "./ui";

export type ActionState = { ok?: string; error?: string; details?: string[] } | undefined;

/**
 * Formulário ligado a uma Server Action que devolve { ok } ou { error }.
 * Mostra a mensagem logo abaixo. Os campos NÃO são apagados quando volta erro
 * (o React 19 apaga por padrão em <form action>); com resetOnSuccess, limpa só após sucesso.
 */
export function ActionForm({
  action,
  submitLabel,
  pendingLabel = "Salvando...",
  children,
  className = "flex flex-col gap-4",
  resetOnSuccess = false,
  variant = "primary",
  confirm,
  submitClassName,
  inline = false,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  pendingLabel?: string;
  children?: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  variant?: "primary" | "quiet";
  confirm?: string;
  /** Classes do botão de enviar (substitui o botão padrão; usado na área do aluno). */
  submitClassName?: string;
  /** Botão na mesma linha dos campos (ex.: comentário + Enviar). */
  inline?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form
      ref={ref}
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      {inline ? (
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">{children}</div>
          <button type="submit" disabled={pending} aria-busy={pending || undefined} className={submitClassName}>
            {pending ? pendingLabel : submitLabel}
          </button>
        </div>
      ) : (
        children
      )}
      <div className="flex flex-col gap-2">
        {!inline &&
          (submitClassName ? (
            <button type="submit" disabled={pending} aria-busy={pending || undefined} className={submitClassName}>
              {pending ? pendingLabel : submitLabel}
            </button>
          ) : (
            <Button type="submit" loading={pending} variant={variant} className="self-start">
              {pending ? pendingLabel : submitLabel}
            </Button>
          ))}
        {state?.error && (
          <Notice tone="danger">{state.error}</Notice>
        )}
        {state?.ok && (
          <Notice tone="ok">{state.ok}</Notice>
        )}
        {state?.details && state.details.length > 0 && (
          <ul className="list-disc pl-5 text-sm text-ink-muted">
            {state.details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        )}
      </div>
    </form>
  );
}
