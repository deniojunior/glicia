import { FormEvent, useEffect, useState } from "react";

import {
  createOnboardingProgress,
  type OnboardingProgress,
  type PersistedPreferences
} from "../domain";
import { gliciaIconUrl } from "../config/app-urls";
import { InstallGlicia } from "./install-glicia";

interface OnboardingProps {
  initialProgress: OnboardingProgress | null;
  onProgress(progress: OnboardingProgress): Promise<void>;
  onComplete(preferences: PersistedPreferences, apiKey: string): Promise<void>;
}

const mealFields = [
  ["CAFE_DA_MANHA", "RIC do café da manhã"],
  ["ALMOCO", "RIC do almoço"],
  ["CAFE_DA_TARDE", "RIC do café da tarde"],
  ["JANTAR", "RIC do jantar"],
  ["CEIA", "RIC da ceia"]
] as const;

export function Onboarding({ initialProgress, onProgress, onComplete }: OnboardingProps) {
  const [progress, setProgress] = useState(() => initialProgress ?? createOnboardingProgress());
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => { void onProgress(progress); }, [onProgress, progress]);

  function updateRatio(key: (typeof mealFields)[number][0], raw: string) {
    try {
      const value = Number(raw.replace(",", "."));
      setProgress((current) => createOnboardingProgress({ ...current, clinical_settings: { ...current.clinical_settings, carbohydrate_ratios: { ...current.clinical_settings.carbohydrate_ratios, [key]: value } } }));
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Confira os valores informados."); }
  }

  function move(step: OnboardingProgress["step"]) {
    try {
      setProgress((current) => createOnboardingProgress({ ...current, step }));
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Confira os campos."); }
  }

  async function complete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiKey.trim()) { setError("Cole sua chave da OpenAI para concluir a configuração."); return; }
    setIsSaving(true);
    try {
      await onComplete({ version: 1, clinical_settings: progress.clinical_settings, interaction_mode: progress.interaction_mode, provider: progress.provider }, apiKey.trim());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar a configuração."); }
    finally { setIsSaving(false); }
  }

  return <main className="onboarding-shell">
    <header className="app-header"><span className="brand"><img src={gliciaIconUrl} width="44" height="44" alt="" /><span>Glicia</span></span><span className="setup-progress">Configuração {stepNumber(progress.step)} de 4</span></header>
    <section className="setup-content" aria-labelledby="setup-title">
      {progress.step === "welcome" ? <><h1 id="setup-title">Vamos deixar a Glicia pronta para você.</h1><p>Você vai informar sua chave de IA e os parâmetros já definidos com sua equipe de saúde. Leva poucos minutos.</p><InstallGlicia /><button className="primary-action" type="button" onClick={() => move("provider")}>Começar configuração</button></> : null}
      {progress.step === "provider" ? <form onSubmit={(event) => { event.preventDefault(); if (!apiKey.trim()) { setError("Cole sua chave da OpenAI para continuar."); return; } move("carbohydrate_ratios"); }}><h1 id="setup-title">Conecte sua OpenAI.</h1><p>A chave será validada e guardada de forma cifrada na sua conta. Ela nunca volta para o navegador. Crie uma em platform.openai.com/api-keys.</p><label htmlFor="api-key">Chave da OpenAI</label><div className="key-row"><input id="api-key" type={showApiKey ? "text" : "password"} autoComplete="current-password" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-..." /><button className="secondary-action" type="button" onClick={() => setShowApiKey((current) => !current)}>{showApiKey ? "Ocultar" : "Mostrar"}</button></div><div className="setup-actions"><button className="secondary-action" type="button" onClick={() => move("welcome")}>Voltar</button><button className="primary-action" type="submit">Continuar</button></div></form> : null}
      {progress.step === "carbohydrate_ratios" ? <form onSubmit={(event) => { event.preventDefault(); move("review"); }}><h1 id="setup-title">Seus RICs.</h1><p>Informe somente os valores que sua equipe definiu para cada refeição.</p><div className="settings-fields">{mealFields.map(([key, label]) => <NumberField key={key} label={label} value={progress.clinical_settings.carbohydrate_ratios[key]} onChange={(value) => updateRatio(key, value)} />)}</div><div className="mode-selector" aria-label="Modo de interação"><button className={progress.interaction_mode === "preciso" ? "selected" : ""} type="button" onClick={() => setProgress((current) => createOnboardingProgress({ ...current, interaction_mode: "preciso" }))}>Preciso</button><button className={progress.interaction_mode === "rapido" ? "selected" : ""} type="button" onClick={() => setProgress((current) => createOnboardingProgress({ ...current, interaction_mode: "rapido" }))}>Rápido</button></div><div className="setup-actions"><button className="secondary-action" type="button" onClick={() => move("provider")}>Voltar</button><button className="primary-action" type="submit">Revisar</button></div></form> : null}
      {progress.step === "review" ? <form onSubmit={complete}><h1 id="setup-title">Tudo certo para começar.</h1><p>Você configurou seus cinco RICs e o modo {progress.interaction_mode === "preciso" ? "Preciso" : "Rápido"}. Poderá editar os detalhes depois.</p><div className="setup-actions"><button className="secondary-action" type="button" onClick={() => move("carbohydrate_ratios")}>Editar RICs</button><button className="primary-action" type="submit" disabled={isSaving}>{isSaving ? "Salvando…" : "Começar"}</button></div></form> : null}
      {error ? <p className="error-message" role="alert">{error}</p> : null}
    </section>
  </main>;
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange(value: string): void }) {
  const id = label.toLocaleLowerCase("pt-BR").replaceAll(/[^a-z0-9]+/g, "-");
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return <div><label htmlFor={id}>{label}</label><input id={id} type="text" inputMode="decimal" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => onChange(draft)} /></div>;
}

function stepNumber(step: OnboardingProgress["step"]): number { return ["welcome", "provider", "carbohydrate_ratios", "review"].indexOf(step) + 1; }
