import { FormEvent, type KeyboardEvent, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ConversationSession, createMealRecord, decideConfirmedMeal, findHistoricalMealCandidates, PreferencesService, type FoodMemoryRepository, type MealDecision, type MealHistoryRepository, type MealRecord, type SessionSnapshot } from "./application";
import { buildOpenAiContext } from "./adapters/openai/instructions";
import { createSupabaseClient } from "./adapters/supabase/client";
import { SupabaseAccessService } from "./adapters/supabase/supabase-access-service";
import { SupabasePreferencesRepository } from "./adapters/supabase/supabase-preferences-repository";
import { SupabaseMealRepository } from "./adapters/supabase/supabase-meal-repository";
import { SupabaseAiProvider } from "./adapters/supabase/supabase-ai-provider";
import { SupabaseAccountService } from "./adapters/supabase/supabase-account-service";
import { Onboarding } from "./components/onboarding";
import { Settings } from "./components/settings";
import { History } from "./components/history";
import { Account } from "./components/account";
import { ConversationMenu } from "./components/conversation-menu";
import { LoadingScreen } from "./components/loading-screen";
import { AccountLoadError } from "./components/account-load-error";
import { AccessNotApproved, Auth, MissingSupabaseConfiguration } from "./components/auth";
import { AdminAccessRequests } from "./components/admin-access-requests";
import { ManualMealForm } from "./components/manual-meal-form";
import { HistoricalMealReuse } from "./components/historical-meal-reuse";
import { shouldSubmitComposer } from "./components/composer-keyboard";
import { useApprovedAccess } from "./components/use-approved-access";
import { appPath } from "./config/app-urls";
import { GliciaAvatar } from "./components/brand/glicia-avatar";
import { GliciaWordmark } from "./components/brand/glicia-wordmark";
import type { InteractionMode, OnboardingProgress, PersistedPreferences } from "./domain";
import { carbohydrateRatioFor } from "./domain";

interface AppState {
  draft: string;
  snapshot: SessionSnapshot;
  is_waiting: boolean;
  error: string | null;
}

type AppAction =
  | { type: "draft_changed"; draft: string }
  | { type: "request_started" }
  | { type: "snapshot_updated"; snapshot: SessionSnapshot }
  | { type: "request_failed"; error: string }
  | { type: "request_finished" };

function reduce(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "draft_changed":
      return { ...state, draft: action.draft };
    case "request_started":
      return { ...state, is_waiting: true, error: null };
    case "snapshot_updated":
      return { ...state, snapshot: action.snapshot };
    case "request_failed":
      return { ...state, error: action.error };
    case "request_finished":
      return { ...state, is_waiting: false };
  }
}

const supabase = createSupabaseClient();
const accessService = supabase ? new SupabaseAccessService(supabase) : null;

function createSession(mode: InteractionMode, client: SupabaseClient, foodMemory: Readonly<Record<string, string>>): ConversationSession {
  return new ConversationSession(new SupabaseAiProvider(client, buildOpenAiContext), mode, foodMemory);
}

function initialState(session: ConversationSession): AppState {
  return { draft: "", snapshot: session.snapshot, is_waiting: false, error: null };
}

function mealTypeLabel(value: string | null): string {
  const labels: Record<string, string> = {
    CAFE_DA_MANHA: "café da manhã",
    ALMOCO: "almoço",
    CAFE_DA_TARDE: "café da tarde",
    JANTAR: "jantar",
    CEIA: "ceia"
  };
  return value ? labels[value] ?? value : "não informada";
}

function AssistantMarkdown({ content }: { content: string }) {
  return <div className="assistant-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{content}</ReactMarkdown></div>;
}

