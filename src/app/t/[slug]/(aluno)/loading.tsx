/** Esqueleto enquanto a tela do aluno carrega (estado "Carregando" do protótipo). */
export default function Loading() {
  const bar = "rounded-md bg-sunken";
  return (
    <div aria-busy="true" aria-label="Carregando" className="flex flex-col gap-4 px-5 py-3 md:px-0">
      <span className={`h-7 w-3/5 ${bar}`} />
      <span className={`h-3.5 w-4/5 ${bar}`} />
      <span className="h-[220px] rounded-3xl bg-sunken" />
      <span className={`mt-2 h-4 w-2/5 ${bar}`} />
      <span className="h-[72px] rounded-2xl bg-sunken" />
      <span className="h-[72px] rounded-2xl bg-sunken" />
      <span className="text-center text-[13px] text-ink-subtle">Carregando suas informações…</span>
    </div>
  );
}
