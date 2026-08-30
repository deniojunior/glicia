import { FormEvent, useReducer, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ConversationSession, type SessionSnapshot } from "./application";
import { DemoAiProvider } from "./adapters/fake/demo-ai-provider";
import type { InteractionMode } from "./domain";

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

function createSession(mode: InteractionMode): ConversationSession {
  return new ConversationSession(new DemoAiProvider(), mode);
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

export function App() {
  const sessionRef = useRef<ConversationSession | null>(null);
  if (sessionRef.current === null) {
    sessionRef.current = createSession("preciso");
  }
  const session = sessionRef.current;
  const [state, dispatch] = useReducer(reduce, session, initialState);
  const isAwaitingConfirmation = state.snapshot.state === "awaiting_confirmation";
  const isConfirmed = state.snapshot.state === "confirmed";
  const isLocked = state.snapshot.state !== "ready";

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

  function changeMode(mode: InteractionMode) {
    if (isLocked) return;
    session.changeInteractionMode(mode);
    dispatch({ type: "snapshot_updated", snapshot: session.snapshot });
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
        <span className="demo-badge">demonstração local</span>
      </header>

      <section className="conversation" id="conversation" aria-labelledby="conversation-title">
        <div className="conversation-intro">
          <p className="eyebrow">Entende. Organiza. Calcula.</p>
          <h1 id="conversation-title">Informe tudo de uma vez.</h1>
          <p>Inclua o que vai comer, sua glicemia, a tendência e o tipo de refeição.</p>
        </div>

        <div className="mode-selector" aria-label="Modo de interação">
          <button className={state.snapshot.interaction_mode === "preciso" ? "selected" : ""} type="button" aria-pressed={state.snapshot.interaction_mode === "preciso"} disabled={isLocked} onClick={() => changeMode("preciso")}>Preciso</button>
          <button className={state.snapshot.interaction_mode === "rapido" ? "selected" : ""} type="button" aria-pressed={state.snapshot.interaction_mode === "rapido"} disabled={isLocked} onClick={() => changeMode("rapido")}>Rápido</button>
        </div>

        <div className="message-feed" aria-live="polite" aria-busy={state.is_waiting}>
          {state.snapshot.history.length === 0 ? <div className="welcome-message"><span className="message-label">Glicia</span><p>Envie de uma vez o alimento e a quantidade, glicemia, seta e tipo de refeição. Você sempre confere antes.</p></div> : state.snapshot.history.map((exchange, index) => <div className="exchange" key={`${index}-${exchange.user_message}`}><article className="message user-message"><span className="message-label">Você</span><p>{exchange.user_message}</p></article><article className="message assistant-message"><span className="message-label">Glicia</span><AssistantMarkdown content={exchange.assistant_turn.reply} /></article></div>)}
          {state.is_waiting ? <p className="waiting">Organizando sua resposta…</p> : null}
          {state.error ? <p className="error-message" role="alert">{state.error}</p> : null}
        </div>

        {isAwaitingConfirmation && currentTurn ? <aside className="confirmation-card" aria-labelledby="confirmation-title"><p className="eyebrow">Confira antes de decidir</p><h2 id="confirmation-title">Resumo da refeição</h2><dl><div><dt>Carboidratos</dt><dd>{currentTurn.total_carbohydrates} g</dd></div><div><dt>Glicemia</dt><dd>{currentTurn.glucose} mg/dL</dd></div><div><dt>Tendência</dt><dd>{currentTurn.glucose_trend?.replaceAll("_", " ").toLocaleLowerCase("pt-BR")}</dd></div><div><dt>Refeição</dt><dd>{mealTypeLabel(currentTurn.meal_type)}</dd></div></dl><button className="primary-action" type="button" onClick={confirm}>Confirmar dados</button><p className="card-note">Ainda não há cálculo de dose nesta demonstração.</p></aside> : null}

        {isConfirmed ? <aside className="confirmed-card" aria-live="polite"><p className="eyebrow">Dados confirmados</p><h2>Você decide.</h2><p>O cálculo local será conectado a este passo na próxima etapa.</p><button className="secondary-action" type="button" onClick={startNewMeal}>Iniciar nova refeição</button></aside> : null}
      </section>

      {!isConfirmed ? <form className="composer" onSubmit={send}><label htmlFor="meal-message">{isAwaitingConfirmation ? "O que precisa corrigir?" : "Refeição, glicemia, tendência e tipo"}</label><div className="composer-row"><textarea id="meal-message" value={state.draft} onChange={(event) => dispatch({ type: "draft_changed", draft: event.target.value })} placeholder={isAwaitingConfirmation ? "Ex.: a glicemia correta é 110" : "Ex.: arroz, frango e salada; 120 mg/dL, seta estável, almoço"} rows={2} disabled={state.is_waiting} /><button className="send-button" type="submit" disabled={state.is_waiting || !state.draft.trim()}><span className="visually-hidden">Enviar mensagem</span><span aria-hidden="true">↑</span></button></div><p>A demonstração não envia dados e não substitui sua equipe de saúde.</p></form> : null}
    </main>
  );
}
