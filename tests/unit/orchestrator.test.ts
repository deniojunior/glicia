import { describe, it, expect, beforeEach } from "vitest";

import { ConversationOrchestrator } from "../../src/domain/conversation/orchestrator.js";
import { FoodResolver } from "../../src/domain/foods/food-resolver.js";
import { MockInterpreter } from "../../src/adapters/interpreter-mock/mock-interpreter.js";
import {
  InMemoryRepository,
  InMemoryChannel,
} from "../../src/adapters/persistence/in-memory-repository.js";
import type { MealInterpretation } from "../../src/domain/types.js";

// Testes unitários do ConversationOrchestrator (Req 6.3, 6.4, 6.6, 6.7, 4.7, 11.5).
//
// Estratégia: monta um orquestrador REAL ligado a um repositório em memória, um
// canal em memória e um MockInterpreter com um ROTEIRO determinístico (mapa
// texto → MealInterpretation). O roteiro remove a dependência do parser
// heurístico e torna cada cenário previsível. Um relógio controlável permite
// exercitar a janela de confirmação de 10 minutos (Req 6.6).

// --- Helpers de construção ---

interface Harness {
  repo: InMemoryRepository;
  channel: InMemoryChannel;
  orchestrator: ConversationOrchestrator;
  advanceClock: (ms: number) => void;
}

// Constrói um harness completo com o relógio inicial informado e o roteiro do
// interpretador. `seed` recebe o repositório para semear alimentos.
function makeHarness(
  scripted: Map<string, MealInterpretation>,
  seed: (repo: InMemoryRepository) => void,
): Harness {
  const repo = new InMemoryRepository();
  seed(repo);

  const interpreter = new MockInterpreter(scripted);
  const resolver = new FoodResolver(repo);
  const channel = new InMemoryChannel();

  let now = new Date("2025-01-01T12:00:00.000Z");
  const clock = (): Date => now;

  const orchestrator = new ConversationOrchestrator(
    interpreter,
    resolver,
    repo,
    channel,
    clock,
  );
  channel.onMessage((msg) => orchestrator.handleInbound(msg));

  return {
    repo,
    channel,
    orchestrator,
    advanceClock: (ms: number): void => {
      now = new Date(now.getTime() + ms);
    },
  };
}

// Semeia arroz/feijão/bife com aliases para resolução exata por alias. No
// modelo NORMALIZADO, cada alimento recebe uma ÚNICA medida (food_measure) com
// os mesmos números de antes; `addFoodWithMeasure` cria identidade + medida em
// uma só chamada. A unidade da medida (servingUnit) é escolhida para casar
// exatamente com a unidade usada nas interpretações roteirizadas (ex.: arroz em
// "colher"), garantindo resolução RESOLVED com medida única.
function seedBasicFoods(repo: InMemoryRepository): void {
  repo.addFoodWithMeasure(
    {
      name: "Arroz branco cozido",
      servingUnit: "colher",
      servingQuantity: 25,
      carbohydrates: 6,
      active: true,
    },
    ["arroz"],
  );
  repo.addFoodWithMeasure(
    {
      name: "Feijão carioca cozido",
      servingUnit: "concha",
      servingQuantity: 80,
      carbohydrates: 12,
      active: true,
    },
    ["feijão", "feijao"],
  );
  repo.addFoodWithMeasure(
    {
      name: "Bife grelhado",
      servingUnit: "unidade",
      servingQuantity: 100,
      carbohydrates: 0,
      active: true,
    },
    ["bife"],
  );
}

// Interpretação completa e resolvível: glicemia 165, jantar, 3 colheres de arroz.
function completeInterpretation(): MealInterpretation {
  return {
    glucose: 165,
    meal: "DINNER",
    items: [{ foodName: "arroz", quantity: 3, unit: "colher" }],
    missingInformation: [],
  };
}

const LAST = (sent: string[]): string => sent[sent.length - 1] ?? "";

