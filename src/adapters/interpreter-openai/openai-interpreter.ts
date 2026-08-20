// src/adapters/interpreter-openai/openai-interpreter.ts
//
// OpenAiInterpreter — implementação da porta Interpreter baseada na OpenAI
// Responses API + JSON Schema (Req 20.2, 2.5, 2.6). [FASE FUTURA]
//
// Princípio arquitetural central:
//   "IA interpreta. Banco fornece dados. Código calcula. Usuária confirma."
//
// Este adaptador APENAS interpreta linguagem natural e extrai dados
// explicitamente presentes na mensagem. O JSON Schema enviado ao modelo
// reproduz EXATAMENTE o contrato MealInterpretation, SEM qualquer campo de
// dose de insulina (Req 2.5, 20.2). Ainda assim, a saída do modelo SEMPRE
// passa por sanitizeInterpretation, garantindo um MealInterpretation bem
// formado e livre de qualquer campo de dose, independentemente do que o
// modelo retornar (Req 3.9, 3.10).
//
// O domínio permanece idêntico: qualquer Interpreter é intercambiável pelo
// mesmo pipeline (Req 2.6).
//
// Segredos (OPENAI_API_KEY) vivem exclusivamente no lado servidor (Req 15.1) e
// NUNCA são registrados em logs nem incluídos em mensagens de erro.
//
// Testabilidade: `fetchImpl` é injetável, permitindo testes 100% offline sem
// nenhuma chamada de rede real.

import type { Interpreter } from "../../domain/ports/interpreter.js";
import type { MealInterpretation } from "../../domain/types.js";
import { sanitizeInterpretation } from "../../domain/conversation/sanitize-interpretation.js";

/**
 * JSON Schema que reproduz o contrato MealInterpretation SEM campo de dose
 * (Req 20.2, 2.5). Enviado à Responses API em `text.format` com
 * `type: "json_schema"` e `strict: true`, restringindo a saída do modelo aos
 * quatro campos canônicos: glucose, meal, items, missingInformation.
 *
 * Notas de conformidade com "strict" JSON Schema da OpenAI:
 *   - todo objeto declara `additionalProperties: false`;
 *   - todas as chaves de cada objeto são listadas em `required`;
 *   - campos anuláveis usam o tipo união com "null".
 */
export const MEAL_INTERPRETATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["glucose", "glucoseTrend", "meal", "items", "totalCarbohydrates", "missingInformation"],
  properties: {
    // Glicemia em mg/dL, ou null quando ausente (Req 3.3). NUNCA inventada.
    glucose: {
      type: ["number", "null"],
      description:
        "Glicemia em mg/dL explicitamente presente na mensagem, ou null se ausente. Nunca invente este valor.",
    },
    glucoseTrend: {
      type: ["string", "null"],
      enum: ["RISING_RAPIDLY", "RISING", "CHANGING_SLOWLY", "FALLING", "FALLING_RAPIDLY", null],
      description: "Tendência da glicose explicitamente informada, ou null. É apenas descritiva e não altera dose.",
    },
    // Tipo de refeição, ou null quando ausente (Req 3.4).
    meal: {
      type: ["string", "null"],
      enum: ["BREAKFAST", "LUNCH", "SNACK", "DINNER", null],
      description:
        "Tipo de refeição explicitamente presente na mensagem, ou null se ausente.",
    },
    // Itens alimentares extraídos (Req 3.5). Sem valores nutricionais.
    items: {
      type: "array",
      description:
        "Itens alimentares explicitamente mencionados. Nunca invente alimentos, quantidades ou unidades.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["foodName", "quantity", "unit", "carbohydrates"],
        properties: {
          foodName: {
            type: "string",
            description: "Nome do alimento exatamente como mencionado.",
          },
          quantity: {
            type: ["number", "null"],
            description:
              "Quantidade explícita (> 0), ou null se não mencionada.",
          },
          unit: {
            type: ["string", "null"],
            description:
              "Unidade de medida explícita (ex.: colheres, concha), ou null.",
          },
          carbohydrates: {
            type: ["number", "null"],
            description: "Carboidratos em gramas da porção informada, calculados exclusivamente com a tabela do prompt. Zero é válido. Use null se a quantidade estiver ausente.",
          },
        },
      },
    },
    totalCarbohydrates: {
      type: ["number", "null"],
      description: "Soma dos carboidratos em gramas dos itens da refeição, calculada exclusivamente com a tabela do prompt. Zero é válido; null se não for possível calcular por falta de quantidade.",
    },
    // Informações ausentes/irresolvíveis (Req 3.6).
    missingInformation: {
      type: "array",
      description:
        "Valores dentre GLUCOSE, MEAL, FOOD_QUANTITY, FOOD que estão ausentes ou não resolvíveis na mensagem.",
      items: {
        type: "string",
        enum: ["GLUCOSE", "MEAL", "FOOD_QUANTITY", "FOOD"],
      },
    },
  },
} as const;

