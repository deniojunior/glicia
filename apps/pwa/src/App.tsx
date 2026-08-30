import { FormEvent, useEffect, useReducer, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ConversationSession, type SessionSnapshot } from "./application";
import { PreferencesService } from "./application";
import { DemoAiProvider } from "./adapters/fake/demo-ai-provider";
import { OpenAIResponsesProvider } from "./adapters/openai/openai-responses-provider";
import { buildOpenAiInstructions } from "./adapters/openai/instructions";
import { IndexedDbPreferencesRepository } from "./adapters/storage/indexeddb-preferences-repository";
import { Onboarding } from "./components/onboarding";
import { Settings } from "./components/settings";
import type { InteractionMode, OnboardingProgress, PersistedPreferences } from "./domain";

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

const preferencesService = new PreferencesService(new IndexedDbPreferencesRepository());

function createSession(mode: InteractionMode, apiKey: string | null, preferences: PersistedPreferences): ConversationSession {
  const provider = apiKey ? new OpenAIResponsesProvider({ apiKey, model: preferences.provider.model, instructions: buildOpenAiInstructions }) : new DemoAiProvider();
  return new ConversationSession(provider, mode);
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

function ConversationApp({ preferences, apiKey, onOpenSettings }: { preferences: PersistedPreferences; apiKey: string | null; onOpenSettings(): void }) {
  const sessionRef = useRef<ConversationSession | null>(null);
  if (sessionRef.current === null) {
    sessionRef.current = createSession(preferences.interaction_mode, apiKey, preferences);
  }
  const session = sessionRef.current;
  const [state, dispatch] = useReducer(reduce, session, initialState);
  const isAwaitingConfirmation = state.snapshot.state === "awaiting_confirmation";
  const isConfirmed = state.snapshot.state === "confirmed";

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.is_waiting || !state.draft.trim()) return;
    dispatch({ type: "request_started" });
    try {
      if (isAwaitingConfirmation) await session.correct(state.draft);
      else await session.submit(state.draft);
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
      dispatch({ type: "snapshot_updated", snapshot: session.snapshot });
    } finally {
      dispatch({ type: "request_finished" });
    }
  }

  const currentTurn = state.snapshot.current_turn;

  return (
    <main className="app-shell">
      <header className="app-header">
        <a className="brand" href="#conversation" aria-label="Glicia, ir para a conversa">
          <img src="/icons/glicia-192.png" width="44" height="44" alt="" />
          <span>Glicia</span>
        </a>
        <button className="text-action" type="button" onClick={onOpenSettings}>Configurações</button>
      </header>

      <section className="conversation" id="conversation" aria-labelledby="conversation-title">
        {state.snapshot.history.length === 0 ? <div className="conversation-intro"><h1 id="conversation-title">O que você vai comer?</h1><p>Conte a refeição e sua glicemia do jeito que lembrar.</p></div> : null}

        <div className="message-feed" aria-live="polite" aria-busy={state.is_waiting}>
          {state.snapshot.history.map((exchange, index) => <div className="exchange" key={`${index}-${exchange.user_message}`}><article className="message user-message"><p>{exchange.user_message}</p></article><article className="message assistant-message"><AssistantMarkdown content={exchange.assistant_turn.reply} /></article></div>)}
          {state.is_waiting ? <p className="waiting">Organizando sua resposta…</p> : null}
          {state.error ? <p className="error-message" role="alert">{state.error}</p> : null}
        </div>

        {isAwaitingConfirmation && currentTurn ? <aside className="confirmation-card" aria-labelledby="confirmation-title"><p className="eyebrow">Confira antes de decidir</p><h2 id="confirmation-title">Resumo da refeição</h2><dl><div><dt>Carboidratos</dt><dd>{currentTurn.total_carbohydrates} g</dd></div><div><dt>Glicemia</dt><dd>{currentTurn.glucose} mg/dL</dd></div><div><dt>Tendência</dt><dd>{currentTurn.glucose_trend?.replaceAll("_", " ").toLocaleLowerCase("pt-BR")}</dd></div><div><dt>Refeição</dt><dd>{mealTypeLabel(currentTurn.meal_type)}</dd></div></dl><button className="primary-action" type="button" onClick={confirm}>Confirmar dados</button><p className="card-note">Ainda não há cálculo de dose nesta demonstração.</p></aside> : null}

        {isConfirmed ? <aside className="confirmed-card" aria-live="polite"><p className="eyebrow">Dados confirmados</p><h2>Você decide.</h2><p>O cálculo local será conectado a este passo na próxima etapa.</p><button className="secondary-action" type="button" onClick={startNewMeal}>Iniciar nova refeição</button></aside> : null}
      </section>

      {!isConfirmed && apiKey ? <form className="composer" onSubmit={send}><label htmlFor="meal-message">{isAwaitingConfirmation ? "O que precisa corrigir?" : "Refeição, glicemia, tendência e tipo"}</label><div className="composer-row"><textarea id="meal-message" value={state.draft} onChange={(event) => dispatch({ type: "draft_changed", draft: event.target.value })} placeholder={isAwaitingConfirmation ? "Ex.: a glicemia correta é 110" : "Ex.: arroz, frango e salada; 120 mg/dL, seta estável, almoço"} rows={2} disabled={state.is_waiting} /><button className="send-button" type="submit" disabled={state.is_waiting || !state.draft.trim()}><span className="visually-hidden">Enviar mensagem</span><span aria-hidden="true">↑</span></button></div><p>Confira a resposta antes de decidir.</p></form> : null}
      {!isConfirmed && !apiKey ? <aside className="key-required"><h2>Falta sua chave OpenAI.</h2><p>Ela não fica salva neste aparelho. Abra Configurações e cole uma chave para continuar.</p><button className="primary-action" type="button" onClick={onOpenSettings}>Abrir configurações</button></aside> : null}
    </main>
  );
}

export function App() {
  const [preferences, setPreferences] = useState<PersistedPreferences | null | undefined>(undefined);
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [screen, setScreen] = useState<"conversation" | "settings">("conversation");

  useEffect(() => {
    void Promise.all([preferencesService.load(), preferencesService.loadOnboarding()])
      .then(([savedPreferences, savedProgress]) => { setPreferences(savedPreferences); setProgress(savedProgress); })
      .catch(() => { setLoadError("Não foi possível abrir a configuração local deste aparelho."); setPreferences(null); });
  }, []);

  if (preferences === undefined) return <main className="onboarding-shell"><p className="waiting">Abrindo a Glicia…</p></main>;
  if (loadError) return <main className="onboarding-shell"><p className="error-message" role="alert">{loadError}</p></main>;
  if (preferences === null) return <Onboarding initialProgress={progress} onProgress={(next) => preferencesService.saveOnboarding(next)} onComplete={async (next, key) => { await preferencesService.save(next); await preferencesService.clearOnboarding(); setApiKey(key); setPreferences(next); }} />;
  if (screen === "settings") return <Settings preferences={preferences} hasApiKey={apiKey !== null} onSetApiKey={setApiKey} onBack={() => setScreen("conversation")} onSave={async (next) => { await preferencesService.save(next); setPreferences(next); }} />;
  return <ConversationApp preferences={preferences} apiKey={apiKey} onOpenSettings={() => setScreen("settings")} />;
}
