"use client";

import { useState } from "react";
import { Icon } from "@/components/icon";
import { cx, fieldCls } from "@/components/ui";

const SWATCHES = ["#7B4F72", "#1E5F74", "#2F5D3A", "#9A3B26", "#2B3A67"];

function contrastWithWhite(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (lum + 0.05);
}

/** Cor principal (protótipo): sugestões, código e prévia de botão com checagem de contraste. */
export function BrandColor({ initial }: { initial: string }) {
  const [color, setColor] = useState(initial);
  const ratio = contrastWithWhite(color);
  const valid = ratio != null;
  const ok = valid && ratio >= 4.5;
  const hex = valid ? (color.startsWith("#") ? color : `#${color}`) : initial;

  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name="primary" value={hex} />
      <div className="flex flex-wrap items-end gap-4">
        <div role="radiogroup" aria-label="Sugestões de cor" className="flex gap-2">
          {SWATCHES.map((s) => {
            const on = hex.toLowerCase() === s.toLowerCase();
            return (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={s}
                onClick={() => setColor(s)}
                style={{ background: s }}
                className={`size-11 rounded-xl ${on ? "ring-2 ring-ink ring-offset-2" : ""}`}
              />
            );
          })}
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Código da cor
          <span className="flex items-center gap-2">
            <input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              aria-invalid={!valid}
              maxLength={7}
              className={cx(fieldCls, "w-[140px] font-mono text-[15px]")}
            />
            <input type="color" aria-label="Escolher cor" value={hex} onChange={(e) => setColor(e.target.value.toUpperCase())} className="h-11 w-12 cursor-pointer rounded-[10px] border border-line-strong bg-surface p-1" />
          </span>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-4 rounded-xl bg-canvas px-4 py-3">
        <span style={{ background: hex }} className="inline-flex h-11 items-center rounded-[10px] px-[18px] text-[15px] font-semibold text-white">Abrir turma</span>
        <span className={`flex items-center gap-1.5 text-sm font-semibold ${!valid ? "text-danger" : ok ? "text-success" : "text-warning"}`}>
          <Icon name={!valid ? "error" : ok ? "checkCircle" : "warning"} size={18} />
          {!valid ? "Use o formato #RRGGBB." : ok ? `Boa leitura com texto branco (contraste ${ratio.toFixed(1)}:1).` : `Pouco contraste com texto branco (${ratio.toFixed(1)}:1). Escolha um tom mais escuro.`}
        </span>
      </div>
    </div>
  );
}
