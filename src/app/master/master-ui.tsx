"use client";

import { startTransition, useActionState, useEffect, useRef, useState, useTransition } from "react";
import type { ActionState } from "@/components/action-form";
import { btnOutline, btnPrimary, inputCls, textareaCls } from "@/components/admin-ui";
import { Icon } from "@/components/icon";
import { toggleFeatureAction } from "./actions";
import { btn, cx, fieldGroupFocus } from "@/components/ui";

const dialogCls =
  "m-auto w-[min(480px,calc(100vw-32px))] rounded-[24px] border-0 bg-surface p-0 text-ink shadow-[var(--shadow-overlay)] backdrop:bg-ink/45";

/** "Entrar como suporte" com confirmação (protótipo: diálogo antes de abrir o painel da instituição). */
export function SupportButton({ name, href, primary, disabled }: { name: string; href: string; primary?: boolean; disabled?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const cls = primary
    ? btnPrimary
    : "inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] border border-line-strong bg-surface px-3 text-sm font-semibold text-ink hover:bg-sunken disabled:cursor-not-allowed disabled:text-ink-subtle disabled:hover:bg-surface";
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        title={disabled ? "Reative a instituição para entrar como suporte." : undefined}
        onClick={() => ref.current?.showModal()}
        className={`${cls} ${primary && disabled ? "bg-sunken! text-ink-subtle!" : ""}`}
      >
        <Icon name="support" size={primary ? 20 : 18} />
        Entrar como suporte
      </button>
      <dialog ref={ref} aria-labelledby={`sup-${href}`} className={dialogCls}>
        <div className="flex flex-col gap-4 p-6 text-left">
          <h2 id={`sup-${href}`} className="m-0 font-display text-[22px] font-semibold">Entrar como suporte</h2>
          <p className="m-0 text-[15px] font-normal whitespace-normal text-ink-muted">
            Você vai ver o painel de <strong className="text-ink">{name}</strong> como administrador. O acesso fica registrado na auditoria da instituição.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => ref.current?.close()} className={btnOutline}>Cancelar</button>
            <a href={href} className={btnPrimary}>Entrar como suporte</a>
          </div>
        </div>
      </dialog>
    </>
  );
}

/** Suspender com motivo obrigatório (protótipo: diálogo com texto, botão vermelho). */
export function SuspendDialog({ name, action }: { name: string; action: (state: ActionState, form: FormData) => Promise<ActionState> }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState(action, undefined);
  useEffect(() => {
    if (state?.ok) ref.current?.close();
  }, [state]);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className={btn("dangerOutline")}
      >
        Suspender instituição
      </button>
      <dialog ref={ref} aria-labelledby="sus-t" className={dialogCls}>
        <form
          className="flex flex-col gap-4 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            startTransition(() => formAction(data));
          }}
        >
          <input type="hidden" name="status" value="suspended" />
          <h2 id="sus-t" className="m-0 font-display text-[22px] font-semibold">Suspender {name}?</h2>
          <p className="m-0 text-[15px] text-ink-muted">Alunos e equipe deixam de entrar até a reativação. Nenhum dado é apagado.</p>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Motivo
            <textarea name="reason" required minLength={3} maxLength={300} placeholder="Ex.: Cobrança de outubro em atraso há 30 dias" className={textareaCls} />
            <span className="text-[13px] font-normal text-ink-subtle">Fica registrado na auditoria.</span>
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
              {pending ? "Suspendendo..." : "Suspender"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

/** Interruptor do protótipo (44×26). */
export function Switch({ on, small }: { on: boolean; small?: boolean }) {
  return small ? (
    <span className={`relative block h-[22px] w-9 rounded-full transition-colors ${on ? "bg-brand" : "bg-line-strong"}`}>
      <span className={`absolute top-[3px] flex size-4 items-center justify-center rounded-full bg-white text-brand shadow transition-all ${on ? "left-[17px]" : "left-[3px]"}`}>
        {on && <Icon name="check" size={11} strong />}
      </span>
    </span>
  ) : (
    <span className={`relative block h-[26px] w-11 shrink-0 rounded-full transition-colors ${on ? "bg-brand" : "bg-line-strong"}`}>
      <span className={`absolute top-[3px] size-5 rounded-full bg-white shadow transition-all ${on ? "left-[21px]" : "left-[3px]"}`} />
    </span>
  );
}

/** Recursos opcionais de uma instituição: cada interruptor grava na hora e volta atrás se falhar. */
export function FeatureSwitches({ slug, features }: { slug: string; features: { key: string; name: string; description: string; enabled: boolean }[] }) {
  const [on, setOn] = useState(() => new Set(features.filter((f) => f.enabled).map((f) => f.key)));
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const [, start] = useTransition();

  function toggle(key: string, name: string) {
    const next = !on.has(key);
    const apply = (v: boolean) =>
      setOn((prev) => {
        const s = new Set(prev);
        if (v) s.add(key);
        else s.delete(key);
        return s;
      });
    apply(next);
    setMsg(undefined);
    start(async () => {
      let ok = false;
      try {
        ok = (await toggleFeatureAction(slug, key, next)).ok;
      } catch {}
      if (!ok) apply(!next);
      setMsg(ok ? { ok, text: `${name} ${next ? "ligado" : "desligado"}.` } : { ok, text: "Não foi possível salvar. Tente de novo." });
    });
  }

  return (
    <>
      <ul className="m-0 list-none rounded-2xl border border-line bg-surface p-0">
        {features.map((f, i) => {
          const v = on.has(f.key);
          return (
            <li key={f.key} className={`flex items-center gap-3.5 px-4 py-3 ${i ? "border-t border-line" : ""}`}>
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-semibold">{f.name}</span>
                <span className="text-[13px] text-ink-muted">{f.description}</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={v}
                aria-label={f.name}
                onClick={() => toggle(f.key, f.name)}
                className={`flex min-h-11 items-center gap-2 text-[13px] font-semibold ${v ? "text-brand-ink" : "text-ink-muted"}`}
              >
                <span className="w-[72px] text-right">{v ? "Ligado" : "Desligado"}</span>
                <Switch on={v} />
              </button>
            </li>
          );
        })}
      </ul>
      <p role="status" className={`m-0 text-sm ${msg?.ok === false ? "font-semibold text-danger" : "text-ink-muted"}`}>{msg?.text}</p>
    </>
  );
}

const slugify = (v: string) =>
  v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^(instituto|escola|faculdade|centro|academia)\s+(de\s+)?/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

/** Nome e endereço: o endereço é sugerido a partir do nome até a pessoa mexer nele. */
export function NameSlugFields({ root }: { root: string }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);
  return (
    <>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Nome da instituição
        <input
          name="name"
          required
          minLength={2}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!touched) setSlug(slugify(e.target.value));
          }}
          placeholder="Ex.: Instituto Bressane"
          className={cx(inputCls, "h-12 text-base")}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Endereço
        <span className={`flex h-12 items-center overflow-hidden rounded-[10px] border border-line-strong bg-surface ${fieldGroupFocus}`}>
          <input
            name="slug"
            required
            pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]"
            value={slug}
            onChange={(e) => {
              setTouched(true);
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
            }}
            placeholder="bressane"
            className="h-full min-w-0 flex-1 border-0 bg-transparent px-3 text-base font-normal text-ink outline-none"
          />
          <span className="flex h-full items-center bg-sunken px-3 text-[15px] font-normal text-ink-muted">.{root}</span>
        </span>
        <span className="text-[13px] font-normal text-ink-subtle">Letras minúsculas, números e hífen. Não muda depois de criado.</span>
      </label>
    </>
  );
}
