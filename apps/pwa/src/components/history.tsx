import { useEffect, useState } from "react";
import type { MealHistoryRepository, MealRecord } from "../application";
import { historyPage } from "../application/history-search";
import { GliciaWordmark } from "./brand/glicia-wordmark";

export function History({ repository, onBack }: { repository: MealHistoryRepository; onBack(): void }) {
  const [records, setRecords] = useState<readonly MealRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setError(null);
    void repository.list().then((items) => { if (active) setRecords(items); }).catch(() => { if (active) setError("Não consegui abrir seu histórico. Tente novamente."); });
    return () => { active = false; };
  }, [repository, retry]);
  async function remove(id?: string) {
    if (!window.confirm(id ? "Excluir esta refeição do histórico?" : "Apagar todo o histórico? Esta ação não pode ser desfeita.")) return;
    setBusy(true);
    setError(null);
    try {
      if (id) await repository.deleteRecord(id); else await repository.clearRecords();
      setRecords((current) => id ? current?.filter((record) => record.id !== id) ?? [] : []);
    } catch { setError("Não consegui excluir. Tente novamente."); }
    finally { setBusy(false); }
  }
  const result = historyPage(records ?? [], search, page);
  return <main className="onboarding-shell"><header className="app-header"><GliciaWordmark /><button className="back-action" type="button" onClick={onBack}><span aria-hidden="true">←</span> Voltar ao chat</button></header>
    <section className="history-content" aria-labelledby="history-title">
      <h1 id="history-title">Suas refeições</h1><p>Um lugar para lembrar do que você comeu.</p>
      <label className="history-search">Buscar no histórico<input type="search" value={search} placeholder="Alimento, refeição ou data" onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
      {error && <p className="error-message" role="alert">{error} {records === null && <button type="button" onClick={() => setRetry((value) => value + 1)}>Tentar novamente</button>}</p>}
      {records === null ? !error && <p role="status">Abrindo suas refeições…</p> : <>
        <p className="history-count" role="status">{result.total} {result.total === 1 ? "refeição" : "refeições"}{search ? " na busca" : " no histórico"}</p>
        {result.total === 0 ? <div className="empty-history"><p>{records.length ? "Não encontrei refeições com essa busca." : "As refeições que você confirmar na conversa aparecem aqui."}</p><button className="text-action" type="button" onClick={records.length ? () => setSearch("") : onBack}>{records.length ? "Limpar busca" : "Vamos conversar"}</button></div> : <ol className="meal-history-list">{result.records.map((record) => <li key={record.id}>
          <header><h2>{record.meal_type.replaceAll("_", " ").toLocaleLowerCase("pt-BR")}</h2><time dateTime={record.created_at}>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(record.created_at))}</time></header>
          <p className="history-foods">{record.meal_items.length ? record.meal_items.map((item) => item.name).join(", ") : record.meal_input}</p>
          <dl className="meal-history-values"><div><dt>Carboidratos</dt><dd>{record.carbohydrates} g</dd></div><div><dt>Glicemia</dt><dd>{record.glucose} mg/dL</dd></div><div><dt>Dose sugerida</dt><dd>{record.suggested_dose} U</dd></div><div><dt>Dose aplicada</dt><dd>{record.applied_dose === null ? "Não informada" : record.applied_dose + " U"}</dd></div></dl>
          <details><summary>Ver resumo</summary><p className="history-summary">{record.assistant_summary}</p><button className="danger-text-action" disabled={busy} type="button" onClick={() => void remove(record.id)}>Excluir refeição</button></details>
        </li>)}</ol>}
        {result.pages > 1 && <nav className="history-pagination" aria-label="Páginas do histórico"><button type="button" disabled={result.page === 1} onClick={() => setPage(result.page - 1)}>Anterior</button><span>Página {result.page} de {result.pages}</span><button type="button" disabled={result.page === result.pages} onClick={() => setPage(result.page + 1)}>Próxima</button></nav>}
        {records.length > 0 && <details className="history-management"><summary>Gerenciar histórico</summary><button className="danger-text-action" disabled={busy} type="button" onClick={() => void remove()}>Apagar todo o histórico</button></details>}
      </>}
    </section></main>;
}
