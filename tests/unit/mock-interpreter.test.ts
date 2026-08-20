import { describe, it, expect } from "vitest";

import { MockInterpreter } from "../../src/adapters/interpreter-mock/mock-interpreter.js";
import type {
  InterpretedItem,
  MealInterpretation,
} from "../../src/domain/types.js";

// Testes do MockInterpreter e do contrato MealInterpretation (Req 3.8, 18.4).
//
// O interpretador é heurístico e determinístico; portanto os testes afirmam:
//   - invariantes ROBUSTAS do parsing (glicemia, tipo de refeição, presença de
//     nomes de alimentos esperados, pertencimento em missingInformation);
//   - o CONTRATO de forma de maneira ESTRITA (chaves exatas, ausência de dose,
//     formato de cada item, limite de 50 itens).
//
// Não afirmamos arrays exatos de itens onde detalhes de parsing podem variar.

// --- Helpers de contrato ---

// As cinco chaves canônicas do contrato MealInterpretation.
const CONTRACT_KEYS = ["glucose", "glucoseTrend", "meal", "items", "missingInformation"];

// Verifica estritamente a forma do contrato: chaves exatas, ausência de
// qualquer campo de dose, e formato válido de cada item (Req 3.1, 3.5, 3.9).
function assertContractShape(result: MealInterpretation): void {
  const keys = Object.keys(result).sort();
  expect(keys).toEqual([...CONTRACT_KEYS].sort());

  // Nenhum campo de dose de insulina, sob qualquer nome (Req 3.9, 3.10).
  expect(result).not.toHaveProperty("dose");
  expect(result).not.toHaveProperty("insulin");
  expect(result).not.toHaveProperty("insulinDose");

  // glucose: número > 0 ou null (Req 3.3).
  if (result.glucose !== null) {
    expect(typeof result.glucose).toBe("number");
    expect(result.glucose).toBeGreaterThan(0);
  }
  expect(result.glucoseTrend === null || result.glucoseTrend === undefined || ["RISING_RAPIDLY", "RISING", "CHANGING_SLOWLY", "FALLING", "FALLING_RAPIDLY"]).toBe(true);

  // meal: MealType válido ou null (Req 3.4).
  if (result.meal !== null) {
    expect(["BREAKFAST", "LUNCH", "SNACK", "DINNER"]).toContain(result.meal);
  }

  // items: array com no máximo 50 itens (Req 3.5).
  expect(Array.isArray(result.items)).toBe(true);
  expect(result.items.length).toBeLessThanOrEqual(50);
  for (const item of result.items) {
    expect(Object.keys(item).sort()).toEqual(
      ["foodName", "quantity", "unit"].sort(),
    );
    expect(typeof item.foodName).toBe("string");
    expect(item.foodName.length).toBeGreaterThan(0);
    if (item.quantity !== null) {
      expect(typeof item.quantity).toBe("number");
      expect(item.quantity).toBeGreaterThan(0);
    }
    expect(item.unit === null || typeof item.unit === "string").toBe(true);
  }

  // missingInformation: subconjunto dos valores válidos (Req 3.6).
  expect(Array.isArray(result.missingInformation)).toBe(true);
  for (const missing of result.missingInformation) {
    expect(["GLUCOSE", "MEAL", "FOOD_QUANTITY", "FOOD"]).toContain(missing);
  }
}

// Localiza um item pelo nome (insensível a acentos/maiúsculas) via substring.
function findItem(
  items: readonly InterpretedItem[],
  namePart: string,
): InterpretedItem | undefined {
  const target = namePart
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return items.find((item) =>
    item.foodName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .includes(target),
  );
}

