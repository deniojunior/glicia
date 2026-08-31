import type { SupabaseClient } from "@supabase/supabase-js";

import { ProviderError, type AiProvider, type AiRequest, type ProviderErrorCode } from "../../application";
import { conversationTurnFromResponse, type ConversationTurn } from "../../domain";

export class SupabaseAiProvider implements AiProvider {
  public constructor(private readonly client: SupabaseClient, private readonly instructions: (request: AiRequest) => string) {}

  public async ask(request: AiRequest): Promise<ConversationTurn> {
    const messages = [
      ...request.history.flatMap((exchange) => [
        { role: "user" as const, content: exchange.user_message },
        { role: "assistant" as const, content: exchange.assistant_turn.reply }
      ]),
      { role: "user" as const, content: request.message }
    ];
    const { data, error } = await this.client.functions.invoke("ai-chat", { body: { messages, instructions: this.instructions(request) } });
    if (error) throw new ProviderError("network", "Não foi possível conectar ao provedor de IA. Tente novamente.", true);
    if (!isRecord(data) || typeof data.output_text !== "string") throw new ProviderError("invalid_response", "O provedor devolveu uma resposta inválida.", true);
    try { return conversationTurnFromResponse(JSON.parse(data.output_text)); }
    catch { throw new ProviderError("invalid_response", "O provedor devolveu dados inválidos.", true); }
  }

  public reset(): void {}
}

export async function storeOpenAiConnection(client: SupabaseClient, apiKey: string, model: string): Promise<void> {
  const { error } = await client.functions.invoke("store-ai-connection", { body: { provider: "openai", model, apiKey } });
  if (!error) return;
  const response = error.context instanceof Response ? error.context : null;
  const payload = await readFunctionError(response);
  const code: ProviderErrorCode = response?.status === 401 || payload?.code === "invalid_openai_key" ? "authentication" : "unknown";
  throw new ProviderError(
    code,
    payload?.error ?? "Não foi possível salvar a conexão OpenAI. Tente novamente.",
    code !== "authentication"
  );
}

export async function hasOpenAiConnection(client: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await client.from("ai_connections").select("provider").eq("user_id", userId).eq("provider", "openai").maybeSingle();
  if (error) throw new Error("Não foi possível verificar sua conexão de IA.");
  return data !== null;
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }

async function readFunctionError(response: Response | null): Promise<{ code?: string; error?: string } | null> {
  if (!response) return null;
  try {
    const payload: unknown = await response.json();
    if (!isRecord(payload)) return null;
    return {
      code: typeof payload.code === "string" ? payload.code : undefined,
      error: typeof payload.error === "string" ? payload.error : undefined
    };
  } catch {
    return null;
  }
}
