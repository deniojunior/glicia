import type { AiProvider, AiRequest } from "../../application";
import { createConversationTurn } from "../../application";
import type { ConversationTurn } from "../../domain";

/** Adaptador local para demonstrar o fluxo sem enviar dados ou exigir uma chave. */
export class DemoAiProvider implements AiProvider {
  public async ask(request: AiRequest): Promise<ConversationTurn> {
    if (request.message.startsWith("Os dados não foram confirmados.")) {
      return this.completeTurn("Pronto, atualizei o resumo para você conferir novamente.");
    }
    return this.completeTurn(
      "Resumo de demonstração: estimei 42 g de carboidratos. Confira os dados antes de confirmar."
    );
  }

  public reset(): void {}

  private completeTurn(reply: string): ConversationTurn {
    return createConversationTurn(reply, {
      total_carbohydrates: 42,
      glucose: 120,
      glucose_trend: "ESTAVEL",
      meal_type: "ALMOCO"
    });
  }
}
