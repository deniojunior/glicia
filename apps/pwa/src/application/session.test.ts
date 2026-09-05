import { describe, expect, it } from "vitest";

import { ScriptedAiProvider } from "../adapters/fake/scripted-ai-provider";
import type { ConversationTurn, InteractionMode } from "../domain";
import {
  CORRECTION_PREFIX,
  ConversationSession,
  InvalidSessionTransition,
  createConversationTurn
} from "./session";

function turn(complete: boolean, reply = "Resumo fictício."): ConversationTurn {
  return createConversationTurn(
    reply,
    complete
      ? {
          total_carbohydrates: 42,
          glucose: 150,
          glucose_trend: "ESTAVEL",
          meal_type: "ALMOCO"
        }
      : {}
  );
}

function session(replies: Array<ConversationTurn | Error>, mode: InteractionMode = "preciso") {
  return new ConversationSession(new ScriptedAiProvider(replies), mode);
}

describe("ConversationSession", () => {
  it("coleta até o turno estar completo e então confirma", async () => {
    const subject = session([turn(false), turn(true)]);

    await subject.submit("Refeição fictícia");
    expect(subject.snapshot.state).toBe("collecting");

    const completed = await subject.submit("150, seta estável, almoço");
    expect(subject.snapshot.state).toBe("awaiting_confirmation");
    expect(subject.snapshot).toMatchObject({ ai_provider: "fake", ai_model: "scripted" });
    expect(subject.confirm()).toBe(completed);
    expect(subject.snapshot.state).toBe("confirmed");
  });

  it("preserva o histórico ao corrigir", async () => {
    const provider = new ScriptedAiProvider([turn(true), turn(true, "Corrigido.")]);
    const subject = new ConversationSession(provider, "rapido");
    await subject.submit("Refeição fictícia");

    await subject.correct("O total correto é 35 g");

    expect(provider.receivedRequests).toHaveLength(2);
    expect(provider.receivedRequests[1]?.message).toBe(
      `${CORRECTION_PREFIX} O total correto é 35 g`
    );
    expect(provider.receivedRequests[1]?.history).toHaveLength(1);
    expect(subject.snapshot.state).toBe("awaiting_confirmation");
  });

  it("não altera a sessão quando o provedor falha", async () => {
    const subject = session([new Error("falha fictícia"), turn(false)]);

    await expect(subject.submit("Mensagem que falha")).rejects.toThrow("falha fictícia");
    expect(subject.snapshot).toMatchObject({ state: "ready", history: [], current_turn: null, ai_provider: null, ai_model: null });

    await subject.submit("Nova tentativa");
    expect(subject.snapshot.state).toBe("collecting");
  });

  it("rejeita transições e mensagens inválidas", async () => {
    const subject = session([turn(true)]);

    await expect(subject.submit("  ")).rejects.toThrow("mensagem não pode estar vazia");
    await expect(subject.correct("algo")).rejects.toBeInstanceOf(InvalidSessionTransition);

    await subject.submit("Refeição fictícia");
    await expect(subject.submit("Mensagem fora de hora")).rejects.toBeInstanceOf(
      InvalidSessionTransition
    );
    subject.confirm();
    expect(() => subject.confirm()).toThrow(InvalidSessionTransition);
  });

  it("reinicia a conversa e preserva a memória alimentar", async () => {
    const memoryTurn = createConversationTurn("Preferência confirmada.", {
      food_memory_updates: [{ food: "Arroz", usual_preparation: "cozido" }]
    });
    const subject = session([memoryTurn, turn(true)]);

    await subject.submit("Primeira refeição");
    await subject.reset();

    expect(subject.snapshot).toMatchObject({ state: "ready", history: [], current_turn: null });
    expect(subject.snapshot.food_memory).toEqual({ arroz: "cozido" });
    await subject.submit("Segunda refeição");
    expect(subject.snapshot.state).toBe("awaiting_confirmation");
  });

  it("mantém o modo da interação em cada solicitação", async () => {
    const provider = new ScriptedAiProvider([turn(false), turn(true)]);
    const subject = new ConversationSession(provider, "preciso");
    await subject.submit("Primeira mensagem");

    subject.changeInteractionMode("rapido");
    await subject.submit("Segunda mensagem");

    expect(provider.receivedRequests.map((request) => request.interaction_mode)).toEqual([
      "preciso",
      "rapido"
    ]);
  });

  it("aceita uma refeição manual completa sem chamar o provedor", () => {
    const provider = new ScriptedAiProvider([]);
    const subject = new ConversationSession(provider, "preciso");
    const manualTurn = turn(true, "Dados informados manualmente.");

    subject.submitManual("Arroz, feijão e frango", manualTurn);

    expect(provider.receivedRequests).toHaveLength(0);
    expect(subject.snapshot).toMatchObject({
      state: "awaiting_confirmation",
      ai_provider: "manual",
      ai_model: "deterministic"
    });
    expect(subject.snapshot.history[0]?.user_message).toBe("Arroz, feijão e frango");
  });

  it("rejeita uma refeição manual incompleta", () => {
    const subject = session([]);

    expect(() => subject.submitManual("Refeição", turn(false))).toThrow(
      "Preencha todos os dados da refeição manual"
    );
    expect(subject.snapshot.state).toBe("ready");
  });
});
