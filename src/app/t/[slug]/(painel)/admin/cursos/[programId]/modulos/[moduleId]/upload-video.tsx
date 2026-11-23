"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Notice, TextareaField } from "@/components/ui";
import { cancelVideoUploadAction, finishVideoUploadAction, startVideoUploadAction } from "./actions";

const MAX = 2 * 1024 * 1024 * 1024;
const TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const sizeText = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : `${Math.max(1, Math.round(n / 1024 ** 2))} MB`).replace(".", ",");

/** Envia o vídeo direto ao armazenamento, com barra de progresso, e depois confere e libera. */
export function UploadVideo({ slug, programId, moduleId }: { slug: string; programId: string; moduleId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const xhr = useRef<XMLHttpRequest | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const sending = progress !== null;

  function pick(f: File | null) {
    setMessage(null);
    if (f && !TYPES.includes(f.type)) {
      setFile(null);
      setMessage({ tone: "danger", text: "Formato não aceito. Envie MP4, WebM ou MOV." });
      return;
    }
    if (f && f.size > MAX) {
      setFile(null);
      setMessage({ tone: "danger", text: "O vídeo passa de 2 GB. Comprima ou divida em partes." });
      return;
    }
    setFile(f);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || sending) return;
    const data = new FormData(event.currentTarget);
    setMessage(null);
    setProgress(0);

    const started = await startVideoUploadAction(slug, programId, moduleId, {
      title: String(data.get("title") ?? ""),
      description: String(data.get("description") ?? ""),
      fileName: file.name,
      size: file.size,
      contentType: file.type,
    });
    if ("error" in started) {
      setProgress(null);
      setMessage({ tone: "danger", text: started.error });
      return;
    }

    const sent = await new Promise<"ok" | "aborted" | "error">((resolve) => {
      const req = new XMLHttpRequest();
      xhr.current = req;
      req.open("PUT", started.uploadUrl);
      req.setRequestHeader("Content-Type", file.type);
      req.withCredentials = !started.uploadUrl.startsWith("http");
      req.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
      req.onload = () => resolve(req.status >= 200 && req.status < 300 ? "ok" : "error");
      req.onerror = () => resolve("error");
      req.onabort = () => resolve("aborted");
      req.send(file);
    });
    xhr.current = null;

    if (sent !== "ok") {
      await cancelVideoUploadAction(slug, moduleId, started.videoId);
      setProgress(null);
      if (sent === "error") setMessage({ tone: "danger", text: "O envio falhou. Confira a conexão e tente de novo." });
      return;
    }
    const done = await finishVideoUploadAction(slug, programId, moduleId, started.videoId);
    setProgress(null);
    if (done?.error) {
      setMessage({ tone: "danger", text: done.error });
      return;
    }
    setMessage({ tone: "ok", text: done?.ok ?? "Vídeo enviado." });
    setFile(null);
    form.current?.reset();
    router.refresh();
  }

  return (
    <form ref={form} onSubmit={submit} className="flex max-w-xl flex-col gap-3">
      <Field label="Título do vídeo" name="title" required maxLength={160} id="video-title" disabled={sending} hint="Ex.: Aula 1 · Introdução" />
      <TextareaField label="Descrição (opcional)" name="description" rows={2} maxLength={2000} id="video-desc" disabled={sending} />
      <div className="flex flex-col gap-1">
        <label htmlFor="video-file" className="text-sm font-semibold">Arquivo de vídeo</label>
        <input
          id="video-file"
          type="file"
          accept="video/mp4,video/webm,video/quicktime"
          disabled={sending}
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
          className="block w-full text-[15px] file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-[10px] file:border-0 file:bg-brand-soft file:px-4 file:font-semibold file:text-brand-ink"
        />
        <span className="text-[13px] text-ink-subtle">MP4, WebM ou MOV, até 2 GB.{file ? ` Escolhido: ${file.name} (${sizeText(file.size)}).` : ""}</span>
      </div>

      {sending && (
        <div className="flex flex-col gap-2" role="status" aria-live="polite">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-sm text-ink-muted">Enviando… {progress}%. Não feche esta página.</span>
        </div>
      )}
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!file || sending} loading={sending}>
          {sending ? "Enviando..." : "Enviar vídeo"}
        </Button>
        {sending && (
          <Button type="button" variant="secondary" onClick={() => xhr.current?.abort()}>
            Cancelar envio
          </Button>
        )}
      </div>
    </form>
  );
}
