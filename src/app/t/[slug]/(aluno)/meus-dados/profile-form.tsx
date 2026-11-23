"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { inputCls, primaryBtn } from "@/components/student-ui";
import { authClient } from "@/lib/auth-client";
import { cx, Notice } from "@/components/ui";

/** Nome editável; e-mail só leitura (é o login, a troca passa pela secretaria). */
export function ProfileForm({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  return (
    <form
      className="flex flex-col gap-[18px]"
      onSubmit={async (e) => {
        e.preventDefault();
        const next = value.trim().replace(/\s+/g, " ");
        if (next.length < 3) {
          setState("error");
          setError("Digite seu nome completo.");
          return;
        }
        setState("saving");
        const { error: err } = await authClient.updateUser({ name: next });
        if (err) {
          setState("error");
          setError("Não foi possível salvar agora. Tente de novo.");
          return;
        }
        setState("saved");
        router.refresh();
      }}
    >
      {state === "saved" && (
        <Notice tone="ok" title="Alterações salvas." />
      )}
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Nome completo
        <input
          name="name"
          autoComplete="name"
          value={value}
          maxLength={120}
          onChange={(e) => {
            setValue(e.target.value);
            if (state !== "saving") setState("idle");
          }}
          className={inputCls}
        />
        <span className="text-[13px] font-normal text-ink-subtle">É o nome que sai no certificado. Confira acentos e sobrenomes.</span>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        E-mail
        <input type="email" value={email} disabled className={cx(inputCls, "border-line bg-sunken text-ink-muted")} />
        <span className="text-[13px] font-normal text-ink-subtle">É o seu login. Para trocar, fale com a secretaria pelo Atendimento.</span>
      </label>
      {state === "error" && <Notice tone="danger">{error}</Notice>}
      <button type="submit" disabled={state === "saving" || value.trim() === name} className={cx(primaryBtn, "mt-1.5")}>
        {state === "saving" ? "Salvando..." : "Salvar alterações"}
      </button>
    </form>
  );
}