/**
 * Prompt de sistema (em português) que restringe o comportamento do modelo ao
 * papel de interpretar a refeição e calcular os carboidratos exclusivamente
 * a partir da tabela recebida no contexto. Nunca decide dose de insulina.
 */
const SYSTEM_PROMPT = [
  "Você é um interpretador de linguagem natural para registro glicêmico.",
  "Sua função é interpretar a refeição e calcular carboidratos usando EXCLUSIVAMENTE a tabela de alimentos recebida no contexto.",
  "Identifique os componentes citados separadamente (por exemplo, pão com manteiga são dois itens).",
  "Para cada item, escolha o alimento e a medida mais compatíveis da tabela; use o nome e a unidade exatamente como aparecem nela.",
  "Calcule carbohydrates de cada porção e totalCarbohydrates em gramas a partir dos valores da tabela. Itens sem carboidratos devem receber 0.",
  "Se a quantidade impedir o cálculo, use null em carbohydrates/totalCarbohydrates e indique FOOD_QUANTITY.",
  "Nunca invente glicemia, alimentos, quantidades ou unidades que não estejam na mensagem ou na tabela.",
  "NUNCA calcule, recomende ou informe dose de insulina — isso é proibido e fora do seu papel.",
  "Produza estritamente os campos do schema: glucose, meal, items, totalCarbohydrates, missingInformation.",
  "Use null quando um campo não estiver explicitamente presente na mensagem.",
  "glucose é a glicemia em mg/dL (número > 0) ou null.",
  "glucoseTrend é a tendência explicitamente indicada: RISING_RAPIDLY, RISING, CHANGING_SLOWLY, FALLING, FALLING_RAPIDLY, ou null. Ela é somente descritiva e nunca altera a dose.",
  "meal é um dentre BREAKFAST, LUNCH, SNACK, DINNER, ou null.",
  "Cada item tem foodName, quantity, unit e carbohydrates.",
  "Em missingInformation, liste os valores dentre GLUCOSE, MEAL, FOOD_QUANTITY, FOOD",
  "que estiverem ausentes ou não puderem ser resolvidos a partir da mensagem.",
].join(" ");

/** Códigos de erro tipados do adaptador. */
export type OpenAiInterpreterErrorCode =
  | "MISSING_API_KEY"
  | "HTTP_ERROR"
  | "NETWORK_ERROR"
  | "INVALID_RESPONSE";

/**
 * Erro tipado do OpenAiInterpreter. NUNCA contém a API key nem qualquer
 * segredo (Req 15.1, 15.2). Pode carregar o `status` HTTP quando aplicável.
 */
export class OpenAiInterpreterError extends Error {
  readonly code: OpenAiInterpreterErrorCode;
  readonly status?: number;

  constructor(
    code: OpenAiInterpreterErrorCode,
    message: string,
    status?: number,
  ) {
    super(message);
    this.name = "OpenAiInterpreterError";
    this.code = code;
    if (status !== undefined) {
      this.status = status;
    }
  }
}

/** Opções de construção do OpenAiInterpreter. Todas com padrões sensatos. */
export interface OpenAiInterpreterOptions {
  /** Chave da API OpenAI. Padrão: `process.env.OPENAI_API_KEY`. */
  apiKey?: string;
  /** Modelo a usar. Padrão: `process.env.OPENAI_MODEL ?? "gpt-4o-mini"`. */
  model?: string;
  /** URL base da API. Padrão: `process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"`. */
  baseUrl?: string;
  /** Implementação de fetch injetável (para testes offline). Padrão: `globalThis.fetch`. */
  fetchImpl?: typeof fetch;
  /** Timeout da requisição em ms (via AbortController). Padrão: 30000. */
  timeoutMs?: number;
  /**
   * Catálogo de alimentos usado como contexto do mesmo diálogo. Pode ser um
   * texto pronto ou um loader assíncrono (útil quando a base é semeada depois
   * da composição da aplicação). O catálogo é contexto, nunca uma fonte de
   * decisão de dose.
   */
  foodCatalog?: string | (() => Promise<string>);
  /** Preferências aprendidas da paciente, serializadas como contexto. */
  foodMemory?: string | (() => Promise<string>);
}

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TIMEOUT_MS = 30000;

/** Formato mínimo esperado de um bloco de conteúdo da Responses API. */
interface ResponsesContentBlock {
  type?: unknown;
  text?: unknown;
}

/** Formato mínimo esperado de um item de saída da Responses API. */
interface ResponsesOutputItem {
  content?: unknown;
}

/**
 * OpenAiInterpreter — converte texto em MealInterpretation via OpenAI Responses
 * API com JSON Schema. Puro exceto pelo `fetchImpl` injetado.
 */
export class OpenAiInterpreter implements Interpreter {
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly foodCatalog: string | (() => Promise<string>) | undefined;
  private readonly foodMemory: string | (() => Promise<string>) | undefined;