describe("ConversationOrchestrator — confirmação afirmativa (Req 6.3)", () => {
  it("apresenta o resumo com total de CHO e, após 'sim', persiste a refeição e reporta a dose", async () => {
    const scripted = new Map<string, MealInterpretation>([
      ["completa", completeInterpretation()],
    ]);
    const { repo, channel } = makeHarness(scripted, seedBasicFoods);

    // 1) Mensagem completa → apresentação para confirmação (Req 6.1, 6.2).
    await channel.receive("completa");

    expect(repo.getMeals()).toHaveLength(0);
    const presentation = LAST(channel.getSent());
    expect(presentation).toContain("Total de carboidratos");
    // 3 colheres: 3 porções de 6 g = 18 g.
    expect(presentation).toContain("18 g");

    // 2) Confirmação afirmativa → calcula + persiste (Req 6.3).
    await channel.receive("sim");

    const meals = repo.getMeals();
    expect(meals).toHaveLength(1);

    const finalMsg = LAST(channel.getSent());
    expect(finalMsg).toContain("Dose calculada");

    // Status canônico COMPLETED (Req 16.3).
    const convo = repo.getConversation(meals[0]!.conversationId);
    expect(convo?.status).toBe("COMPLETED");
  });
});

describe("ConversationOrchestrator — correção/rejeição (Req 6.4)", () => {
  it("não persiste, volta a ACTIVE e pergunta qual dado ajustar", async () => {
    const scripted = new Map<string, MealInterpretation>([
      ["completa", completeInterpretation()],
    ]);
    const { repo, channel } = makeHarness(scripted, seedBasicFoods);

    await channel.receive("completa");

    // Resposta de correção explícita.
    await channel.receive("não, muda a glicemia");

    // Nenhuma refeição persistida (Req 6.4).
    expect(repo.getMeals()).toHaveLength(0);

    const msg = LAST(channel.getSent());
    // Solicita o dado específico a ajustar.
    expect(msg.toLowerCase()).toContain("ajustar");
  });
});

describe("ConversationOrchestrator — resposta de confirmação ambígua (Req 6.7)", () => {
  it("não persiste e reapresenta o resumo, re-solicitando confirmação explícita", async () => {
    const scripted = new Map<string, MealInterpretation>([
      ["completa", completeInterpretation()],
    ]);
    const { repo, channel } = makeHarness(scripted, seedBasicFoods);

    await channel.receive("completa");
    const sentAfterPresentation = channel.getSent().length;

    // Resposta não reconhecida como afirmação nem correção.
    await channel.receive("talvez");

    expect(repo.getMeals()).toHaveLength(0);

    // Reapresenta o resumo (o total de CHO aparece novamente).
    const sentAfterAmbiguous = channel.getSent();
    expect(sentAfterAmbiguous.length).toBeGreaterThan(sentAfterPresentation);
    const totalOccurrences = sentAfterAmbiguous.filter((m) =>
      m.includes("Total de carboidratos"),
    ).length;
    expect(totalOccurrences).toBeGreaterThanOrEqual(2);
    expect(LAST(sentAfterAmbiguous)).toContain("Total de carboidratos");
  });
});

describe("ConversationOrchestrator — timeout de confirmação (Req 6.6)", () => {
  it("após 10 min sem resposta, não calcula/persiste e informa expiração; mantém WAITING_CONFIRMATION", async () => {
    const scripted = new Map<string, MealInterpretation>([
      ["completa", completeInterpretation()],
    ]);
    const { repo, channel, advanceClock } = makeHarness(
      scripted,
      seedBasicFoods,
    );

    await channel.receive("completa");

    // Avança o relógio para além da janela de 10 minutos.
    advanceClock(11 * 60 * 1000);

    await channel.receive("sim");

    // Nada calculado/persistido (Req 6.6).
    expect(repo.getMeals()).toHaveLength(0);

    // Mensagem de expiração enviada.
    const messages = channel.getSent();
    const hasTimeoutMessage = messages.some(
      (m) => m.includes("expirou") || m.includes("10 min"),
    );
    expect(hasTimeoutMessage).toBe(true);
  });
});

