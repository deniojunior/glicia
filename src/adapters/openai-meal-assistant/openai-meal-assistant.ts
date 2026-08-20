import type { GlucoseTrend, MealType } from "../../domain/types.js";

export interface MealAssistantTurn {
  reply: string;
  carbohydrates: number | null;
  glucose: number | null;
  glucoseTrend: GlucoseTrend | null;
  meal: MealType | null;
  ready: boolean;
}

export interface OpenAiMealAssistantOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  foodCatalog: string | (() => Promise<string>);
}

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "carbohydrates", "glucose", "glucoseTrend", "meal", "ready"],
  properties: {
    reply: { type: "string", description: "Resposta natural em português para a paciente." },
    carbohydrates: { type: ["number", "null"], description: "Total de carboidratos da refeição em gramas, calculado com a tabela." },
    glucose: { type: ["number", "null"], description: "Glicemia atual em mg/dL." },
    glucoseTrend: { type: ["string", "null"], enum: ["RISING_RAPIDLY", "RISING", "CHANGING_SLOWLY", "FALLING", "FALLING_RAPIDLY", null] },
    meal: { type: ["string", "null"], enum: ["BREAKFAST", "LUNCH", "SNACK", "DINNER", null] },
    ready: { type: "boolean", description: "True somente quando carbohydrates, glucose, glucoseTrend e meal estiverem definidos." },
  },
} as const;

const PROMPT_SKILLS = [
  "SKILL 1 — Entendimento alimentar: identifique todos os alimentos e bebidas citados, inclusive componentes como pão com manteiga.",
  "SKILL 2 — Contagem: calcule o total de carboidratos exclusivamente com a TABELA DE ALIMENTOS fornecida. Nunca invente valores; se faltar quantidade, pergunte apenas o necessário.",
  "SKILL 3 — Glicose: extraia glicemia e tendência somente quando forem informadas. Converta tendências para RISING_RAPIDLY, RISING, CHANGING_SLOWLY, FALLING ou FALLING_RAPIDLY.",
  "SKILL 4 — Condução: converse naturalmente, faça uma única pergunta objetiva por vez e mantenha os dados já informados no diálogo.",
  "SKILL 5 — Finalização: ready só pode ser true quando houver carbohydrates, glucose, glucoseTrend e meal. Não calcule nem recomende insulina; o código fará isso.",
].join("\n");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function positive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function nonNegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function outputText(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  if (typeof payload.output_text === "string") return payload.output_text;
  return null;
}

function sanitizeTurn(raw: unknown): MealAssistantTurn | null {
  if (!isRecord(raw) || typeof raw.reply !== "string") return null;
  const glucoseTrend = raw.glucoseTrend;
  const meal = raw.meal;
  const validTrend: readonly GlucoseTrend[] = ["RISING_RAPIDLY", "RISING", "CHANGING_SLOWLY", "FALLING", "FALLING_RAPIDLY"];
  const validMeal: readonly MealType[] = ["BREAKFAST", "LUNCH", "SNACK", "DINNER"];
  const result: MealAssistantTurn = {
    reply: raw.reply.trim(),
    carbohydrates: nonNegative(raw.carbohydrates),
    glucose: positive(raw.glucose),
    glucoseTrend: typeof glucoseTrend === "string" && validTrend.includes(glucoseTrend as GlucoseTrend) ? glucoseTrend as GlucoseTrend : null,
    meal: typeof meal === "string" && validMeal.includes(meal as MealType) ? meal as MealType : null,
    ready: raw.ready === true,
  };
  result.ready = result.ready && result.carbohydrates !== null && result.glucose !== null && result.glucoseTrend !== null && result.meal !== null;
  return result;
}

/** Thin OpenAI-backed chat: the model owns the conversation; this class only transports turns. */
export class OpenAiMealAssistant {
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly foodCatalog: string | (() => Promise<string>);
  private previousResponseId: string | null = null;

  constructor(options: OpenAiMealAssistantOptions) {
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    this.model = options.model ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    this.baseUrl = options.baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.foodCatalog = options.foodCatalog;
  }

  async reply(message: string): Promise<MealAssistantTurn> {
    if (!this.apiKey) throw new Error("OPENAI_API_KEY ausente.");
    const catalog = typeof this.foodCatalog === "function" ? await this.foodCatalog() : this.foodCatalog;
    const instructions = `${PROMPT_SKILLS}\n\nTABELA DE ALIMENTOS:\n${catalog}`;
    const body = {
      model: this.model,
      instructions,
      input: message,
      ...(this.previousResponseId === null ? {} : { previous_response_id: this.previousResponseId }),
      text: { format: { type: "json_schema", name: "meal_chat_turn", strict: true, schema: RESPONSE_SCHEMA } },
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/responses`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw new Error(`OpenAI Responses API retornou status ${response.status}.`);
    const payload: unknown = await response.json();
    if (isRecord(payload) && typeof payload.id === "string") this.previousResponseId = payload.id;
    const text = outputText(payload);
    if (text === null) throw new Error("A OpenAI não retornou texto para a conversa.");
    const turn = sanitizeTurn(JSON.parse(text));
    if (turn === null) throw new Error("A OpenAI retornou uma estrutura de conversa inválida.");
    return turn;
  }
}
