import { FormEvent, useEffect, useState } from "react";

import { createOnboardingProgress, type ClinicalSettings, type OnboardingProgress, type PersistedPreferences } from "../domain";
import { InstallGlicia } from "./install-glicia";
import { GliciaAvatar } from "./brand/glicia-avatar";
import { GliciaWordmark } from "./brand/glicia-wordmark";

interface OnboardingProps { initialProgress: OnboardingProgress | null; onProgress(progress: OnboardingProgress): Promise<void>; onComplete(preferences: PersistedPreferences): Promise<void>; }

const steps: readonly OnboardingProgress["step"][] = ["welcome", "how_it_works", "safety", "clinical_settings", "carbohydrate_ratios", "review"];
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
    try { await onComplete({ version: 1, clinical_settings: progress.clinical_settings, interaction_mode: "preciso" }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar a configuração."); }
    finally { setIsSaving(false); }
  }
  const stepIndex = steps.indexOf(progress.step) + 1;

  return <main className="onboarding-shell"><header className="app-header onboarding-header"><GliciaWordmark /><span className="setup-progress">Preparação {stepIndex} de {steps.length}</span></header><section className="onboarding-conversation" aria-labelledby="setup-title"><div className={`onboarding-message ${progress.step === "welcome" ? "onboarding-welcome" : ""}`}>{progress.step === "welcome" ? <GliciaAvatar size="large" /> : null}<div className="onboarding-bubble"><p className="assistant-name">Glicia</p><h1 id="setup-title">{titleFor(progress.step)}</h1><OnboardingMessage step={progress.step} /></div></div><div className="onboarding-response">{progress.step === "welcome" ? <><InstallGlicia /><button className="primary-action" type="button" onClick={() => move("how_it_works")}>Vamos começar</button></> : null}{progress.step === "how_it_works" ? <StepActions back={() => move("welcome")} next={() => move("safety")} nextLabel="Entendi" /> : null}{progress.step === "safety" ? <StepActions back={() => move("how_it_works")} next={() => move("clinical_settings")} nextLabel="Continuar" /> : null}{progress.step === "clinical_settings" ? <ClinicalSettingsForm settings={progress.clinical_settings} onChange={updateSettings} onBack={() => move("safety")} onNext={() => move("carbohydrate_ratios")} /> : null}{progress.step === "carbohydrate_ratios" ? <RatiosForm settings={progress.clinical_settings} onChange={updateRatio} onBack={() => move("clinical_settings")} onNext={() => move("review")} /> : null}{progress.step === "review" ? <form onSubmit={complete}><Review settings={progress.clinical_settings} /><p className="review-confirmation">Confirmo que estes valores foram definidos com minha equipe de saúde.</p><StepActions back={() => move("carbohydrate_ratios")} next={() => undefined} nextLabel={isSaving ? "Salvando…" : "Começar a conversar"} submit disabled={isSaving} /></form> : null}{error ? <p className="error-message" role="alert">{error}</p> : null}</div></section></main>;
}

function OnboardingMessage({ step }: { step: OnboardingProgress["step"] }) {
  if (step === "welcome") return <><p>Oi, eu sou a Glicia. Sabe o que é mais chato na contagem de carboidratos? Ficar procurando alimento por alimento na tabela, somando tudo e depois fazendo o cálculo da dose.</p><p>Eu estou aqui para deixar essa parte mais simples com você.</p></>;
  if (step === "how_it_works") return <><p>Você me conta o que vai comer e eu consulto exclusivamente a tabela de alimentos da Sociedade Brasileira de Diabetes (SBD). Não invento nem estimo valores: quando faltar uma informação importante, eu pergunto.</p><p>Assim, a IA ajuda na busca dos dados, mas você sempre confere o resumo antes do cálculo.</p></>;
  if (step === "safety") return <><p>Depois da sua confirmação, eu faço o cálculo com os dados do seu tratamento — glicemia, RIC, fator de correção e demais parâmetros — e mostro uma sugestão de dose.</p><p>É rápido, simples e seguro: a Glicia não lê seu sensor, não aplica insulina e não substitui sua equipe de saúde.</p></>;
  if (step === "clinical_settings") return <p>Agora vamos conferir os valores já definidos com sua equipe de saúde. Eles não são sugestões da Glicia.</p>;
  if (step === "carbohydrate_ratios") return <p>Qual é o seu RIC em cada refeição? Ele indica quantos gramas de carboidrato correspondem a uma unidade de insulina.</p>;
  return <p>Confere seus ajustes antes de começarmos? Você poderá editá-los depois em Ajustes.</p>;
}

