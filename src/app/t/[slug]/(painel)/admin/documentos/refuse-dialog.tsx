"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import type { ActionState } from "@/components/action-form";
import { btnDanger, btnOutline, textareaCls } from "@/components/admin-ui";
import { Icon } from "@/components/icon";
import { btn } from "@/components/ui";

const REASONS = ["Foto ilegível ou cortada", "Documento vencido", "Falta o verso", "Arquivo errado"];

/** Recusar documento (protótipo: diálogo com motivos comuns e texto para o aluno). */
export function RefuseDialog({
  action,
  docLabel,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  docLabel: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState("");
  const [state, formAction, pending] = useActionState(action, undefined);

  useEffect(() => {
    if (state?.ok) ref.current?.close();
  }, [state]);

  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className={btnDanger}>
        <Icon name="close" size={20} />
        Recusar
      </button>
      <dialog
        ref={ref}
        aria-labelledby="refuse-t"
        className="m-auto w-[min(520px,calc(100vw-32px))] rounded-[20px] border-0 bg-surface p-0 text-ink shadow-[var(--shadow-overlay)] backdrop:bg-ink/40"
      >
        <form
          className="flex flex-col gap-4 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            startTransition(() => formAction(data));
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <h2 id="refuse-t" className="m-0 font-sans text-xl font-semibold">Recusar documento</h2>
            <button type="button" onClick={() => ref.current?.close()} aria-label="Fechar" className="-mt-2 -mr-2 flex size-11 items-center justify-center rounded-[10px] text-ink-muted hover:bg-sunken">
              <Icon name="close" />
            </button>
          </div>
          <p className="m-0 text-[15px] text-ink-muted">{docLabel}. O motivo é enviado ao aluno junto com o pedido de reenvio, e o arquivo atual é apagado.</p>
          <div role="group" aria-label="Motivos comuns" className="flex flex-wrap gap-2">
            {REASONS.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={text === r}
                onClick={() => setText(r)}
                className={`h-10 rounded-full border px-3.5 text-sm font-semibold ${text === r ? "border-brand bg-brand-soft text-brand-ink" : "border-line-strong bg-surface text-ink hover:bg-sunken"}`}
              >
                {r}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Motivo
            <textarea
              name="reason"
              required
              minLength={5}
              maxLength={300}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Explique o que o aluno precisa corrigir."
              className={textareaCls}
            />
          </label>
          {state?.error && (
            <p role="alert" className="m-0 flex items-center gap-1.5 text-sm font-semibold text-danger">
              <Icon name="error" size={18} />
              {state.error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => ref.current?.close()} className={btnOutline}>Cancelar</button>
            <button type="submit" disabled={pending} aria-busy={pending || undefined} className={btn("danger")}>
              {pending ? "Recusando..." : "Recusar documento"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
