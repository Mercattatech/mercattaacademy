"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { btn, cx, fieldLargeCls } from "@/components/ui";

/** Código do certificado + Conferir (protótipo: campo em fonte mono, botão na cor da instituição). */
export function VerifyForm({ slug, initial }: { slug: string; initial: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initial);
  const [pending, setPending] = useState(false);
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const c = code.trim();
        if (!c) return;
        setPending(true);
        router.push(`/t/${slug}/verificar/${encodeURIComponent(c)}`);
      }}
    >
      <label className="flex min-w-0 flex-[1_1_240px] flex-col gap-1.5 text-sm font-semibold">
        Código do certificado
        <input
          name="codigo"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setPending(false);
          }}
          placeholder="XXXX-XXXX-XXXX"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          required
          className={cx(fieldLargeCls, "font-mono text-[17px] tracking-[.04em]")}
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending || undefined}
        className={btn("primary", "lg")}
      >
        {pending ? "Conferindo..." : "Conferir"}
      </button>
    </form>
  );
}