function ConversationApp({ preferences, client, foodMemory, mealRepository, onOpenSettings, onOpenHistory, onOpenAccount, onSignOut }: { preferences: PersistedPreferences; client: SupabaseClient; foodMemory: Readonly<Record<string, string>>; mealRepository: MealHistoryRepository & FoodMemoryRepository; onOpenSettings(): void; onOpenHistory(): void; onOpenAccount(): void; onSignOut(): Promise<void> }) {
  const sessionRef = useRef<ConversationSession | null>(null);
  if (sessionRef.current === null) {
    sessionRef.current = createSession(preferences.interaction_mode, client, foodMemory);
  }
  const session = sessionRef.current;
  const [state, dispatch] = useReducer(reduce, session, initialState);
  const [decision, setDecision] = useState<MealDecision | null>(null);
  const [pendingRecord, setPendingRecord] = useState<MealRecord | null>(null);
  const [appliedDose, setAppliedDose] = useState("");
  const [isManualEntry, setIsManualEntry] = useState(false);
  const [historicalCandidates, setHistoricalCandidates] = useState<readonly MealRecord[] | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const isAwaitingConfirmation = state.snapshot.state === "awaiting_confirmation";
  const isConfirmed = state.snapshot.state === "confirmed";

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.is_waiting || !state.draft.trim()) return;
    dispatch({ type: "request_started" });
    try {
      if (!isAwaitingConfirmation && session.snapshot.state === "ready") {
        const candidates = await findHistoricalMealCandidates(mealRepository, state.draft);
        if (candidates !== null) {
          if (candidates.length === 0) {
            dispatch({ type: "request_failed", error: "Não encontrei uma refeição correspondente no histórico de ontem." });
          } else {
            setHistoricalCandidates(candidates);
            dispatch({ type: "draft_changed", draft: "" });
          }
          return;
        }
      }
      if (isAwaitingConfirmation) await session.correct(state.draft);
      else await session.submit(state.draft);
      await mealRepository.saveMemory(session.snapshot.food_memory);
      dispatch({ type: "draft_changed", draft: "" });
      dispatch({ type: "snapshot_updated", snapshot: session.snapshot });
    } catch (error) {
      dispatch({
        type: "request_failed",
        error: error instanceof Error ? error.message : "Não foi possível enviar a mensagem."
      });
    } finally {
      dispatch({ type: "request_finished" });
    }
  }

  function confirm() {
    try {
      session.confirm();
      const nextDecision = decideConfirmedMeal(session.snapshot.current_turn!, preferences.clinical_settings);
      setDecision(nextDecision);
      if (nextDecision.calculation && session.snapshot.current_turn && session.snapshot.ai_provider && session.snapshot.ai_model) {
        const lastMessage = session.snapshot.history.at(-1)?.user_message ?? "";
        setPendingRecord(createMealRecord({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), mealInput: lastMessage, turn: session.snapshot.current_turn, mode: session.snapshot.interaction_mode, settings: preferences.clinical_settings, carbohydrateRatio: carbohydrateRatioFor(preferences.clinical_settings, session.snapshot.current_turn.meal_type!), calculation: nextDecision.calculation, provider: session.snapshot.ai_provider, model: session.snapshot.ai_model }));
      }
      dispatch({ type: "snapshot_updated", snapshot: session.snapshot });
    } catch (error) {
      dispatch({
        type: "request_failed",
        error: error instanceof Error ? error.message : "Não foi possível confirmar os dados."
      });
    }
  }

  async function startNewMeal() {
    dispatch({ type: "request_started" });
    try {
      await session.reset();
      setDecision(null);
      setPendingRecord(null);
      setAppliedDose("");
      setIsManualEntry(false);
      setHistoricalCandidates(null);
      dispatch({ type: "snapshot_updated", snapshot: session.snapshot });
    } finally {
      dispatch({ type: "request_finished" });
    }
  }

  function submitManual(description: string, turn: Parameters<ConversationSession["submitManual"]>[1]) {
    try {
      session.submitManual(description, turn);
      setIsManualEntry(false);
      dispatch({ type: "snapshot_updated", snapshot: session.snapshot });
    } catch (error) {
      dispatch({ type: "request_failed", error: error instanceof Error ? error.message : "Não foi possível revisar os dados manuais." });
    }
  }

  function submitHistorical(description: string, turn: Parameters<ConversationSession["submitManual"]>[1]) {
    setHistoricalCandidates(null);
    submitManual(description, turn);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!shouldSubmitComposer({ key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing })) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  const currentTurn = state.snapshot.current_turn;

  async function saveMealRecord(applied: number | null) {
    if (pendingRecord === null) return;
    if (applied !== null && (!Number.isFinite(applied) || applied < 0)) {
      dispatch({ type: "request_failed", error: "Informe uma dose aplicada válida ou deixe o campo vazio." });
      return;
    }
    await mealRepository.saveRecord({ ...pendingRecord, applied_dose: applied });
    await startNewMeal();
  }

  async function signOut() {
    setIsSigningOut(true);
    try {
      await onSignOut();
    } catch (error) {
      dispatch({ type: "request_failed", error: error instanceof Error ? error.message : "Não foi possível sair neste dispositivo." });
      setIsSigningOut(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <a className="brand conversation-brand" href="#conversation" aria-label="Glicia, ir para a conversa"><GliciaWordmark /></a>
        <ConversationMenu onOpenHistory={onOpenHistory} onOpenSettings={onOpenSettings} onOpenAccount={onOpenAccount} isSigningOut={isSigningOut} onSignOut={() => void signOut()} />
      </header>

      <section className="conversation" id="conversation" aria-label="Conversa com a Glicia">
        {state.snapshot.history.length === 0 ? <div className="conversation-intro"><GliciaAvatar size="small" variant="profile" decorative={false} /><div><h1 id="conversation-title">Oi! Vamos contar sua refeição?</h1><p>Me conta o que você vai comer e a quantidade. Pode incluir sua glicemia, a tendência e qual é a refeição.</p></div></div> : null}

        <div className="message-feed" aria-live="polite" aria-busy={state.is_waiting}>
          {state.snapshot.history.map((exchange, index) => <div className="exchange" key={`${index}-${exchange.user_message}`}><article className="message user-message"><p>{exchange.user_message}</p></article><div className="assistant-exchange"><GliciaAvatar size="small" variant="profile" decorative={false} /><article className="message assistant-message"><p className="assistant-name">Glicia</p><AssistantMarkdown content={exchange.assistant_turn.reply} /></article></div></div>)}
          {state.is_waiting ? <p className="waiting"><span className="loading-spinner" aria-hidden="true" />Estou conferindo sua refeição…</p> : null}
          {state.error ? <p className="error-message" role="alert">{state.error}</p> : null}
        </div>

        {isAwaitingConfirmation && currentTurn ? <aside className="confirmation-card" aria-labelledby="confirmation-title"><div className="card-heading"><GliciaAvatar size="small" variant="profile" decorative={false} /><div><p className="assistant-name">Glicia</p><h2 id="confirmation-title">Confere se entendi sua refeição?</h2></div></div>{currentTurn.meal_items.length > 0 ? <ul className="confirmation-items">{currentTurn.meal_items.map((item, index) => <li key={`${item.name}-${index}`}><span>{item.name} · {item.portion}</span><strong>{item.carbohydrates} g</strong></li>)}</ul> : null}<dl><div><dt>Carboidratos</dt><dd>{currentTurn.total_carbohydrates} g</dd></div><div><dt>Glicemia</dt><dd>{currentTurn.glucose} mg/dL</dd></div><div><dt>Tendência</dt><dd>{currentTurn.glucose_trend?.replaceAll("_", " ").toLocaleLowerCase("pt-BR")}</dd></div><div><dt>Refeição</dt><dd>{mealTypeLabel(currentTurn.meal_type)}</dd></div></dl><button className="primary-action" type="button" onClick={confirm}>Confirmar dados</button><p className="card-note">O cálculo local só acontece depois da sua confirmação.</p></aside> : null}

        {isConfirmed && decision ? <aside className="confirmed-card" aria-live="polite"><div className="card-heading"><GliciaAvatar size="small" variant="profile" decorative={false} /><div><p className="assistant-name">Glicia</p><h2>{decision.safety.bolus_blocked ? "Trate a hipoglicemia primeiro." : `Sugestão: ${decision.calculation?.suggested} U`}</h2></div></div><p>{decision.safety.bolus_blocked ? "A Glicia não calcula bolus abaixo do seu limite configurado." : decision.safety.rapid_fall_warning ? "Atenção: queda rápida com glicemia abaixo de 100 mg/dL." : `Cálculo local com RIC de ${currentTurn ? preferences.clinical_settings.carbohydrate_ratios[currentTurn.meal_type!] : ""} g/U.`}</p>{pendingRecord ? <div className="applied-dose"><label htmlFor="applied-dose">Quanto você aplicou? (opcional)</label><input id="applied-dose" inputMode="decimal" value={appliedDose} onChange={(event) => setAppliedDose(event.target.value)} placeholder="Ex.: 4" /><button className="primary-action" type="button" onClick={() => void saveMealRecord(appliedDose.trim() ? Number(appliedDose.replace(",", ".")) : null)}>Registrar e encerrar</button></div> : <button className="secondary-action" type="button" onClick={startNewMeal}>Iniciar nova refeição</button>}</aside> : null}
      </section>

      {!isConfirmed && historicalCandidates ? <HistoricalMealReuse candidates={historicalCandidates} onSubmit={submitHistorical} onCancel={() => setHistoricalCandidates(null)} /> : null}
      {!isConfirmed && !historicalCandidates && isManualEntry ? <ManualMealForm onSubmit={submitManual} onCancel={() => setIsManualEntry(false)} /> : null}
      {!isConfirmed && !historicalCandidates && !isManualEntry ? <form className="composer" onSubmit={send}><label htmlFor="meal-message">{isAwaitingConfirmation ? "O que precisa corrigir?" : "Escreva para a Glicia"}</label><div className="composer-row"><textarea id="meal-message" value={state.draft} onChange={(event) => dispatch({ type: "draft_changed", draft: event.target.value })} onKeyDown={handleComposerKeyDown} enterKeyHint="send" placeholder={isAwaitingConfirmation ? "Ex.: a glicemia correta é 110" : "Ex.: arroz, frango e salada; 120 mg/dL, seta estável, almoço"} rows={2} disabled={state.is_waiting} /><button className="send-button" type="submit" disabled={state.is_waiting || !state.draft.trim()}><span className="visually-hidden">Enviar mensagem</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 7-7 7 7M12 5v14" /></svg></button></div><div className="composer-foot"><details className="dictation-tip"><summary>Prefere gravar áudio?</summary><p>Toque no campo e use o microfone do seu teclado, se disponível. Ele transforma sua fala em texto. Confira as palavras e os números antes de enviar.</p></details>{state.snapshot.state === "ready" ? <button type="button" onClick={() => setIsManualEntry(true)}>Informar sem IA</button> : null}</div></form> : null}
    </main>
  );
}

function AuthenticatedApp({ client, user }: { client: SupabaseClient; user: User }) {
  const preferencesService = useMemo(() => new PreferencesService(new SupabasePreferencesRepository(client, user.id)), [client, user.id]);
  const mealRepository = useMemo(() => new SupabaseMealRepository(client, user.id), [client, user.id]);
  const accountService = useMemo(() => new SupabaseAccountService(client), [client]);
  const [preferences, setPreferences] = useState<PersistedPreferences | null | undefined>(undefined);
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [screen, setScreen] = useState<"conversation" | "settings" | "history" | "account">("conversation");
  const [foodMemory, setFoodMemory] = useState<Readonly<Record<string, string>> | null>(null);

  useEffect(() => {
    setPreferences(undefined); setFoodMemory(null); setLoadError(null);
    void Promise.all([preferencesService.load(), preferencesService.loadOnboarding(), mealRepository.load()])
      .then(([savedPreferences, savedProgress, savedMemory]) => { setPreferences(savedPreferences); setProgress(savedProgress); setFoodMemory(savedMemory); })
      .catch(() => { setLoadError("Não foi possível abrir a configuração da sua conta."); setPreferences(null); setFoodMemory({}); });
  }, [client, loadAttempt, mealRepository, preferencesService, user.id]);

  if (preferences === undefined || foodMemory === null) return <LoadingScreen message="Preparando sua conversa…" />;
  if (loadError) return <AccountLoadError onRetry={() => setLoadAttempt((attempt) => attempt + 1)} onSignOut={() => accountService.signOut()} />;
  if (preferences === null) return <Onboarding initialProgress={progress} onProgress={(next) => preferencesService.saveOnboarding(next)} onComplete={async (next) => { await preferencesService.save(next); await preferencesService.clearOnboarding(); setPreferences(next); }} />;
  if (screen === "settings") return <Settings preferences={preferences} onBack={() => setScreen("conversation")} onSave={async (next) => { await preferencesService.save(next); setPreferences(next); }} />;
  if (screen === "history") return <History repository={mealRepository} onBack={() => setScreen("conversation")} />;
  if (screen === "account") return <Account onBack={() => setScreen("conversation")} onDeleteAccount={() => accountService.deleteAccount("EXCLUIR")} />;
  return <ConversationApp preferences={preferences} client={client} foodMemory={foodMemory} mealRepository={mealRepository} onOpenSettings={() => setScreen("settings")} onOpenHistory={() => setScreen("history")} onOpenAccount={() => setScreen("account")} onSignOut={() => accountService.signOut()} />;
}

export function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const hasApprovedAccess = useApprovedAccess(user?.id, accessService);
  const isAdminRoute = window.location.pathname.startsWith(appPath("admin/access-requests"));
  const adminRedirectTo = `${window.location.origin}${window.location.pathname}${window.location.search}`;

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  if (!supabase || !accessService) return <MissingSupabaseConfiguration />;
  if (user === undefined) return <LoadingScreen message="Conferindo seu acesso…" />;
  if (user === null) return <Auth service={accessService} adminLogin={isAdminRoute ? { redirectTo: adminRedirectTo } : undefined} />;
  if (hasApprovedAccess === undefined) return <LoadingScreen message="Conferindo sua aprovação…" />;
  if (!hasApprovedAccess) return <AccessNotApproved onSignOut={async () => { await supabase.auth.signOut({ scope: "local" }); }} />;
  if (isAdminRoute) return <AdminAccessRequests service={accessService} onSignOut={async () => { await supabase.auth.signOut({ scope: "local" }); }} />;
  return <AuthenticatedApp key={user.id} client={supabase} user={user} />;
}
