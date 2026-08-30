import type { AiProvider, AiRequest } from "../../application";
import type { ConversationTurn } from "../../domain";

export class ScriptedAiProvider implements AiProvider {
  private requests: AiRequest[] = [];

  public constructor(private replies: Array<ConversationTurn | Error>) {}

  public get receivedRequests(): readonly AiRequest[] {
    return [...this.requests];
  }

  public async ask(request: AiRequest): Promise<ConversationTurn> {
    this.requests.push(request);
    const next = this.replies.shift();
    if (next === undefined) {
      throw new Error("O provedor fake não tem resposta configurada.");
    }
    if (next instanceof Error) {
      throw next;
    }
    return next;
  }

  public reset(): void {
    this.requests = [];
  }
}