describe("ConversationOrchestrator — dados insuficientes (Req 11.5)", () => {
  it("pede apenas a glicemia quando ela está ausente e não avança para confirmação", async () => {
    const scripted = new Map<string, MealInterpretation>([
      [
        "sem glicemia",
        {
          glucose: null,
          meal: "DINNER",
          items: [{ foodName: "arroz", quantity: 3, unit: "colher" }],
          missingInformation: ["GLUCOSE"],
        },
      ],
    ]);
    const { repo, channel } = makeHarness(scripted, seedBasicFoods);

    await channel.receive("sem glicemia");

    // Não persiste e não apresenta confirmação.
    expect(repo.getMeals()).toHaveLength(0);

    const msg = LAST(channel.getSent());
    expect(msg.toLowerCase()).toContain("glicemia");
    // Ainda não é a apresentação para confirmação.
    expect(msg).not.toContain("Total de carboidratos");
  });

  it("aplica um número isolado à quantidade pendente, sem repetir a pergunta", async () => {
    const scripted = new Map<string, MealInterpretation>([
      [
        "refeição sem quantidade",
        {
          glucose: 160,
          meal: "DINNER",
          items: [{ foodName: "arroz", quantity: null, unit: "colher" }],
          missingInformation: ["FOOD_QUANTITY"],
        },
      ],
    ]);
    const { channel } = makeHarness(scripted, seedBasicFoods);

    await channel.receive("refeição sem quantidade");
    expect(LAST(channel.getSent())).toContain("Qual a quantidade");

    await channel.receive("1");
    expect(LAST(channel.getSent())).toContain("Confirme os dados da refeição");
  });

  it("prioriza a resposta de glicemia antes de uma ambiguidade pendente", async () => {
    const scripted = new Map<string, MealInterpretation>([
      [
        "pão sem glicemia",
        {
          glucose: null,
          meal: "BREAKFAST",
          items: [{ foodName: "pão", quantity: 1, unit: "unidade" }],
          missingInformation: ["GLUCOSE"],
        },
      ],
    ]);
    const { channel } = makeHarness(scripted, (repo) => {
      repo.addFoodWithMeasure(
        { name: "Pão francês", servingUnit: "unidade", servingQuantity: 50, carbohydrates: 28, active: true },
        ["pão"],
      );
      repo.addFoodWithMeasure(
        { name: "Pão de leite", servingUnit: "unidade", servingQuantity: 50, carbohydrates: 25, active: true },
        ["pão"],
      );
    });

    await channel.receive("pão sem glicemia");
    expect(LAST(channel.getSent())).toContain("glicemia");

    await channel.receive("160");
    const response = LAST(channel.getSent());
    expect(response).toContain('Para "pão" encontrei mais de uma opção');
    expect(response).not.toContain("glicemia agora");
  });

  it("não deixa uma resposta curta de glicemia alterar a quantidade do alimento", async () => {
    const scripted = new Map<string, MealInterpretation>([
      [
        "manteiga sem glicemia",
        {
          glucose: null,
          meal: "BREAKFAST",
          items: [{ foodName: "manteiga", quantity: null, unit: "colher" }],
          missingInformation: ["GLUCOSE", "FOOD_QUANTITY"],
        },
      ],
      // Simula uma LLM que tentaria associar o valor ao último alimento. O
      // orquestrador não deve sequer usar esta interpretação para "160".
      [
        "160",
        {
          glucose: 160,
          meal: null,
          items: [{ foodName: "manteiga", quantity: 160, unit: "colher" }],
          missingInformation: [],
        },
      ],
    ]);
    const { channel } = makeHarness(scripted, (repo) => {
      repo.addFoodWithMeasure(
        { name: "Manteiga", servingUnit: "colher", servingQuantity: 4, carbohydrates: 0, active: true },
        ["manteiga"],
      );
    });

    await channel.receive("manteiga sem glicemia");
    expect(LAST(channel.getSent())).toContain("glicemia");

    await channel.receive("160");
    const response = LAST(channel.getSent());
    expect(response).toContain("Qual a quantidade");
    expect(response).toContain("Manteiga");
    expect(response).not.toContain("160 colheres");
  });

  it("usa o total de carboidratos retornado pela LLM na confirmação", async () => {
    const scripted = new Map<string, MealInterpretation>([
      [
        "café da manhã pela LLM",
        {
          glucose: 160,
          meal: "BREAKFAST",
          items: [{ foodName: "arroz", quantity: 1, unit: "colher", carbohydrates: 29 }],
          totalCarbohydrates: 29,
          missingInformation: [],
        },
      ],
    ]);
    const { channel } = makeHarness(scripted, seedBasicFoods);

    await channel.receive("café da manhã pela LLM");
    const confirmation = LAST(channel.getSent());
    expect(confirmation).toContain("(29 g)");
    expect(confirmation).toContain("Total de carboidratos: 29 g");
  });
});