describe("MockInterpreter — mensagem completa (Req 3.8, 18.4)", () => {
  const message =
    "Minha glicemia está 165 e vou jantar 3 colheres de arroz, uma concha de feijão e um bife.";

  it("extrai glicemia, refeição e itens, sem informações faltantes", async () => {
    const interpreter = new MockInterpreter();
    const result = await interpreter.interpret(message);

    assertContractShape(result);

    // Glicemia explícita.
    expect(result.glucose).toBe(165);
    // Jantar → DINNER.
    expect(result.meal).toBe("DINNER");

    // Alimentos esperados presentes (invariantes robustas).
    const arroz = findItem(result.items, "arroz");
    const feijao = findItem(result.items, "feijao");
    const bife = findItem(result.items, "bife");

    expect(arroz).toBeDefined();
    expect(arroz?.quantity).toBe(3);
    expect(arroz?.unit).toContain("colher");

    expect(feijao).toBeDefined();
    expect(feijao?.quantity).toBe(1);
    expect(feijao?.unit).toBe("concha");

    expect(bife).toBeDefined();
    expect(bife?.quantity).toBe(1);
    expect(bife?.unit).toBeNull();

    // Nada faltando: tudo resolvido.
    expect(result.missingInformation).toEqual([]);
  });
});

describe("MockInterpreter — tendências da glicose", () => {
  it.each([
    ["seta-glicose-aumentando-rapidamente", "RISING_RAPIDLY"],
    ["seta-glicose-aumentando", "RISING"],
    ["seta-glicose-mudando-lentamente", "CHANGING_SLOWLY"],
    ["seta-glicose-caindo", "FALLING"],
    ["seta-glicose-caindo-rapidamente", "FALLING_RAPIDLY"],
  ] as const)("reconhece %s", async (indicator, expected) => {
    const result = await new MockInterpreter().interpret(`glicemia 150 ${indicator}`);
    expect(result.glucoseTrend).toBe(expected);
  });
});

describe("MockInterpreter — mensagem incompleta (Req 3.8, 18.4)", () => {
  it("separa alimentos ligados por 'com'", async () => {
    const result = await new MockInterpreter().interpret(
      "vou comer um pão com manteiga e tomar uma xícara de café",
    );

    const pao = findItem(result.items, "pão");
    const manteiga = findItem(result.items, "manteiga");
    const cafe = findItem(result.items, "café");

    expect(pao?.quantity).toBe(1);
    expect(manteiga?.quantity).toBeNull();
    expect(cafe?.quantity).toBe(1);
    expect(cafe?.unit).toBe("xicara");
  });

  it("sem glicemia: glucose null e GLUCOSE em missingInformation", async () => {
    const interpreter = new MockInterpreter();
    const result = await interpreter.interpret(
      "vou almoçar 2 colheres de arroz",
    );

    assertContractShape(result);

    expect(result.glucose).toBeNull();
    expect(result.meal).toBe("LUNCH");
    expect(findItem(result.items, "arroz")).toBeDefined();
    expect(result.missingInformation).toContain("GLUCOSE");
  });

  it("sem refeição: MEAL em missingInformation", async () => {
    const interpreter = new MockInterpreter();
    const result = await interpreter.interpret(
      "Minha glicemia está 130, comi 2 colheres de arroz",
    );

    assertContractShape(result);

    expect(result.glucose).toBe(130);
    expect(result.meal).toBeNull();
    expect(findItem(result.items, "arroz")).toBeDefined();
    expect(result.missingInformation).toContain("MEAL");
  });

  it("alimento sem quantidade: FOOD_QUANTITY em missingInformation", async () => {
    const interpreter = new MockInterpreter();
    const result = await interpreter.interpret(
      "Minha glicemia está 150 e vou jantar arroz",
    );

    assertContractShape(result);

    expect(result.glucose).toBe(150);
    expect(result.meal).toBe("DINNER");
    const arroz = findItem(result.items, "arroz");
    expect(arroz).toBeDefined();
    expect(arroz?.quantity).toBeNull();
    expect(result.missingInformation).toContain("FOOD_QUANTITY");
  });
});

