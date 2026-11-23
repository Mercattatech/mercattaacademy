"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import type { ActionState } from "@/components/action-form";
import { Icon } from "@/components/icon";
import { primaryBtn, Screen, StateBlock, textBtn } from "@/components/student-ui";
import { Notice } from "@/components/ui";

const MAX = 4 * 1024 * 1024;
const sizeText = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Escolher o arquivo, ver a prévia e enviar. Depois do envio, mostra a confirmação. */
export function UploadDocument({
  slug,
  action,
  current,
  rejectedReason,
}: {
  slug: string;
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  current: string | null;
  rejectedReason: string | null;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  /** Resultado do envio anterior que a pessoa já deixou para trás ao trocar o arquivo. */
  const [dismissed, setDismissed] = useState<typeof state>(undefined);
  const serverError = state?.error && state !== dismissed ? state.error : null;
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (state?.ok) {
    return (
      <div role="status" className="flex min-h-[calc(100dvh-180px)] flex-col gap-4 px-6 pt-6 pb-7 md:min-h-0 md:px-0">
        <div className="flex flex-1 flex-col justify-center">
          <StateBlock icon="check" tone="success" title="Documento enviado">
            A secretaria confere o arquivo e você recebe uma notificação se precisar enviar de novo.
          </StateBlock>
        </div>
        <Link href={`/t/${slug}`} className={primaryBtn}>Voltar ao início</Link>
        <Link href={`/t/${slug}/inscricoes`} className={textBtn}>Ver minha matrícula</Link>
      </div>
    );
  }

  const choose = (f: File | null) => {
    setLocalError(null);
    setDismissed(state);
    if (f && f.size > MAX) {
      setLocalError("O arquivo passa de 4 MB. Reduza a foto ou comprima o PDF.");
      setFile(null);
      return;
    }
    setFile(f);
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!file) {
          setLocalError("Escolha um arquivo.");
          return;
        }
        const data = new FormData();
        data.set("file", file);
        startTransition(() => formAction(data));
      }}
    >
      <Screen gap="gap-5" className="min-h-[calc(100dvh-180px)] md:min-h-0">
        {rejectedReason ? (
          <Notice tone="danger" title="Recusado:">{rejectedReason}</Notice>
        ) : null}
        <p className="m-0 text-[15px] text-ink-muted">
          Foto nítida ou PDF, até 4 MB. {current ? `O arquivo atual (${current}) será substituído.` : "Confira se todas as informações estão legíveis."}
        </p>

        <input
          ref={input}
          id="file"
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          className="sr-only"
          onChange={(e) => choose(e.target.files?.[0] ?? null)}
        />

        {!file ? (
          <label
            htmlFor="file"
            className="flex h-[260px] cursor-pointer flex-col items-center justify-center gap-3 rounded-[18px] border-[1.5px] border-dashed border-line-strong bg-surface text-center hover:bg-canvas"
          >
            <span className="flex size-14 items-center justify-center rounded-full bg-brand-soft text-brand-ink"><Icon name="upload" size={26} /></span>
            <span className="text-base font-semibold">Escolher foto ou PDF</span>
            <span className="text-[13px] text-ink-subtle">No celular, você pode tirar a foto na hora.</span>
          </label>
        ) : (
          <>
            <div className="flex h-[260px] items-center justify-center overflow-hidden rounded-[18px] bg-[repeating-linear-gradient(135deg,#ECECE9_0_10px,#F4F4F2_10px_20px)]">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Prévia do arquivo escolhido" className="h-full w-full object-contain" />
              ) : (
                <span className="flex flex-col items-center gap-2 text-ink-muted">
                  <Icon name="file" size={40} />
                  <span className="rounded-md bg-surface px-2 py-1 text-xs">PDF</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 rounded-[14px] bg-surface px-3.5 py-3">
              <Icon name={preview ? "image" : "file"} size={24} className="text-ink-muted" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-semibold">{file.name}</span>
                <span className="text-[13px] text-ink-subtle">{sizeText(file.size)}</span>
              </span>
              <label htmlFor="file" className="flex min-h-11 cursor-pointer items-center px-2 text-sm font-semibold text-brand-ink">Trocar</label>
            </div>
          </>
        )}

        {(localError || serverError) && (
          <Notice tone="danger">{localError ?? serverError}</Notice>
        )}

        <div className="flex-1" />
        <button type="submit" disabled={pending || !file} className={primaryBtn}>
          {pending && <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
          {pending ? "Enviando..." : "Enviar documento"}
        </button>
      </Screen>
    </form>
  );
}
