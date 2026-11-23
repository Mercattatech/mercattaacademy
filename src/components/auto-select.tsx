"use client";

import type { SelectHTMLAttributes } from "react";

/** Select de filtro (GET) que envia o formulário ao mudar. Sem JS, o botão "Filtrar" ao lado continua funcionando. */
export function AutoSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
