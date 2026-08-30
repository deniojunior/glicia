import { FormEvent, useState } from "react";

import { createClinicalSettings, type InteractionMode, type PersistedPreferences } from "../domain";

interface SettingsProps {
  preferences: PersistedPreferences;
  hasApiKey: boolean;
  onSave(preferences: PersistedPreferences): Promise<void>;
  onSetApiKey(apiKey: string): void;
  onBack(): void;
}

const ratios = [
  ["CAFE_DA_MANHA", "Café da manhã"], ["ALMOCO", "Almoço"], ["CAFE_DA_TARDE", "Café da tarde"], ["JANTAR", "Jantar"], ["CEIA", "Ceia"]
] as const;

export function Settings({ preferences, hasApiKey, onSave, onSetApiKey, onBack }: SettingsProps) {
  const [draft, setDraft] = useState(preferences);
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try { await onSave({ ...draft, clinical_settings: createClinicalSettings(draft.clinical_settings) }); setMessage("Configurações salvas neste aparelho."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível salvar."); }
  }

  return <main className="onboarding-shell"><header className="app-header"><span className="brand"><img src="/icons/glicia-192.png" width="44" height="44" alt="" /><span>Glicia</span></span><button className="text-action" type="button" onClick={onBack}>Voltar</button></header><section className="setup-content" aria-labelledby="settings-title"><h1 id="settings-title">Configurações</h1><p>Altere somente os valores definidos pela sua equipe de saúde.</p><form onSubmit={save}><div className="settings-fields"><label htmlFor="model">Modelo OpenAI<input id="model" value={draft.provider.model} onChange={(event) => setDraft((current) => ({ ...current, provider: { ...current.provider, model: event.target.value } }))} /></label>{ratios.map(([key, label]) => <label key={key}>{label}<input inputMode="decimal" value={draft.clinical_settings.carbohydrate_ratios[key]} onChange={(event) => { const value = Number(event.target.value.replace(",", ".")); if (Number.isFinite(value)) setDraft((current) => ({ ...current, clinical_settings: { ...current.clinical_settings, carbohydrate_ratios: { ...current.clinical_settings.carbohydrate_ratios, [key]: value } } })); }} /></label>)}</div><div className="mode-selector" aria-label="Modo de interação"><button className={draft.interaction_mode === "preciso" ? "selected" : ""} type="button" onClick={() => setDraft((current) => ({ ...current, interaction_mode: "preciso" as InteractionMode }))}>Preciso</button><button className={draft.interaction_mode === "rapido" ? "selected" : ""} type="button" onClick={() => setDraft((current) => ({ ...current, interaction_mode: "rapido" as InteractionMode }))}>Rápido</button></div><button className="primary-action" type="submit">Salvar alterações</button></form><section className="key-settings" aria-labelledby="key-title"><h2 id="key-title">Chave OpenAI</h2><p>{hasApiKey ? "Chave disponível só nesta sessão." : "Nenhuma chave disponível nesta sessão."}</p><label htmlFor="settings-api-key">Cole uma chave para esta sessão</label><div className="key-row"><input id="settings-api-key" type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-..." /><button type="button" className="secondary-action" disabled={!apiKey.trim()} onClick={() => { onSetApiKey(apiKey.trim()); setApiKey(""); setMessage("Chave pronta para esta sessão."); }}>Usar chave</button></div></section>{message ? <p className="status-message" role="status">{message}</p> : null}</section></main>;
}
