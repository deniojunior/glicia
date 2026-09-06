import { FormEvent, useEffect, useState } from "react";

import { createOnboardingProgress, type ClinicalSettings, type OnboardingProgress, type PersistedPreferences } from "../domain";
import { InstallGlicia } from "./install-glicia";
import { GliciaAvatar } from "./brand/glicia-avatar";
import { GliciaWordmark } from "./brand/glicia-wordmark";

interface OnboardingProps { initialProgress: OnboardingProgress | null; onProgress(progress: OnboardingProgress): Promise<void>; onComplete(preferences: PersistedPreferences): Promise<void>; }

const steps: readonly OnboardingProgress["step"][] = ["welcome", "how_it_works", "safety", "clinical_settings", "carbohydrate_ratios", "interaction_mode", "review"];
const mealFields = [["CAFE_DA_MANHA", "Café da manhã"], ["ALMOCO", "Almoço"], ["CAFE_DA_TARDE", "Café da tarde"], ["JANTAR", "Jantar"], ["CEIA", "Ceia"]] as const;

export function Onboarding({ initialProgress, onProgress, onComplete }: OnboardingProps) {
  const [progress, setProgress] = useState(() => initialProgress ?? createOnboardingProgress());
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  useEffect(() => { void onProgress(progress); }, [onProgress, progress]);

  function move(step: OnboardingProgress["step"]) { setProgress((current) => createOnboardingProgress({ ...current, step })); setError(null); }
  function updateSettings(values: Partial<ClinicalSettings>) {
    try { setProgress((current) => createOnboardingProgress({ ...current, clinical_settings: { ...current.clinical_settings, ...values } })); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Confira os valores informados."); }
  }
  function updateRatio(key: (typeof mealFields)[number][0], raw: string) {
    const value = parseValue(raw);
    if (value === null || value <= 0) { setError("Informe um RIC maior que zero."); return; }
    updateSettings({ carbohydrate_ratios: { ...progress.clinical_settings.carbohydrate_ratios, [key]: value } });
  }
  async function complete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setIsSaving(true);
    try { await onComplete({ version: 1, clinical_settings: progress.clinical_settings, interaction_mode: progress.interaction_mode }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar a configuração."); }
    finally { setIsSaving(false); }
  }
  const stepIndex = steps.indexOf(progress.step) + 1;

  return <main className="onboarding-shell"><header className="app-header onboarding-header"><GliciaWordmark /><span className="setup-progress">Preparação {stepIndex} de {steps.length}</span></header><section className="onboarding-conversation" aria-labelledby="setup-title"><div className={`onboarding-message ${progress.step === "welcome" ? "onboarding-welcome" : ""}`}>{progress.step === "welcome" ? <GliciaAvatar size="large" /> : null}<div className="onboarding-bubble"><p className="assistant-name">Glicia</p><h1 id="setup-title">{titleFor(progress.step)}</h1><OnboardingMessage step={progress.step} /></div></div><div className="onboarding-response">{progress.step === "welcome" ? <><InstallGlicia /><button className="primary-action" type="button" onClick={() => move("how_it_works")}>Vamos começar</button></> : null}{progress.step === "how_it_works" ? <StepActions back={() => move("welcome")} next={() => move("safety")} nextLabel="Entendi" /> : null}{progress.step === "safety" ? <StepActions back={() => move("how_it_works")} next={() => move("clinical_settings")} nextLabel="Continuar" /> : null}{progress.step === "clinical_settings" ? <ClinicalSettingsForm settings={progress.clinical_settings} onChange={updateSettings} onBack={() => move("safety")} onNext={() => move("carbohydrate_ratios")} /> : null}{progress.step === "carbohydrate_ratios" ? <RatiosForm settings={progress.clinical_settings} onChange={updateRatio} onBack={() => move("clinical_settings")} onNext={() => move("interaction_mode")} /> : null}{progress.step === "interaction_mode" ? <><div className="mode-selector" aria-label="Modo de interação"><button className={progress.interaction_mode === "preciso" ? "selected" : ""} type="button" onClick={() => setProgress((current) => createOnboardingProgress({ ...current, interaction_mode: "preciso" }))}><strong>Preciso</strong><span>Pergunta quando faltar algo importante.</span></button><button className={progress.interaction_mode === "rapido" ? "selected" : ""} type="button" onClick={() => setProgress((current) => createOnboardingProgress({ ...current, interaction_mode: "rapido" }))}><strong>Rápido</strong><span>Estima quando isso for minimamente confiável.</span></button></div><StepActions back={() => move("carbohydrate_ratios")} next={() => move("review")} nextLabel="Revisar ajustes" /></> : null}{progress.step === "review" ? <form onSubmit={complete}><Review settings={progress.clinical_settings} mode={progress.interaction_mode} /><p className="review-confirmation">Confirmo que estes valores foram definidos com minha equipe de saúde.</p><StepActions back={() => move("interaction_mode")} next={() => undefined} nextLabel={isSaving ? "Salvando…" : "Começar a conversar"} submit disabled={isSaving} /></form> : null}{error ? <p className="error-message" role="alert">{error}</p> : null}</div></section></main>;
}

function OnboardingMessage({ step }: { step: OnboardingProgress["step"] }) {
  if (step === "welcome") return <p>Oi, eu sou a Glicia. Vou te ajudar a contar os carboidratos das suas refeições e preparar seus ajustes.</p>;
  if (step === "how_it_works") return <><p>Você me conta os alimentos e as porções do seu jeito. Eu organizo a refeição e estimo os carboidratos usando a tabela da Glicia.</p><p>Antes de continuar, você sempre confere o resumo.</p></>;
  if (step === "safety") return <><p>Depois da sua confirmação, a Glicia calcula uma sugestão usando os parâmetros que você informou.</p><p>A IA ajuda a organizar a refeição. A sugestão vem do cálculo local. Não há leitura automática do sensor nem cálculo de insulina ativa.</p></>;
  if (step === "clinical_settings") return <p>Agora vamos conferir os valores já definidos com sua equipe de saúde. Eles não são sugestões da Glicia.</p>;
  if (step === "carbohydrate_ratios") return <p>Qual é o seu RIC em cada refeição? Ele indica quantos gramas de carboidrato correspondem a uma unidade de insulina.</p>;
  if (step === "interaction_mode") return <p>Como você prefere que eu conduza a conversa? Os dois modos mantêm a sua confirmação antes do cálculo.</p>;
  return <p>Confere seus ajustes antes de começarmos? Você poderá editá-los depois em Ajustes.</p>;
}

function ClinicalSettingsForm({ settings, onChange, onBack, onNext }: { settings: ClinicalSettings; onChange(values: Partial<ClinicalSettings>): void; onBack(): void; onNext(): void }) {
  function saveValue(key: Exclude<keyof ClinicalSettings, "carbohydrate_ratios">, raw: string) { const value = parseValue(raw); if (value !== null) onChange({ [key]: value }); }
  return <form onSubmit={(event) => { event.preventDefault(); onNext(); }} className="onboarding-form"><div className="settings-fields"><NumberField label="Glicemia-alvo" unit="mg/dL" value={settings.target_glucose} onChange={(value) => saveValue("target_glucose", value)} /><NumberField label="Fator de correção" unit="mg/dL por U" value={settings.correction_factor} onChange={(value) => saveValue("correction_factor", value)} /><NumberField label="Limite de hipoglicemia" unit="mg/dL" value={settings.hypoglycemia_threshold} onChange={(value) => saveValue("hypoglycemia_threshold", value)} /><NumberField label="Basal pela manhã" unit="U" value={settings.basal_morning_units} onChange={(value) => saveValue("basal_morning_units", value)} /></div><StepActions back={onBack} next={() => undefined} nextLabel="Continuar" submit /></form>;
}

function RatiosForm({ settings, onChange, onBack, onNext }: { settings: ClinicalSettings; onChange(key: (typeof mealFields)[number][0], raw: string): void; onBack(): void; onNext(): void }) {
  return <form onSubmit={(event) => { event.preventDefault(); onNext(); }} className="onboarding-form"><div className="settings-fields">{mealFields.map(([key, label]) => <NumberField key={key} label={`RIC do ${label.toLocaleLowerCase("pt-BR")}`} unit="g/U" value={settings.carbohydrate_ratios[key]} onChange={(value) => onChange(key, value)} />)}</div><StepActions back={onBack} next={() => undefined} nextLabel="Continuar" submit /></form>;
}

function Review({ settings, mode }: { settings: ClinicalSettings; mode: PersistedPreferences["interaction_mode"] }) { return <dl className="review-list"><div><dt>Glicemia-alvo</dt><dd>{settings.target_glucose} mg/dL</dd></div><div><dt>Fator de correção</dt><dd>{settings.correction_factor} mg/dL por U</dd></div><div><dt>Limite de hipoglicemia</dt><dd>{settings.hypoglycemia_threshold} mg/dL</dd></div><div><dt>Basal pela manhã</dt><dd>{settings.basal_morning_units} U</dd></div>{mealFields.map(([key, label]) => <div key={key}><dt>RIC do {label.toLocaleLowerCase("pt-BR")}</dt><dd>{settings.carbohydrate_ratios[key]} g/U</dd></div>)}<div><dt>Conversa</dt><dd>{mode === "preciso" ? "Preciso" : "Rápido"}</dd></div></dl>; }
function StepActions({ back, next, nextLabel, submit = false, disabled = false }: { back(): void; next(): void; nextLabel: string; submit?: boolean; disabled?: boolean }) { return <div className="setup-actions"><button className="secondary-action" type="button" onClick={back}>Voltar</button><button className="primary-action" type={submit ? "submit" : "button"} onClick={submit ? undefined : next} disabled={disabled}>{nextLabel}</button></div>; }
function NumberField({ label, unit, value, onChange }: { label: string; unit: string; value: number; onChange(value: string): void }) { const id = label.toLocaleLowerCase("pt-BR").replaceAll(/[^a-z0-9]+/g, "-"); const [draft, setDraft] = useState(String(value)); useEffect(() => setDraft(String(value)), [value]); return <label className="number-field" htmlFor={id}><span>{label}</span><span className="number-input"><input id={id} type="text" inputMode="decimal" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => onChange(draft)} /><em>{unit}</em></span></label>; }
function parseValue(value: string): number | null { const result = Number(value.replace(",", ".")); return Number.isFinite(result) && result >= 0 ? result : null; }
function titleFor(step: OnboardingProgress["step"]): string { const titles: Record<OnboardingProgress["step"], string> = { welcome: "Que bom ter você aqui.", how_it_works: "Eu ajudo a organizar a refeição.", safety: "Você confirma cada passo.", clinical_settings: "Vamos conferir seus parâmetros?", carbohydrate_ratios: "Agora, seus RICs.", interaction_mode: "Escolha o ritmo da conversa.", review: "Tudo pronto para começar." }; return titles[step]; }