  constructor(options: OpenAiInterpreterOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    this.model = options.model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
    this.baseUrl =
      options.baseUrl ?? process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.foodCatalog = options.foodCatalog;
    this.foodMemory = options.foodMemory;
  }

  /**
   * Interpreta `text` chamando a Responses API e retorna sempre um
   * MealInterpretation sanitizado (bem formado e sem campo de dose — Req 3.9,
   * 3.10). Lança OpenAiInterpreterError em ausência de chave, erro HTTP, erro
   * de rede/abort ou resposta inválida. Segredos jamais são vazados.
   */
  async interpret(
    text: string,
    conversationContext: readonly string[] = [],
  ): Promise<MealInterpretation> {
    if (this.apiKey === undefined || this.apiKey.length === 0) {
      // Segredo ausente: não há chave para logar; mensagem sem valores sensíveis.
      throw new OpenAiInterpreterError(
        "MISSING_API_KEY",
        "OpenAI API key ausente. Defina OPENAI_API_KEY (segredo server-side).",
      );
    }

    const catalog = typeof this.foodCatalog === "function"
      ? await this.foodCatalog()
      : this.foodCatalog;
    const memory = typeof this.foodMemory === "function"
      ? await this.foodMemory()
      : this.foodMemory;
    const contextParts = [
      catalog?.trim()
        ? `TABELA DE ALIMENTOS — fonte obrigatória para a contagem de carboidratos:\n${catalog}`
        : "",
      memory?.trim()
        ? `PREFERÊNCIAS APRENDIDAS DA PACIENTE (aplique quando a expressão aparecer; a quantidade da mensagem atual prevalece):\n${memory}`
        : "",
    ].filter(Boolean);
    const systemPrompt = contextParts.length > 0
      ? `${SYSTEM_PROMPT}\n\n${contextParts.join("\n\n")}`
      : SYSTEM_PROMPT;

    const contextMessages = conversationContext.map((message) => ({
      role: "user" as const,
      content: message,
    }));
    const body = {
      model: this.model,
      input: [
        { role: "system", content: systemPrompt },
        ...contextMessages,
        { role: "user", content: text },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "meal_interpretation",
          strict: true,
          schema: MEAL_INTERPRETATION_SCHEMA,
        },
      },
    };

    const url = `${this.baseUrl}/responses`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      // Erro de rede ou abort (timeout). Não inclui a chave na mensagem.
      const reason = err instanceof Error ? err.message : String(err);
      throw new OpenAiInterpreterError(
        "NETWORK_ERROR",
        `Falha de rede ao chamar a OpenAI Responses API: ${reason}`,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      // Erro HTTP: inclui apenas o status, NUNCA a chave (Req 15.1, 15.2).
      throw new OpenAiInterpreterError(
        "HTTP_ERROR",
        `OpenAI Responses API retornou status ${response.status}.`,
        response.status,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new OpenAiInterpreterError(
        "INVALID_RESPONSE",
        `Não foi possível ler o corpo JSON da resposta da OpenAI: ${reason}`,
      );
    }

    const jsonText = extractOutputText(payload);
    if (jsonText === null) {
      throw new OpenAiInterpreterError(
        "INVALID_RESPONSE",
        "Resposta da OpenAI não contém texto de saída interpretável.",
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new OpenAiInterpreterError(
        "INVALID_RESPONSE",
        `Saída da OpenAI não é JSON válido: ${reason}`,
      );
    }

    // Blindagem final: qualquer campo de dose ou extra é ignorado (Req 3.9, 3.10).
    return sanitizeInterpretation(parsed);
  }
}

// Verifica se um valor é um registro (objeto não-nulo).
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Extrai, de forma robusta, o texto JSON da resposta da Responses API:
 *   1) prefere um `output_text` de nível superior, quando for string;
 *   2) caso contrário, percorre `output[].content[]` e usa o `.text` do
 *      primeiro bloco cujo `type` seja "output_text" (ou "text").
 * Retorna null quando nada utilizável é encontrado.
 */
function extractOutputText(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  // 1) Atalho de conveniência da Responses API.
  if (typeof payload.output_text === "string" && payload.output_text.length > 0) {
    return payload.output_text;
  }

  // 2) Caminho estruturado: output[].content[].
  const output = payload.output;
  if (!Array.isArray(output)) {
    return null;
  }

  for (const item of output as ResponsesOutputItem[]) {
    if (!isRecord(item)) {
      continue;
    }
    const content = item.content;
    if (!Array.isArray(content)) {
      continue;
    }
    for (const block of content as ResponsesContentBlock[]) {
      if (!isRecord(block)) {
        continue;
      }
      if (
        (block.type === "output_text" || block.type === "text") &&
        typeof block.text === "string"
      ) {
        return block.text;
      }
    }
  }

  return null;
}
