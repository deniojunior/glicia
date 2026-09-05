import { FormEvent, useState } from "react";

import { createManualMealTurn, type ManualMealInput } from "../application";
import type { ConversationTurn } from "../domain";

const initialInput: ManualMealInput = {
  carbohydrates: "",
  glucose: "",
  glucoseTrend: "",
  mealType: ""
};

export function ManualMealForm({ onSubmit, onCancel }: {
  onSubmit(description: string, turn: ConversationTurn): void;
  onCancel(): void;
}) {
  const [description, setDescription] = useState("");
  const [input, setInput] = useState<ManualMealInput>(initialInput);
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (!description.trim()) throw new Error("Descreva brevemente a refeição.");
      onSubmit(description.trim(), createManualMealTurn(input));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Confira os dados informados.");
    }
  }

  return <form className="manual-meal" onSubmit={submit}>
    <div className="manual-heading"><div><h2>Informar sem IA</h2><p>Preencha os dados que você já conhece. O cálculo continua local e exige confirmação.</p></div><button className="text-action" type="button" onClick={onCancel}>Voltar à conversa</button></div>
    <label>Descrição da refeição<input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} placeholder="Ex.: arroz, feijão e frango" /></label>
    <div className="manual-grid">
      <label>Carboidratos (g)<input inputMode="decimal" value={input.carbohydrates} onChange={(event) => setInput((current) => ({ ...current, carbohydrates: event.target.value }))} placeholder="Ex.: 45" /></label>
      <label>Glicemia (mg/dL)<input inputMode="decimal" value={input.glucose} onChange={(event) => setInput((current) => ({ ...current, glucose: event.target.value }))} placeholder="Ex.: 120" /></label>
      <label>Tendência<select value={input.glucoseTrend} onChange={(event) => setInput((current) => ({ ...current, glucoseTrend: event.target.value as ManualMealInput["glucoseTrend"] }))}><option value="">Selecione</option><option value="SUBINDO_RAPIDO">Subindo rápido</option><option value="SUBINDO">Subindo</option><option value="ESTAVEL">Estável</option><option value="CAINDO">Caindo</option><option value="CAINDO_RAPIDO">Caindo rápido</option><option value="NAO_INFORMADA">Não informada</option></select></label>
      <label>Tipo de refeição<select value={input.mealType} onChange={(event) => setInput((current) => ({ ...current, mealType: event.target.value as ManualMealInput["mealType"] }))}><option value="">Selecione</option><option value="CAFE_DA_MANHA">Café da manhã</option><option value="ALMOCO">Almoço</option><option value="CAFE_DA_TARDE">Café da tarde</option><option value="JANTAR">Jantar</option><option value="CEIA">Ceia</option></select></label>
    </div>
    {error ? <p className="error-message" role="alert">{error}</p> : null}
    <button className="primary-action" type="submit">Revisar dados</button>
  </form>;
}
