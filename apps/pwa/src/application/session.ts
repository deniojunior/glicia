import {
  isConversationTurnComplete,
  mergeFoodMemory,
  type ConversationTurn,
  type FoodMemoryUpdate,
  type InteractionMode
} from "../domain";

export const CORRECTION_PREFIX = "Os dados não foram confirmados. Correção da pessoa:";

export type SessionState = "ready" | "collecting" | "awaiting_confirmation" | "confirmed";

export interface ConversationExchange {
  user_message: string;
  assistant_turn: ConversationTurn;
}

export interface AiRequest {
  message: string;
  history: readonly ConversationExchange[];
  interaction_mode: InteractionMode;
  food_memory: Readonly<Record<string, string>>;
}

export interface AiProvider {
  ask(request: AiRequest): Promise<AiResult>;
  reset(): void | Promise<void>;
}

export interface AiResult {
  turn: ConversationTurn;
  provider: string;
  model: string;
}

export interface SessionSnapshot {
  state: SessionState;
  history: readonly ConversationExchange[];
  current_turn: ConversationTurn | null;
  interaction_mode: InteractionMode;
  food_memory: Readonly<Record<string, string>>;
  ai_provider: string | null;
  ai_model: string | null;
}

export class InvalidSessionTransition extends Error {}

export class ConversationSession {
  private state: SessionState = "ready";

  private history: ConversationExchange[] = [];

  private currentTurn: ConversationTurn | null = null;

  private foodMemory: Record<string, string>;

  private aiProvider: string | null = null;

  private aiModel: string | null = null;

  public constructor(
    private readonly provider: AiProvider,
    private interactionMode: InteractionMode,
    foodMemory: Readonly<Record<string, string>> = {}
  ) {
    this.foodMemory = { ...foodMemory };
  }

  public get snapshot(): SessionSnapshot {
    return {
      state: this.state,
      history: [...this.history],
      current_turn: this.currentTurn,
      interaction_mode: this.interactionMode,
      food_memory: { ...this.foodMemory },
      ai_provider: this.aiProvider,
      ai_model: this.aiModel
    };
  }

  public async submit(message: string): Promise<ConversationTurn> {
    if (this.state !== "ready" && this.state !== "collecting") {
      throw new InvalidSessionTransition("A sessão não está coletando dados.");
    }
    return this.send(message);
  }

  public async correct(correction: string): Promise<ConversationTurn> {
    if (this.state !== "awaiting_confirmation") {
      throw new InvalidSessionTransition("Não há dados aguardando correção.");
    }
    return this.send(`${CORRECTION_PREFIX} ${this.requiredMessage(correction)}`);
  }

  public submitManual(message: string, turn: ConversationTurn): ConversationTurn {
    if (this.state !== "ready") {
      throw new InvalidSessionTransition("Inicie uma nova refeição antes do preenchimento manual.");
    }
    if (!isConversationTurnComplete(turn)) {
      throw new Error("Preencha todos os dados da refeição manual.");
    }
    const normalizedMessage = this.requiredMessage(message);
    this.history.push({ user_message: normalizedMessage, assistant_turn: turn });
    this.currentTurn = turn;
    this.aiProvider = "manual";
    this.aiModel = "deterministic";
    this.state = "awaiting_confirmation";
    return turn;
  }

  public confirm(): ConversationTurn {
    if (this.state !== "awaiting_confirmation" || this.currentTurn === null) {
      throw new InvalidSessionTransition("Não há dados completos aguardando confirmação.");
    }
    this.state = "confirmed";
    return this.currentTurn;
  }

  public changeInteractionMode(mode: InteractionMode): void {
    this.interactionMode = mode;
  }

  public async reset(): Promise<void> {
    await this.provider.reset();
    this.state = "ready";
    this.history = [];
    this.currentTurn = null;
    this.aiProvider = null;
    this.aiModel = null;
  }

  private async send(message: string): Promise<ConversationTurn> {
    const normalizedMessage = this.requiredMessage(message);
    const request: AiRequest = {
      message: normalizedMessage,
      history: [...this.history],
      interaction_mode: this.interactionMode,
      food_memory: { ...this.foodMemory }
    };
    const result = await this.provider.ask(request);
    const { turn } = result;

    this.history.push({ user_message: normalizedMessage, assistant_turn: turn });
    this.currentTurn = turn;
    this.aiProvider = result.provider;
    this.aiModel = result.model;
    this.foodMemory = mergeFoodMemory(this.foodMemory, turn.food_memory_updates);
    this.state = isConversationTurnComplete(turn) ? "awaiting_confirmation" : "collecting";
    return turn;
  }

  private requiredMessage(message: string): string {
    const normalized = message.trim();
    if (!normalized) {
      throw new Error("A mensagem não pode estar vazia.");
    }
    return normalized;
  }
}

export function createConversationTurn(
  reply: string,
  fields: Partial<Omit<ConversationTurn, "reply" | "food_memory_updates" | "meal_items">> & {
    meal_items?: ConversationTurn["meal_items"];
    food_memory_updates?: readonly FoodMemoryUpdate[];
  } = {}
): ConversationTurn {
  return {
    reply,
    total_carbohydrates: fields.total_carbohydrates ?? null,
    glucose: fields.glucose ?? null,
    glucose_trend: fields.glucose_trend ?? null,
    meal_type: fields.meal_type ?? null,
    meal_items: fields.meal_items ?? [],
    food_memory_updates: fields.food_memory_updates ?? []
  };
}