function ClinicalSettingsForm({ settings, onChange, onBack, onNext }: { settings: ClinicalSettings; onChange(values: Partial<ClinicalSettings>): void; onBack(): void; onNext(): void }) {
  function saveValue(key: Exclude<keyof ClinicalSettings, "carbohydrate_ratios">, raw: string) { const value = parseValue(raw); if (value !== null) onChange({ [key]: value }); }
  return <form onSubmit={(event) => { event.preventDefault(); onNext(); }} className="onboarding-form"><div className="settings-fields"><NumberField label="Glicemia-alvo" unit="mg/dL" value={settings.target_glucose} onChange={(value) => saveValue("target_glucose", value)} /><NumberField label="Fator de correção" unit="mg/dL por U" value={settings.correction_factor} onChange={(value) => saveValue("correction_factor", value)} /><NumberField label="Limite de hipoglicemia" unit="mg/dL" value={settings.hypoglycemia_threshold} onChange={(value) => saveValue("hypoglycemia_threshold", value)} /><NumberField label="Basal pela manhã" unit="U" value={settings.basal_morning_units} onChange={(value) => saveValue("basal_morning_units", value)} /></div><StepActions back={onBack} next={() => undefined} nextLabel="Continuar" submit /></form>;
}

function RatiosForm({ settings, onChange, onBack, onNext }: { settings: ClinicalSettings; onChange(key: (typeof mealFields)[number][0], raw: string): void; onBack(): void; onNext(): void }) {
  return <form onSubmit={(event) => { event.preventDefault(); onNext(); }} className="onboarding-form"><div className="settings-fields">{mealFields.map(([key, label]) => <NumberField key={key} label={`RIC do ${label.toLocaleLowerCase("pt-BR")}`} unit="g/U" value={settings.carbohydrate_ratios[key]} onChange={(value) => onChange(key, value)} />)}</div><StepActions back={onBack} next={() => undefined} nextLabel="Continuar" submit /></form>;
}

function Review({ settings }: { settings: ClinicalSettings }) { return <dl className="review-list"><div><dt>Glicemia-alvo</dt><dd>{settings.target_glucose} mg/dL</dd></div><div><dt>Fator de correção</dt><dd>{settings.correction_factor} mg/dL por U</dd></div><div><dt>Limite de hipoglicemia</dt><dd>{settings.hypoglycemia_threshold} mg/dL</dd></div><div><dt>Basal pela manhã</dt><dd>{settings.basal_morning_units} U</dd></div>{mealFields.map(([key, label]) => <div key={key}><dt>RIC do {label.toLocaleLowerCase("pt-BR")}</dt><dd>{settings.carbohydrate_ratios[key]} g/U</dd></div>)}</dl>; }
function StepActions({ back, next, nextLabel, submit = false, disabled = false }: { back(): void; next(): void; nextLabel: string; submit?: boolean; disabled?: boolean }) { return <div className="setup-actions"><button className="secondary-action" type="button" onClick={back}>Voltar</button><button className="primary-action" type={submit ? "submit" : "button"} onClick={submit ? undefined : next} disabled={disabled}>{nextLabel}</button></div>; }
function NumberField({ label, unit, value, onChange }: { label: string; unit: string; value: number; onChange(value: string): void }) { const id = label.toLocaleLowerCase("pt-BR").replaceAll(/[^a-z0-9]+/g, "-"); const [draft, setDraft] = useState(String(value)); useEffect(() => setDraft(String(value)), [value]); return <label className="number-field" htmlFor={id}><span>{label}</span><span className="number-input"><input id={id} type="text" inputMode="decimal" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => onChange(draft)} /><em>{unit}</em></span></label>; }
function parseValue(value: string): number | null { const result = Number(value.replace(",", ".")); return Number.isFinite(result) && result >= 0 ? result : null; }
function titleFor(step: OnboardingProgress["step"]): string { const titles: Record<OnboardingProgress["step"], string> = { welcome: "Que bom ter você aqui.", how_it_works: "Eu busco os dados para você.", safety: "Você confirma cada passo.", clinical_settings: "Vamos conferir seus parâmetros?", carbohydrate_ratios: "Agora, seus RICs.", interaction_mode: "Tudo pronto para começar.", review: "Tudo pronto para começar." }; return titles[step]; }
