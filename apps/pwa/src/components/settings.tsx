import { FormEvent, useState } from "react";

import { createClinicalSettings, type ClinicalSettings, type PersistedPreferences } from "../domain";
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
  const [draft, setDraft] = useState(() => createSettingsDraft(preferences.clinical_settings));
  const [message, setMessage] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const clinicalSettings = createClinicalSettings({
        ...preferences.clinical_settings,
        target_glucose: parseRequiredNumber(draft.target_glucose),
        correction_factor: parseRequiredNumber(draft.correction_factor),
        hypoglycemia_threshold: parseRequiredNumber(draft.hypoglycemia_threshold),
        carbohydrate_ratios: Object.fromEntries(ratios.map(([key]) => [key, parseRequiredNumber(draft.carbohydrate_ratios[key])])) as ClinicalSettings["carbohydrate_ratios"]
      });
      await onSave({ ...preferences, interaction_mode: "preciso", clinical_settings: clinicalSettings });
      setMessage("Configurações salvas na sua conta.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar.");
    }
  }

  return <main className="onboarding-shell">
    <header className="app-header"><GliciaWordmark /><button className="back-action" type="button" onClick={onBack}><span aria-hidden="true">←</span> Voltar ao chat</button></header>
    <section className="setup-content" aria-labelledby="settings-title">
      <h1 id="settings-title">Ajustes do tratamento</h1><p>Consulte e altere somente os valores definidos pela sua equipe de saúde.</p>
      <form onSubmit={save}>
        <fieldset className="settings-group">
          <legend>Parâmetros de glicemia</legend>
          <p>Esses valores são usados no cálculo e nas travas de segurança da Glicia.</p>
          <div className="settings-fields">
            <SettingsField label="Glicemia-alvo" unit="mg/dL" value={draft.target_glucose} onChange={(value) => setDraft((current) => ({ ...current, target_glucose: value }))} />
            <SettingsField label="Fator de correção" unit="mg/dL por U" value={draft.correction_factor} onChange={(value) => setDraft((current) => ({ ...current, correction_factor: value }))} />
            <SettingsField label="Limite de hipoglicemia" unit="mg/dL" value={draft.hypoglycemia_threshold} onChange={(value) => setDraft((current) => ({ ...current, hypoglycemia_threshold: value }))} />
          </div>
        </fieldset>
        <fieldset className="settings-group">
          <legend>Relação insulina-carboidrato (RIC)</legend>
          <p>RIC é a quantidade de carboidrato, em gramas, coberta por uma unidade de insulina.</p>
        <div className="settings-fields">
          {ratios.map(([key, label]) => <SettingsField key={key} label={label} unit="g por 1 U" value={draft.carbohydrate_ratios[key]} onChange={(value) => setDraft((current) => ({ ...current, carbohydrate_ratios: { ...current.carbohydrate_ratios, [key]: value } }))} />)}
        </div>
        </fieldset>
        <button className="primary-action" type="submit">Salvar alterações</button>
      </form>
      {message ? <p className="status-message" role="status">{message}</p> : null}
    </section>
  </main>;
}

interface SettingsDraft {
  target_glucose: string;
  correction_factor: string;
  hypoglycemia_threshold: string;
  carbohydrate_ratios: Record<keyof ClinicalSettings["carbohydrate_ratios"], string>;
}

function createSettingsDraft(settings: ClinicalSettings): SettingsDraft {
  return {
    target_glucose: String(settings.target_glucose),
    correction_factor: String(settings.correction_factor),
    hypoglycemia_threshold: String(settings.hypoglycemia_threshold),
    carbohydrate_ratios: Object.fromEntries(ratios.map(([key]) => [key, String(settings.carbohydrate_ratios[key])])) as SettingsDraft["carbohydrate_ratios"]
  };
}

function SettingsField({ label, unit, value, onChange }: { label: string; unit: string; value: string; onChange(value: string): void }) {
  const id = `settings-${label.toLocaleLowerCase("pt-BR").replaceAll(/[^a-z0-9]+/g, "-")}`;
  return <label className="number-field" htmlFor={id}><span>{label}</span><span className="number-input"><input id={id} type="text" inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} /><em>{unit}</em></span></label>;
}

function parseRequiredNumber(value: string): number {
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed)) throw new Error("Preencha todos os ajustes com números válidos.");
  return parsed;
}
