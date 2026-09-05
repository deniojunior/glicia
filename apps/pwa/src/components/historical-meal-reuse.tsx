import { FormEvent, useState } from "react";

import { createReusedMealTurn, historicalMealDescription, type MealRecord } from "../application";
import type { ConversationTurn, GlucoseTrend } from "../domain";

export function HistoricalMealReuse({ candidates, onSubmit, onCancel }: {
  candidates: readonly MealRecord[];
  onSubmit(description: string, turn: ConversationTurn): void;
  onCancel(): void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(candidates.length === 1 ? candidates[0].id : null);
  const [glucose, setGlucose] = useState("");
  const [trend, setTrend] = useState<GlucoseTrend | "">("");
  const [error, setError] = useState<string | null>(null);
  const selected = candidates.find((candidate) => candidate.id === selectedId) ?? null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (!selected) throw new Error("Escolha qual refeição deseja repetir.");
      const description = `Repetição confirmada de ${historicalMealDescription(selected)}`;
      onSubmit(description, createReusedMealTurn(selected, glucose, trend));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Confira os dados atuais.");
    }
  }

  return <form className="historical-reuse" onSubmit={submit}>
    <div className="manual-heading"><div><h2>{candidates.length === 1 ? "É esta refeição?" : "Qual refeição você quer repetir?"}</h2><p>Recuperei registros de ontem. Confirme a comida e informe os dados de agora.</p></div><button className="text-action" type="button" onClick={onCancel}>Cancelar</button></div>
    <div className="historical-candidates" role="radiogroup" aria-label="Refeições encontradas">
      {candidates.map((candidate) => <button key={candidate.id} className={candidate.id === selectedId ? "historical-candidate selected" : "historical-candidate"} type="button" role="radio" aria-checked={candidate.id === selectedId} onClick={() => { setSelectedId(candidate.id); setError(null); }}>
        <span><time dateTime={candidate.created_at}>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(candidate.created_at))}</time><strong>{historicalMealDescription(candidate)}</strong></span>
        <b>{candidate.carbohydrates} g</b>
      </button>)}
    </div>
    {selected ? <>
      {selected.meal_items.length > 0 ? <ul className="historical-items">{selected.meal_items.map((item, index) => <li key={`${item.name}-${index}`}><span>{item.name} · {item.portion}</span><strong>{item.carbohydrates} g</strong></li>)}</ul> : <p className="history-legacy-note">Este registro antigo não possui itens separados. Confira cuidadosamente o resumo antes de continuar.</p>}
      <div className="manual-grid">
        <label>Glicemia atual (mg/dL)<input inputMode="decimal" value={glucose} onChange={(event) => setGlucose(event.target.value)} placeholder="Ex.: 120" autoFocus /></label>
        <label>Tendência atual<select value={trend} onChange={(event) => setTrend(event.target.value as GlucoseTrend)}><option value="">Selecione</option><option value="SUBINDO_RAPIDO">Subindo rápido</option><option value="SUBINDO">Subindo</option><option value="ESTAVEL">Estável</option><option value="CAINDO">Caindo</option><option value="CAINDO_RAPIDO">Caindo rápido</option><option value="NAO_INFORMADA">Não informada</option></select></label>
      </div>
    </> : null}
    {error ? <p className="error-message" role="alert">{error}</p> : null}
    <button className="primary-action" type="submit" disabled={!selected}>Revisar com os dados atuais</button>
    <p className="reuse-safety-note">A dose anterior não será reutilizada. A Glicia fará um novo cálculo depois da confirmação.</p>
  </form>;
}
