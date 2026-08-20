// tests/unit/openai-interpreter.test.ts
//
// Testes unitários do OpenAiInterpreter (Req 20.2, 2.5, 2.6).
//
// 100% OFFLINE: a implementação de `fetch` é sempre injetada (`fetchImpl`),
// portanto NENHUMA chamada de rede real é feita. As respostas são "latas"
// (canned) no formato da OpenAI Responses API.

import { describe, it, expect } from "vitest";
import {
  OpenAiInterpreter,
  OpenAiInterpreterError,
  MEAL_INTERPRETATION_SCHEMA,
} from "../../src/adapters/interpreter-openai/openai-interpreter.js";

// Constrói um fetch falso que captura a requisição e devolve `response`.
// `response` pode ser um objeto Response real ou um erro a ser lançado.
interface CapturedRequest {
  url: string;
  init: RequestInit | undefined;
}

function makeFakeFetch(
  response: Response | (() => never),
): { fetchImpl: typeof fetch; captured: CapturedRequest[] } {
  const captured: CapturedRequest[] = [];
  const fetchImpl = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    captured.push({ url: String(input), init });
    if (typeof response === "function") {
      response();
    }
    return response;
  }) as unknown as typeof fetch;
  return { fetchImpl, captured };
}

// Envelopa um payload no formato da Responses API com `output_text`.
function responseWithOutputText(payload: unknown, status = 200): Response {
  const body = {
    output_text: JSON.stringify(payload),
    // Também inclui a estrutura output[] para realismo; a extração deve
    // preferir output_text quando presente.
    output: [
      {
        content: [{ type: "output_text", text: JSON.stringify(payload) }],
      },
    ],
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Envelopa um payload usando SOMENTE a estrutura output[].content[] (sem
// output_text de nível superior).
function responseWithNestedContent(payload: unknown): Response {
  const body = {
    output: [
      {
        content: [{ type: "output_text", text: JSON.stringify(payload) }],
      },
    ],
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("OpenAiInterpreter (offline, fetch injetado)", () => {
  it("mapeia uma mensagem completa para o contrato canônico, sem campo de dose", async () => {
    const modelOutput = {
      glucose: 165,
      meal: "DINNER",
      items: [{ foodName: "arroz", quantity: 3, unit: "colheres" }],
      missingInformation: [],
    };
    const { fetchImpl } = makeFakeFetch(responseWithOutputText(modelOutput));

    const interpreter = new OpenAiInterpreter({
      apiKey: "test-key",
      fetchImpl,
    });

    const result = await interpreter.interpret(
      "Glicemia 165 e vou jantar 3 colheres de arroz",
    );

    expect(Object.keys(result).sort()).toEqual(
      ["glucose", "glucoseTrend", "items", "meal", "missingInformation"].sort(),
    );
    expect(result).not.toHaveProperty("dose");
    expect(result).not.toHaveProperty("insulinDose");
    expect(result.glucose).toBe(165);
    expect(result.meal).toBe("DINNER");
    expect(result.items).toEqual([
      { foodName: "arroz", quantity: 3, unit: "colheres" },
    ]);
    expect(result.missingInformation).toEqual([]);
  });

  it("descarta qualquer campo de dose e chaves extras via sanitização", async () => {
    const modelOutput = {
      glucose: 120,
      meal: "LUNCH",
      dose: 6,
      insulinDose: 6,
      items: [
        {
          foodName: "feijão",
          quantity: 1,
          unit: "concha",
          carbs: 15,
          calories: 100,
        },
      ],
      missingInformation: ["FOOD_QUANTITY", "FOOD_QUANTITY"],
    };
    const { fetchImpl } = makeFakeFetch(responseWithOutputText(modelOutput));

    const interpreter = new OpenAiInterpreter({
      apiKey: "test-key",
      fetchImpl,
    });

    const result = await interpreter.interpret("almoço com feijão");

    // Apenas os cinco campos do contrato permanecem.
    expect(Object.keys(result).sort()).toEqual(
      ["glucose", "glucoseTrend", "items", "meal", "missingInformation"].sort(),
    );
    expect(result).not.toHaveProperty("dose");
    expect(result).not.toHaveProperty("insulinDose");

    // Cada item conserva apenas foodName, quantity, unit.
    expect(result.items).toHaveLength(1);
    expect(Object.keys(result.items[0]!).sort()).toEqual(
      ["foodName", "quantity", "unit"].sort(),
    );
    expect(result.items[0]).toEqual({
      foodName: "feijão",
      quantity: 1,
      unit: "concha",
    });

    // Duplicatas em missingInformation são removidas.
    expect(result.missingInformation).toEqual(["FOOD_QUANTITY"]);
  });

  it("extrai a saída via output[].content[] quando não há output_text de topo", async () => {
    const modelOutput = {
      glucose: null,
      meal: "BREAKFAST",
      items: [{ foodName: "pão", quantity: 2, unit: "fatias" }],
      missingInformation: ["GLUCOSE"],
    };
    const { fetchImpl } = makeFakeFetch(responseWithNestedContent(modelOutput));

    const interpreter = new OpenAiInterpreter({
      apiKey: "test-key",
      fetchImpl,
    });

    const result = await interpreter.interpret("café com 2 fatias de pão");

    expect(result.glucose).toBeNull();
    expect(result.meal).toBe("BREAKFAST");
    expect(result.items).toEqual([
      { foodName: "pão", quantity: 2, unit: "fatias" },
    ]);
    expect(result.missingInformation).toEqual(["GLUCOSE"]);
  });

  it("rejeita com OpenAiInterpreterError quando a API key está ausente", async () => {
    const { fetchImpl, captured } = makeFakeFetch(
      responseWithOutputText({
        glucose: null,
        meal: null,
        items: [],
        missingInformation: [],
      }),
    );

    // apiKey explicitamente vazio (não cai no env).
    const interpreter = new OpenAiInterpreter({ apiKey: "", fetchImpl });

    await expect(interpreter.interpret("qualquer coisa")).rejects.toBeInstanceOf(
      OpenAiInterpreterError,
    );
    // Não deve nem tentar chamar a rede.
    expect(captured).toHaveLength(0);
  });

  it("rejeita em resposta não-2xx (401) sem vazar a chave", async () => {
    const { fetchImpl } = makeFakeFetch(
      new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );

    const interpreter = new OpenAiInterpreter({
      apiKey: "super-secret-key",
      fetchImpl,
    });

    let caught: unknown;
    try {
      await interpreter.interpret("teste");
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(OpenAiInterpreterError);
    const error = caught as OpenAiInterpreterError;
    expect(error.status).toBe(401);
    // A mensagem NUNCA contém a chave (Req 15.1, 15.2).
    expect(error.message).not.toContain("super-secret-key");
  });

  it("rejeita com OpenAiInterpreterError quando o JSON de saída é malformado", async () => {
    // output_text não é JSON válido.
    const body = {
      output_text: "{ isto não é json válido ",
    };
    const { fetchImpl } = makeFakeFetch(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const interpreter = new OpenAiInterpreter({
      apiKey: "test-key",
      fetchImpl,
    });

    await expect(interpreter.interpret("teste")).rejects.toBeInstanceOf(
      OpenAiInterpreterError,
    );
  });

  it("rejeita com OpenAiInterpreterError em falha de rede", async () => {
    const { fetchImpl } = makeFakeFetch((): never => {
      throw new Error("connection refused");
    });

    const interpreter = new OpenAiInterpreter({
      apiKey: "test-key",
      fetchImpl,
    });

    await expect(interpreter.interpret("teste")).rejects.toBeInstanceOf(
      OpenAiInterpreterError,
    );
  });

  it("monta a requisição corretamente: URL, Authorization e text.format.json_schema", async () => {
    const modelOutput = {
      glucose: 100,
      meal: null,
      items: [],
      missingInformation: ["MEAL", "FOOD"],
    };
    const { fetchImpl, captured } = makeFakeFetch(
      responseWithOutputText(modelOutput),
    );

    const interpreter = new OpenAiInterpreter({
      apiKey: "test-key",
      model: "gpt-4o-mini",
      fetchImpl,
    });

    await interpreter.interpret("glicemia 100");

    expect(captured).toHaveLength(1);
    const req = captured[0]!;

    // URL termina em /responses.
    expect(req.url.endsWith("/responses")).toBe(true);

    // Authorization: Bearer test-key.
    const headers = req.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-key");
    expect(headers["Content-Type"]).toBe("application/json");

    // Corpo inclui model e text.format.type === "json_schema".
    const parsedBody = JSON.parse(String(req.init?.body)) as {
      model: string;
      text: { format: { type: string; name: string; schema: unknown } };
      input: unknown[];
    };
    expect(parsedBody.model).toBe("gpt-4o-mini");
    expect(parsedBody.text.format.type).toBe("json_schema");
    expect(parsedBody.text.format.name).toBe("meal_interpretation");
    expect(parsedBody.text.format.schema).toEqual(MEAL_INTERPRETATION_SCHEMA);
    // input traz mensagem de sistema e de usuário.
    expect(parsedBody.input).toHaveLength(2);
  });

  it("MEAL_INTERPRETATION_SCHEMA inclui contagem de carboidratos, sem campo de dose", () => {
    const schema = MEAL_INTERPRETATION_SCHEMA;
    expect(schema.required).toEqual([
      "glucose",
      "glucoseTrend",
      "meal",
      "items",
      "totalCarbohydrates",
      "missingInformation",
    ]);
    expect(schema.additionalProperties).toBe(false);
    // Nenhuma chave relacionada a dose no schema.
    const keys = Object.keys(schema.properties);
    expect(keys).not.toContain("dose");
    expect(keys).not.toContain("insulinDose");
    // Item expõe o carboidrato calculado, mas nunca uma dose.
    const itemKeys = Object.keys(schema.properties.items.items.properties);
    expect(itemKeys.sort()).toEqual(
      ["foodName", "quantity", "unit", "carbohydrates"].sort(),
    );
  });

  it("preserva a contagem de carboidratos retornada pela LLM", async () => {
    const modelOutput = {
      glucose: null,
      meal: "BREAKFAST",
      items: [
        { foodName: "Pão francês", quantity: 1, unit: "unidade", carbohydrates: 29 },
        { foodName: "Manteiga", quantity: 1, unit: "colher de chá", carbohydrates: 0 },
        { foodName: "Café sem açúcar", quantity: 1, unit: "xícara", carbohydrates: 0 },
      ],
      totalCarbohydrates: 29,
      missingInformation: ["GLUCOSE"],
    };
    const { fetchImpl, captured } = makeFakeFetch(responseWithOutputText(modelOutput));
    const interpreter = new OpenAiInterpreter({
      apiKey: "test-key",
      fetchImpl,
      foodCatalog: "Pão francês: unidade (50 g, 29 g CHO)",
    });

    const result = await interpreter.interpret("vou comer pão com manteiga e café");

    expect(result.totalCarbohydrates).toBe(29);
    expect(result.items.map((item) => item.carbohydrates)).toEqual([29, 0, 0]);
    const body = JSON.parse(String(captured[0]!.init?.body)) as {
      input: Array<{ role: string; content: string }>;
    };
    expect(body.input[0]!.content).toContain("fonte obrigatória para a contagem de carboidratos");
  });

  it("inclui catálogo, memória e histórico no contexto do prompt", async () => {
    const modelOutput = {
      glucose: null,
      meal: "BREAKFAST",
      items: [{ foodName: "café", quantity: 1, unit: "xícara" }],
      missingInformation: [],
    };
    const { fetchImpl, captured } = makeFakeFetch(responseWithOutputText(modelOutput));
    const interpreter = new OpenAiInterpreter({
      apiKey: "test-key",
      fetchImpl,
      foodCatalog: "Café coado sem açúcar — xícara 50 ml",
      foodMemory: "café => Café coado sem açúcar / xícara",
    });

    await interpreter.interpret("vou tomar café", ["café da manhã"]);
    const body = JSON.parse(String(captured[0]!.init?.body)) as {
      input: Array<{ role: string; content: string }>;
    };
    expect(body.input[0]!.content).toContain("Café coado sem açúcar");
    expect(body.input[0]!.content).toContain("PREFERÊNCIAS APRENDIDAS");
    expect(body.input.some((message) => message.content === "café da manhã")).toBe(true);
  });
});
