"use client";

import { useState } from "react";
import { Icon } from "@/components/icon";
import { secondaryBtn } from "@/components/student-ui";

/** Copia o link público de verificação do certificado. */
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <button
        type="button"
        className={secondaryBtn}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
          } catch {
            window.prompt("Copie o link:", url);
          }
        }}
      >
        <Icon name={copied ? "check" : "link"} />
        {copied ? "Link copiado" : "Copiar link de verificação"}
      </button>
      <span role="status" className="sr-only">{copied ? "Link copiado" : ""}</span>
    </>
  );
}
