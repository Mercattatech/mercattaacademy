"use client";

import { useState } from "react";
import { Icon } from "./icon";
import { fieldGroupFocus } from "./ui";

/**
 * Campo de senha do protótipo: 52px, botão de olho para mostrar/esconder
 * e, se houver mínimo, a dica "Pelo menos 8 caracteres" que fica verde quando atendida.
 */
export function PasswordField({
  label,
  name,
  autoComplete,
  error,
  hint,
  minLength,
  aside,
  onValue,
}: {
  label: string;
  name: string;
  autoComplete: string;
  error?: string;
  /** Dica fixa (sem verificação). Para a dica que verifica o tamanho, use minLength. */
  hint?: string;
  minLength?: number;
  /** Algo à direita do rótulo (ex.: "Esqueci minha senha"). */
  aside?: React.ReactNode;
  onValue?: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  const [value, setValue] = useState("");
  const id = name;
  const ok = minLength ? value.length >= minLength : false;
  const describedBy = error ? `${id}-erro` : hint || minLength ? `${id}-dica` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold">
          {label}
        </label>
        {aside}
      </div>
      <span
        className={`flex h-[52px] items-center overflow-hidden rounded-[12px] bg-surface ${fieldGroupFocus} ${
          error ? "border-2 border-danger" : "border border-line-strong"
        }`}
      >
        <input
          id={id}
          name={name}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => {
            setValue(e.target.value);
            onValue?.(e.target.value);
          }}
          className="h-full min-w-0 flex-1 border-0 bg-transparent px-3.5 text-base text-ink outline-none"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Esconder senha" : "Mostrar senha"}
          aria-pressed={show}
          className="flex h-full w-[52px] shrink-0 items-center justify-center text-ink-muted hover:bg-sunken"
        >
          <Icon name={show ? "eyeOff" : "eye"} size={22} />
        </button>
      </span>
      {error ? (
        <p id={`${id}-erro`} role="alert" className="m-0 flex items-center gap-1.5 text-[13px] font-medium text-danger">
          <Icon name="error" size={16} />
          {error}
        </p>
      ) : minLength ? (
        <p id={`${id}-dica`} className={`m-0 flex items-center gap-1.5 text-[13px] ${ok ? "font-semibold text-success" : "text-ink-subtle"}`}>
          <Icon name={ok ? "checkCircle" : "emptyStep"} size={16} />
          Pelo menos {minLength} caracteres
        </p>
      ) : hint ? (
        <p id={`${id}-dica`} className="m-0 text-[13px] text-ink-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