describe("MockInterpreter — mensagem vazia/em branco (Req 3.7, 3.8)", () => {
  it("string vazia: contrato vazio com todas as quatro ausências", async () => {
    const interpreter = new MockInterpreter();
    const result = await interpreter.interpret("");

    assertContractShape(result);

    expect(result.glucose).toBeNull();
    expect(result.meal).toBeNull();
    expect(result.items).toEqual([]);
    expect(result.missingInformation).toEqual(
      expect.arrayContaining(["GLUCOSE", "MEAL", "FOOD_QUANTITY", "FOOD"]),
    );
    expect(result.missingInformation).toHaveLength(4);
  });

  it("somente espaços em branco: mesmo comportamento da string vazia", async () => {
    const interpreter = new MockInterpreter();
    const result = await interpreter.interpret("   \t  \n ");

    assertContractShape(result);

    expect(result.glucose).toBeNull();
    expect(result.meal).toBeNull();
    expect(result.items).toEqual([]);
    expect(result.missingInformation).toEqual(
      expect.arrayContaining(["GLUCOSE", "MEAL", "FOOD_QUANTITY", "FOOD"]),
    );
    expect(result.missingInformation).toHaveLength(4);
  });
});

describe("MockInterpreter — roteiro pré-programado (Req 3.11)", () => {
  it("retorna a interpretação mapeada e a sanitiza (remove dose)", async () => {
    const phrase = "frase exata roteirizada";
    const scriptedValue = {
      glucose: 120,
      meal: "LUNCH",
      items: [{ foodName: "arroz", quantity: 2, unit: "colher" }],
      missingInformation: [],
      // Campo de dose ilegal: DEVE ser removido pela sanitização (Req 3.9, 3.10).
      dose: 5,
    } as unknown as MealInterpretation;

    const scripted = new Map<string, MealInterpretation>([
      [phrase, scriptedValue],
    ]);
    const interpreter = new MockInterpreter(scripted);

    const result = await interpreter.interpret(phrase);

    assertContractShape(result);
    expect(result).not.toHaveProperty("dose");
    expect(result.glucose).toBe(120);
    expect(result.meal).toBe("LUNCH");
    expect(result.items).toEqual([
      { foodName: "arroz", quantity: 2, unit: "colher" },
    ]);
    expect(result.missingInformation).toEqual([]);
  });

  it("correspondência de roteiro considera o texto após trim", async () => {
    const phrase = "outra frase roteirizada";
    const scriptedValue: MealInterpretation = {
      glucose: 90,
      meal: "BREAKFAST",
      items: [],
      missingInformation: ["FOOD"],
    };
    const scripted = new Map<string, MealInterpretation>([
      [phrase, scriptedValue],
    ]);
    const interpreter = new MockInterpreter(scripted);

    const result = await interpreter.interpret(`   ${phrase}   `);

    assertContractShape(result);
    expect(result.glucose).toBe(90);
    expect(result.meal).toBe("BREAKFAST");
    expect(result.missingInformation).toEqual(["FOOD"]);
  });
});

describe("MockInterpreter — garantias de contrato e determinismo (Req 18.4)", () => {
  const samples = [
    "Minha glicemia está 165 e vou jantar 3 colheres de arroz, uma concha de feijão e um bife.",
    "vou almoçar 2 colheres de arroz",
    "Minha glicemia está 130, comi 2 colheres de arroz",
    "Minha glicemia está 150 e vou jantar arroz",
    "",
    "   ",
  ];

  it("toda interpretação satisfaz a forma do contrato", async () => {
    const interpreter = new MockInterpreter();
    for (const sample of samples) {
      const result = await interpreter.interpret(sample);
      assertContractShape(result);
    }
  });

  it("interpretar o mesmo texto duas vezes produz resultados iguais", async () => {
    const interpreter = new MockInterpreter();
    for (const sample of samples) {
      const first = await interpreter.interpret(sample);
      const second = await interpreter.interpret(sample);
      expect(first).toEqual(second);
    }
  });
});