describe("ConversationOrchestrator — seleção inválida entre candidatos (Req 4.7)", () => {
  // No modelo NORMALIZADO a ambiguidade também surge de UM único alimento com
  // MÚLTIPLAS medidas (food_measure): quando o item interpretado não informa a
  // unidade (unit null) e o alimento tem mais de uma medida, a resolução é
  // AMBÍGUA listando os pares alimento+medida (Req 4.6). Semeamos "arroz" com
  // duas medidas para forçar candidates.length === 2.
  function seedAmbiguousArroz(repo: InMemoryRepository): void {
    const arroz = repo.addFood({ name: "arroz" });
    repo.addMeasure({
      foodId: arroz.id,
      servingUnit: "colher de sopa",
      servingQuantity: 25,
      carbohydrates: 6,
    });
    repo.addMeasure({
      foodId: arroz.id,
      servingUnit: "escumadeira",
      servingQuantity: 90,
      carbohydrates: 22,
    });
  }

  it("apresenta candidatos, rejeita seleção fora de faixa e prossegue com seleção válida", async () => {
    const scripted = new Map<string, MealInterpretation>([
      [
        "arroz ambiguo",
        {
          glucose: 165,
          meal: "DINNER",
          // unit null + alimento com duas medidas → AMBÍGUO (Req 4.6).
          items: [{ foodName: "arroz", quantity: 1, unit: null }],
          missingInformation: [],
        },
      ],
    ]);
    const { repo, channel } = makeHarness(scripted, seedAmbiguousArroz);

    // 1) Ambiguidade → apresenta a lista de pares alimento+medida (Req 4.6). O
    // prompt lista "N) <nome> (<unidade da medida>)"; asserimos pelas unidades.
    await channel.receive("arroz ambiguo");
    const ambiguityPrompt = LAST(channel.getSent());
    expect(ambiguityPrompt).toContain("colher de sopa");
    expect(ambiguityPrompt).toContain("escumadeira");
    expect(repo.getMeals()).toHaveLength(0);

    // 2) Seleção inválida (fora da faixa) → re-solicita escolher exatamente um (Req 4.7).
    await channel.receive("9");
    const reprompt = LAST(channel.getSent());
    expect(reprompt).toContain("colher de sopa");
    expect(reprompt).toContain("escumadeira");
    expect(repo.getMeals()).toHaveLength(0);

    // 3) Seleção válida → prossegue para apresentação/confirmação.
    await channel.receive("1");
    const afterValid = LAST(channel.getSent());
    expect(afterValid).toContain("Total de carboidratos");
    expect(repo.getMeals()).toHaveLength(0);
  });
});
