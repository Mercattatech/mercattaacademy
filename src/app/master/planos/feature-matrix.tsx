"use client";

import { useState, useTransition } from "react";
import { toggleFeatureAction } from "../actions";
import { Switch } from "../master-ui";

type Props = {
  features: { key: string; name: string }[];
  tenants: { slug: string; name: string; enabled: string[] }[];
};

/** Nome curto no cabeçalho (protótipo); o nome inteiro fica no title e no rótulo de cada interruptor. */
const SHORT: Record<string, string> = {
  pjbl: "PjBL",
  percurso: "Percurso",
  pares: "Pares",
  recuperacao: "Recuperação",
  aulas_gravadas: "Gravadas",
  forum: "Fórum",
  nps: "Pesquisa",
};

/** Matriz instituição × recurso opcional. Cada interruptor grava na hora e volta atrás se falhar. */
export function FeatureMatrix({ features, tenants }: Props) {
  const [state, setState] = useState(() => new Map(tenants.map((t) => [t.slug, new Set(t.enabled)])));
  const [error, setError] = useState<string>();
  const [, start] = useTransition();

  function toggle(slug: string, key: string, next: boolean) {
    setError(undefined);
    const apply = (on: boolean) =>
      setState((prev) => {
        const m = new Map(prev);
        const set = new Set(m.get(slug));
        if (on) set.add(key);
        else set.delete(key);
        m.set(slug, set);
        return m;
      });
    apply(next);
    start(async () => {
      let ok = false;
      try {
        ok = (await toggleFeatureAction(slug, key, next)).ok;
      } catch {
        ok = false;
      }
      if (!ok) {
        apply(!next);
        setError("Não foi possível salvar essa mudança. Tente de novo.");
      }
    });
  }

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="text-[13px] text-ink-subtle">
              <th scope="col" className="sticky left-0 bg-surface px-4 py-3 text-left font-semibold">Instituição</th>
              {features.map((f) => (
                <th key={f.key} scope="col" title={f.name} className="px-1 py-3 text-center font-semibold whitespace-nowrap">
                  {SHORT[f.key] ?? f.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.slug} className="border-t border-line">
                <th scope="row" className="sticky left-0 bg-surface px-4 py-2 text-left font-semibold whitespace-nowrap">{t.name}</th>
                {features.map((f) => {
                  const on = state.get(t.slug)?.has(f.key) ?? false;
                  return (
                    <td key={f.key} className="p-1 text-center">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        aria-label={`${f.name} · ${t.name}`}
                        onClick={() => toggle(t.slug, f.key, !on)}
                        className="inline-flex h-11 w-[52px] items-center justify-center"
                      >
                        <Switch on={on} small />
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && (
        <p role="alert" className="m-0 text-sm font-semibold text-danger">{error}</p>
      )}
    </>
  );
}
