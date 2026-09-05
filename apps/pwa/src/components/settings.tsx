import { FormEvent, useState } from "react";

import { createClinicalSettings, type InteractionMode, type PersistedPreferences } from "../domain";
import { gliciaIconUrl } from "../config/app-urls";

interface SettingsProps {
  preferences: PersistedPreferences;
  onSave(preferences: PersistedPreferences): Promise<void>;
  onSignOut(): Promise<void>;
  onDeleteAccount(): Promise<void>;
  onBack(): void;
}

const ratios = [
  ["CAFE_DA_MANHA", "Café da manhã"],
  ["ALMOCO", "Almoço"],
  ["CAFE_DA_TARDE", "Café da tarde"],
  ["JANTAR", "Jantar"],
  ["CEIA", "Ceia"]
] as const;

export function Settings({ preferences, onSave, onSignOut, onDeleteAccount, onBack }: SettingsProps) {
  const [draft, setDraft] = useState(preferences);
  const [message, setMessage] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await onSave({ ...draft, clinical_settings: createClinicalSettings(draft.clinical_settings) });
      setMessage("Configurações salvas na sua conta.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar.");
    }
  }

  async function deleteAccount() {
    if (deleteConfirmation !== "EXCLUIR") return;
    setIsDeleting(true);
    setMessage(null);
    try { await onDeleteAccount(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível excluir sua conta."); setIsDeleting(false); }
  }

  return <main className="onboarding-shell">
    <header className="app-header"><span className="brand"><img src={gliciaIconUrl} width="44" height="44" alt="" /><span>Glicia</span></span><button className="text-action" type="button" onClick={onBack}>Voltar</button></header>
    <section className="setup-content" aria-labelledby="settings-title">
      <h1 id="settings-title">Configurações</h1><p>Altere somente os valores definidos pela sua equipe de saúde.</p>
      <form onSubmit={save}>
        <div className="settings-fields">
          {ratios.map(([key, label]) => <label key={key}>{label}<input inputMode="decimal" value={draft.clinical_settings.carbohydrate_ratios[key]} onChange={(event) => { const value = Number(event.target.value.replace(",", ".")); if (Number.isFinite(value)) setDraft((current) => ({ ...current, clinical_settings: { ...current.clinical_settings, carbohydrate_ratios: { ...current.clinical_settings.carbohydrate_ratios, [key]: value } } })); }} /></label>)}
        </div>
        <div className="mode-selector" aria-label="Modo de interação"><button className={draft.interaction_mode === "preciso" ? "selected" : ""} type="button" onClick={() => setDraft((current) => ({ ...current, interaction_mode: "preciso" as InteractionMode }))}>Preciso</button><button className={draft.interaction_mode === "rapido" ? "selected" : ""} type="button" onClick={() => setDraft((current) => ({ ...current, interaction_mode: "rapido" as InteractionMode }))}>Rápido</button></div>
        <button className="primary-action" type="submit">Salvar alterações</button>
      </form>
      <button className="text-action account-sign-out" type="button" onClick={() => void onSignOut()}>Sair da conta</button>
      <section className="danger-zone" aria-labelledby="delete-account-title"><h2 id="delete-account-title">Excluir conta e dados</h2><p>Remove definitivamente configurações, memória alimentar, histórico e acesso. Esta ação não pode ser desfeita.</p><label htmlFor="delete-confirmation">Digite EXCLUIR para confirmar</label><input id="delete-confirmation" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} autoComplete="off" /><button className="danger-action" type="button" disabled={deleteConfirmation !== "EXCLUIR" || isDeleting} onClick={() => void deleteAccount()}>{isDeleting ? "Excluindo…" : "Excluir minha conta"}</button></section>
      {message ? <p className="status-message" role="status">{message}</p> : null}
    </section>
  </main>;
}
