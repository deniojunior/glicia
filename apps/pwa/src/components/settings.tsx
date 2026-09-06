import { FormEvent, useState } from "react";

import { createClinicalSettings, type PersistedPreferences } from "../domain";
import { GliciaWordmark } from "./brand/glicia-wordmark";

interface SettingsProps {
  preferences: PersistedPreferences;
  onSave(preferences: PersistedPreferences): Promise<void>;
  onBack(): void;
}

const ratios = [
  ["CAFE_DA_MANHA", "Café da manhã"],
  ["ALMOCO", "Almoço"],
  ["CAFE_DA_TARDE", "Café da tarde"],
  ["JANTAR", "Jantar"],
  ["CEIA", "Ceia"]
] as const;

export function Settings({ preferences, onSave, onBack }: SettingsProps) {
  const [draft, setDraft] = useState(preferences);
  const [message, setMessage] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await onSave({ ...draft, interaction_mode: "preciso", clinical_settings: createClinicalSettings(draft.clinical_settings) });
      setMessage("Configurações salvas na sua conta.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar.");
    }
  }

  return <main className="onboarding-shell">
    <header className="app-header"><GliciaWordmark /><button className="back-action" type="button" onClick={onBack}><span aria-hidden="true">←</span> Voltar ao chat</button></header>
    <section className="setup-content" aria-labelledby="settings-title">
      <h1 id="settings-title">Configurações</h1><p>Altere somente os valores definidos pela sua equipe de saúde.</p>
      <form onSubmit={save}>
        <div className="settings-fields">
          {ratios.map(([key, label]) => <label key={key}>{label}<input inputMode="decimal" value={draft.clinical_settings.carbohydrate_ratios[key]} onChange={(event) => { const value = Number(event.target.value.replace(",", ".")); if (Number.isFinite(value)) setDraft((current) => ({ ...current, clinical_settings: { ...current.clinical_settings, carbohydrate_ratios: { ...current.clinical_settings.carbohydrate_ratios, [key]: value } } })); }} /></label>)}
        </div>
        <button className="primary-action" type="submit">Salvar alterações</button>
      </form>
      {message ? <p className="status-message" role="status">{message}</p> : null}
    </section>
  </main>;
}
