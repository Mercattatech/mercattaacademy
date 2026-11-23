"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icon";

export type PickCohort = { id: string; name: string; when: string; until: string | null };

const ctaCls =
  "inline-flex items-center justify-center rounded-[14px] bg-brand font-bold text-on-brand no-underline hover:bg-brand-strong hover:text-on-brand";

/**
 * Escolha da turma e botão de matrícula (protótipo: cartões em rádio na caixa lateral).
 * No celular, uma barra fixa no rodapé repete o preço e o botão.
 */
export function CohortPicker({ slug, cohorts, priceMain, cohortWord }: { slug: string; cohorts: PickCohort[]; priceMain: string; cohortWord: string }) {
  const [sel, setSel] = useState(cohorts[0]?.id);
  const cur = cohorts.find((c) => c.id === sel) ?? cohorts[0];
  const href = `/t/${slug}/inscricao/${cur.id}`;

  return (
    <>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-2 p-0 text-sm font-semibold">Escolha a {cohortWord}</legend>
        {cohorts.map((c) => {
          const on = c.id === cur.id;
          return (
            <label
              key={c.id}
              className={`flex cursor-pointer items-start gap-3 rounded-[14px] bg-surface p-3.5 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-brand ${on ? "border-2 border-brand p-[13px]" : "border border-line-strong"}`}
            >
              <input type="radio" name="turma" value={c.id} checked={on} onChange={() => setSel(c.id)} className="sr-only" />
              <span aria-hidden="true" className={`mt-px flex size-[22px] shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-brand" : "border-line-strong"}`}>
                {on && <span className="size-2.5 rounded-full bg-brand" />}
              </span>
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-base font-semibold">{c.name}</span>
                <span className="text-sm text-ink-muted">{c.when}</span>
              </span>
            </label>
          );
        })}
      </fieldset>
      <Link href={href} className={`${ctaCls} h-14 text-[17px]`}>Quero me matricular</Link>
      <p className="m-0 text-[13px] text-ink-subtle">
        {cur.until ? `Inscrições até ${cur.until}. ` : ""}Nada é cobrado antes do envio dos documentos.
      </p>

      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t border-line bg-surface px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] md:hidden">
        <span className="flex flex-1 flex-col leading-tight">
          <span className="font-display text-lg font-semibold">{priceMain}</span>
          <span className="flex items-center gap-1 text-[13px] text-ink-muted">
            <Icon name="calendar" size={14} />
            {cur.name}
          </span>
        </span>
        <Link href={href} className={`${ctaCls} h-[52px] px-[18px] text-base whitespace-nowrap`}>Quero me matricular</Link>
      </div>
    </>
  );
}
