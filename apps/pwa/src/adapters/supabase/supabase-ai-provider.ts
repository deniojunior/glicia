import type { SupabaseClient } from "@supabase/supabase-js";

import { ProviderError, type AiProvider, type AiRequest, type AiResult, type ProviderErrorCode } from "../../application";
import { conversationTurnFromResponse } from "../../domain";

export class SupabaseAiProvider implements AiProvider {
  public constructor(private readonly client: SupabaseClient, private readonly instructions: (request: AiRequest) => string) {}

  public async ask(request: AiRequest): Promise<AiResult> {
    const messages = [
      ...request.history.flatMap((exchange) => [
        { role: "user" as const, content: exchange.user_message },
        { role: "assistant" as const, content: exchange.assistant_turn.reply }
      ]),
      { role: "user" as const, content: request.message }
    ];
    const { data, error } = await this.client.functions.invoke("ai-chat", { body: { messages, instructions: this.instructions(request) } });
    if (error) {
      const response = error.context instanceof Response ? error.context : null;
      const payload = await readFunctionError(response);
      const code: ProviderErrorCode = response?.status === 401
        ? "authentication"
        : response?.status === 429
          ? "rate_limit"
          : "network";
      throw new ProviderError(
        code,
        payload?.error ?? "Não foi possível conectar ao provedor de IA. Tente novamente.",
        code !== "authentication"
      );
    }
    if (!isRecord(data) || typeof data.output_text !== "string" || typeof data.provider !== "string" || typeof data.model !== "string") throw new ProviderError("invalid_response", "O provedor devolveu uma resposta inválida.", true);
    try { return { turn: conversationTurnFromResponse(JSON.parse(data.output_text)), provider: data.provider, model: data.model }; }
    catch { throw new ProviderError("invalid_response", "O provedor devolveu dados inválidos.", true); }
  }

  public reset(): void {}
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }

async function readFunctionError(response: Response | null): Promise<{ error?: string } | null> {
  if (!response) return null;
  try {
    const payload: unknown = await response.json();
    return isRecord(payload) && typeof payload.error === "string" ? { error: payload.error } : null;
  } catch {
    return null;
  }
}
