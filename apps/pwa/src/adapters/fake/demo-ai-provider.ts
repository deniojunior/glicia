import type { AiProvider, AiRequest, AiResult } from "../../application";
import { createConversationTurn } from "../../application";
import type { ConversationTurn } from "../../domain";

/** Adaptador local para demonstrar o fluxo sem enviar dados ou exigir uma chave. */
export class DemoAiProvider implements AiProvider {
  public async ask(request: AiRequest): Promise<AiResult> {
    if (request.message.startsWith("Os dados não foram confirmados.")) {
      return this.result("Pronto, atualizei o resumo para você conferir novamente.");
    }
    return this.result(
      "Resumo de demonstração: encontrei 42 g de carboidratos na tabela. Confira os dados antes de confirmar."
    );
  }

  public reset(): void {}

  private result(reply: string): AiResult {
    return { turn: this.completeTurn(reply), provider: "demo", model: "deterministic" };
  }

  private completeTurn(reply: string): ConversationTurn {
    return createConversationTurn(reply, {
      total_carbohydrates: 42,
      glucose: 120,
      glucose_trend: "ESTAVEL",
      meal_type: "ALMOCO"
    });
  }
}
