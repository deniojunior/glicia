import type { AiProvider, AiRequest } from "../../application";
import { conversationTurnFromResponse, type ConversationTurn } from "../../domain";

export type ProviderErrorCode =
  | "authentication"
  | "rate_limit"
  | "model_unavailable"
  | "network"
  | "invalid_response"
  | "unknown";

export class ProviderError extends Error {
  public constructor(
    public readonly code: ProviderErrorCode,
    message: string,
    public readonly retryable: boolean
  ) {
    super(message);
  }
}

export interface OpenAIResponsesConfig {
  apiKey: string;
  model: string;
  instructions: string | ((request: AiRequest) => string);
  baseUrl?: string;
  fetcher?: typeof fetch;
}

const TURN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "reply",
    "total_carbohydrates",
    "glucose",
    "glucose_trend",
    "meal_type",
    "food_memory_updates"
  ],
  properties: {
    reply: { type: "string" },
    total_carbohydrates: { type: ["number", "null"], minimum: 0 },
    glucose: { type: ["number", "null"], exclusiveMinimum: 0 },
    glucose_trend: {
      type: ["string", "null"],
      enum: ["SUBINDO_RAPIDO", "SUBINDO", "ESTAVEL", "CAINDO", "CAINDO_RAPIDO", "NAO_INFORMADA", null]
    },
    meal_type: {
      type: ["string", "null"],
      enum: ["CAFE_DA_MANHA", "ALMOCO", "CAFE_DA_TARDE", "JANTAR", "CEIA", null]
    },
    food_memory_updates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["food", "usual_preparation"],
        properties: {
          food: { type: "string", minLength: 1 },
          usual_preparation: { type: "string", minLength: 1 }
        }
      }
    }
  }
} as const;

export class OpenAIResponsesProvider implements AiProvider {
  private previousResponseId: string | null = null;

  private readonly endpoint: string;

  private readonly fetcher: typeof fetch;

  public constructor(private readonly config: OpenAIResponsesConfig) {
    if (!config.apiKey.trim()) throw new ProviderError("authentication", "Informe uma chave da OpenAI.", false);
    if (!config.model.trim()) throw new ProviderError("model_unavailable", "Informe um modelo da OpenAI.", false);
    this.endpoint = `${(config.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "")}/responses`;
    this.fetcher = config.fetcher ?? fetch;
  }

  public async ask(request: AiRequest): Promise<ConversationTurn> {
    let response: Response;
    try {
      response = await this.fetcher(this.endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.config.model,
          instructions: typeof this.config.instructions === "function" ? this.config.instructions(request) : this.config.instructions,
          input: request.message,
          store: false,
          ...(this.previousResponseId ? { previous_response_id: this.previousResponseId } : {}),
          text: { format: { type: "json_schema", name: "glicia_turn", strict: true, schema: TURN_SCHEMA } }
        })
      });
    } catch {
      throw new ProviderError("network", "Não foi possível conectar ao provedor de IA. Tente novamente.", true);
    }
    if (!response.ok) throw this.httpError(response.status);

    let payload: unknown;
    try { payload = await response.json(); } catch { throw new ProviderError("invalid_response", "O provedor devolveu uma resposta inválida.", true); }
    if (!isRecord(payload) || typeof payload.id !== "string") throw new ProviderError("invalid_response", "O provedor devolveu uma resposta inválida.", true);
    const outputText = typeof payload.output_text === "string" ? payload.output_text : null;
    if (!outputText) throw new ProviderError("invalid_response", "O provedor não devolveu texto utilizável.", true);
    try {
      const turn = conversationTurnFromResponse(JSON.parse(outputText));
      this.previousResponseId = payload.id;
      return turn;
    } catch { throw new ProviderError("invalid_response", "O provedor devolveu dados inválidos.", true); }
  }

  public reset(): void { this.previousResponseId = null; }

  private httpError(status: number): ProviderError {
    if (status === 401 || status === 403) return new ProviderError("authentication", "A chave da OpenAI não foi aceita.", false);
    if (status === 429) return new ProviderError("rate_limit", "O limite do provedor foi atingido. Tente novamente mais tarde.", true);
    if (status === 404) return new ProviderError("model_unavailable", "O modelo configurado não está disponível.", false);
    if (status >= 500) return new ProviderError("network", "O provedor está indisponível. Tente novamente.", true);
    return new ProviderError("unknown", "O provedor não pôde processar a solicitação.", true);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
