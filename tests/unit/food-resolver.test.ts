import { describe, it, expect } from "vitest";

import {
  FoodResolver,
  normalizeName,
  type ResolutionOutcome,
} from "../../src/domain/foods/food-resolver.js";
import type {
  Food,
  FoodMeasure,
  Repository,
} from "../../src/domain/ports/repository.js";
import type { InterpretedItem } from "../../src/domain/types.js";

// Testes unitários do FoodResolver (Requisito 4).
//
// Estratégia: um repositório fake escrito à mão (object literal) que implementa
// os métodos usados pela resolução em dois passos. Cada teste dirige um ramo
// específico da cadeia:
//   Passo 1 (identidade): alias exato → nome exato → candidatos (0 / 1 / >1)
//   Passo 2 (medida): findMeasuresByFoodId → RESOLVED / AMBIGUOUS
// O fake também registra as chaves recebidas para verificar a normalização.
//
// Modelo NORMALIZADO: `Food` carrega apenas identidade ({id,name,active}); os
// valores nutricionais vêm de `FoodMeasure` (findMeasuresByFoodId).

// --- Fixtures ---

function makeFood(overrides: Partial<Food> = {}): Food {
  return {
    id: "food-1",
    name: "Arroz",
    active: true,
    ...overrides,
  };
}

function makeMeasure(overrides: Partial<FoodMeasure> = {}): FoodMeasure {
  return {
    id: "measure-1",
    foodId: "food-1",
    servingUnit: "colher",
    servingQuantity: 25,
    carbohydrates: 6,
    active: true,
    ...overrides,
  };
}

function makeItem(overrides: Partial<InterpretedItem> = {}): InterpretedItem {
  return {
    foodName: "arroz",
    quantity: 3,
    unit: "colher",
    ...overrides,
  };
}

// Métodos de leitura de alimentos exigidos pelo FoodResolver (dois passos).
type FoodRepo = Pick<
  Repository,
  | "findFoodByAliasExact"
  | "findFoodByNameExact"
  | "findFoodCandidates"
  | "findMeasuresByFoodId"
>;

// Fake configurável que também captura as chaves normalizadas recebidas.
interface FakeSetup {
  alias?: Food | null;
  name?: Food | null;
  candidates?: Food[];
  // Medidas por foodId (Passo 2). Ausência → [] (sem dado nutricional).
  measures?: Record<string, FoodMeasure[]>;
}

interface FakeCalls {
  aliasKeys: string[];
  nameKeys: string[];
  candidateKeys: string[];
  measureFoodIds: string[];
}

function makeFakeRepo(setup: FakeSetup = {}): {
  repo: FoodRepo;
  calls: FakeCalls;
} {
  const calls: FakeCalls = {
    aliasKeys: [],
    nameKeys: [],
    candidateKeys: [],
    measureFoodIds: [],
  };

  const repo: FoodRepo = {
    async findFoodByAliasExact(key: string): Promise<Food | null> {
      calls.aliasKeys.push(key);
      return setup.alias ?? null;
    },
    async findFoodByNameExact(key: string): Promise<Food | null> {
      calls.nameKeys.push(key);
      return setup.name ?? null;
    },
    async findFoodCandidates(key: string): Promise<Food[]> {
      calls.candidateKeys.push(key);
      return setup.candidates ?? [];
    },
    async findMeasuresByFoodId(foodId: string): Promise<FoodMeasure[]> {
      calls.measureFoodIds.push(foodId);
      return setup.measures?.[foodId] ?? [];
    },
  };

  return { repo, calls };
}

describe("normalizeName (Req 4.2)", () => {
  it("apara espaços nas extremidades e converte para minúsculas", () => {
    expect(normalizeName("  ARROZ  ")).toBe("arroz");
    expect(normalizeName("Feijão Preto")).toBe("feijão preto");
    expect(normalizeName("\tPão\n")).toBe("pão");
  });

  it("é idempotente (normalizar duas vezes não muda o resultado)", () => {
    const once = normalizeName("  ARROZ Integral  ");
    expect(normalizeName(once)).toBe(once);
  });
});

describe("FoodResolver.resolveItem — cadeia de precedência (Req 4.1)", () => {
  it("resolve por alias exato (Req 4.3) e alias tem precedência sobre nome/candidatos (Req 4.1)", async () => {
    const aliasFood = makeFood({ id: "alias-food", name: "Arroz Branco" });
    const nameFood = makeFood({ id: "name-food", name: "Arroz" });
    const candidate = makeFood({ id: "cand-food", name: "Arroz Integral" });

    // Todos os níveis casariam; alias deve vencer. Uma única medida no alias
    // garante RESOLVED, e seus valores nutricionais devem aparecer no item.
    const { repo, calls } = makeFakeRepo({
      alias: aliasFood,
      name: nameFood,
      candidates: [candidate],
      measures: {
        "alias-food": [
          makeMeasure({
            id: "m-alias",
            foodId: "alias-food",
            servingUnit: "colher",
            servingQuantity: 30,
            carbohydrates: 10,
          }),
        ],
      },
    });
    const resolver = new FoodResolver(repo);

    const outcome = await resolver.resolveItem(makeItem());

    expect(outcome.kind).toBe("RESOLVED");
    if (outcome.kind !== "RESOLVED") return;
    expect(outcome.item.foodId).toBe("alias-food");
    // Valores nutricionais vêm da medida do alimento resolvido.
    expect(outcome.item.carbsPerServing).toBe(10);
    expect(outcome.item.servingQuantity).toBe(30);
    // Para no primeiro nível: nome e candidatos não são consultados (Req 4.1).
    expect(calls.aliasKeys).toEqual(["arroz"]);
    expect(calls.nameKeys).toEqual([]);
    expect(calls.candidateKeys).toEqual([]);
  });

  it("resolve por nome exato quando não há alias (Req 4.4)", async () => {
    const nameFood = makeFood({ id: "name-food", name: "Arroz" });
    const candidate = makeFood({ id: "cand-food", name: "Arroz Integral" });

    const { repo, calls } = makeFakeRepo({
      alias: null,
      name: nameFood,
      candidates: [candidate],
      measures: {
        "name-food": [
          makeMeasure({
            id: "m-name",
            foodId: "name-food",
            servingUnit: "colher",
            servingQuantity: 20,
            carbohydrates: 8,
          }),
        ],
      },
    });
    const resolver = new FoodResolver(repo);

    const outcome = await resolver.resolveItem(makeItem());

    expect(outcome.kind).toBe("RESOLVED");
    if (outcome.kind !== "RESOLVED") return;
    expect(outcome.item.foodId).toBe("name-food");
    // Valores nutricionais vêm da medida do alimento resolvido.
    expect(outcome.item.carbsPerServing).toBe(8);
    expect(outcome.item.servingQuantity).toBe(20);
    // Nome tem precedência sobre candidatos: candidatos não são consultados.
    expect(calls.aliasKeys).toEqual(["arroz"]);
    expect(calls.nameKeys).toEqual(["arroz"]);
    expect(calls.candidateKeys).toEqual([]);
  });

  it("resolve por exatamente 1 candidato quando não há alias/nome exato (Req 4.5)", async () => {
    const candidate = makeFood({ id: "cand-food", name: "Arroz Integral" });

    const { repo, calls } = makeFakeRepo({
      alias: null,
      name: null,
      candidates: [candidate],
      measures: {
        "cand-food": [
          makeMeasure({
            id: "m-cand",
            foodId: "cand-food",
            servingUnit: "colher",
            servingQuantity: 15,
            carbohydrates: 4,
          }),
        ],
      },
    });
    const resolver = new FoodResolver(repo);

    const outcome = await resolver.resolveItem(makeItem());

    expect(outcome.kind).toBe("RESOLVED");
    if (outcome.kind !== "RESOLVED") return;
    expect(outcome.item.foodId).toBe("cand-food");
    // Valores nutricionais vêm da medida do alimento resolvido.
    expect(outcome.item.carbsPerServing).toBe(4);
    expect(outcome.item.servingQuantity).toBe(15);
    // Toda a cadeia de identidade foi percorrida até os candidatos.
    expect(calls.aliasKeys).toEqual(["arroz"]);
    expect(calls.nameKeys).toEqual(["arroz"]);
    expect(calls.candidateKeys).toEqual(["arroz"]);
  });

  it("retorna UNRESOLVED quando há 0 candidatos (Req 4.8)", async () => {
    const { repo } = makeFakeRepo({
      alias: null,
      name: null,
      candidates: [],
    });
    const resolver = new FoodResolver(repo);

    const outcome = await resolver.resolveItem(makeItem({ foodName: "xyz" }));

    expect(outcome.kind).toBe("UNRESOLVED");
    if (outcome.kind !== "UNRESOLVED") return;
    // Preserva o nome original informado pela paciente.
    expect(outcome.foodName).toBe("xyz");
  });

  it("retorna AMBIGUOUS com a lista de pares alimento+medida quando há >1 candidato (Req 4.6)", async () => {
    const c1 = makeFood({ id: "c1", name: "Arroz Branco" });
    const c2 = makeFood({ id: "c2", name: "Arroz Integral" });
    const c3 = makeFood({ id: "c3", name: "Arroz Doce" });

    const { repo } = makeFakeRepo({
      alias: null,
      name: null,
      candidates: [c1, c2, c3],
      // Cada candidato precisa de ao menos uma medida para virar par.
      measures: {
        c1: [makeMeasure({ id: "m1", foodId: "c1" })],
        c2: [makeMeasure({ id: "m2", foodId: "c2" })],
        c3: [makeMeasure({ id: "m3", foodId: "c3" })],
      },
    });
    const resolver = new FoodResolver(repo);

    const outcome = await resolver.resolveItem(makeItem());

    expect(outcome.kind).toBe("AMBIGUOUS");
    if (outcome.kind !== "AMBIGUOUS") return;
    expect(outcome.foodName).toBe("arroz");
    // Candidatos agora são ResolvedFoodMeasure[]; verifica pelos ids dos foods.
    const candidateFoodIds = outcome.candidates.map(
      (candidate) => candidate.food.id,
    );
    expect(candidateFoodIds).toEqual(["c1", "c2", "c3"]);
  });

  it("usa a chave normalizada nas buscas (case/space insensível — Req 4.2)", async () => {
    // Item com espaços e maiúsculas; o fake deve receber "arroz".
    const { repo, calls } = makeFakeRepo({
      alias: null,
      name: null,
      candidates: [],
    });
    const resolver = new FoodResolver(repo);

    await resolver.resolveItem(makeItem({ foodName: "  ARROZ  " }));

    expect(calls.aliasKeys).toEqual(["arroz"]);
    expect(calls.nameKeys).toEqual(["arroz"]);
    expect(calls.candidateKeys).toEqual(["arroz"]);
  });

  it("RESOLVED carrega valores nutricionais da medida e preserva foodName/quantity do item (Req 4.9)", async () => {
    const food = makeFood({ id: "food-42", name: "Arroz" });

    const { repo } = makeFakeRepo({
      alias: food,
      measures: {
        "food-42": [
          makeMeasure({
            id: "m-42",
            foodId: "food-42",
            servingUnit: "colher de sopa",
            servingQuantity: 25,
            carbohydrates: 6,
          }),
        ],
      },
    });
    const resolver = new FoodResolver(repo);

    const item = makeItem({
      foodName: "arroz do almoço",
      quantity: 3,
      unit: "colher de sopa",
    });
    const outcome = await resolver.resolveItem(item);

    expect(outcome.kind).toBe("RESOLVED");
    if (outcome.kind !== "RESOLVED") return;
    // Valores nutricionais vêm da medida (FoodMeasure).
    expect(outcome.item.foodId).toBe("food-42");
    expect(outcome.item.carbsPerServing).toBe(6);
    expect(outcome.item.servingQuantity).toBe(25);
    // unit resolvido vem da medida; foodName/quantity são preservados do item.
    expect(outcome.item.unit).toBe("colher de sopa");
    expect(outcome.item.foodName).toBe("arroz do almoço");
    expect(outcome.item.quantity).toBe(3);
  });

  it("coage quantity ausente para NaN no RESOLVED, delegando validação ao cálculo (Req 4/5.6)", async () => {
    const food = makeFood();
    const { repo } = makeFakeRepo({
      alias: food,
      measures: {
        [food.id]: [makeMeasure({ foodId: food.id, servingUnit: "colher" })],
      },
    });
    const resolver = new FoodResolver(repo);

    const outcome = await resolver.resolveItem(makeItem({ quantity: null }));

    expect(outcome.kind).toBe("RESOLVED");
    if (outcome.kind !== "RESOLVED") return;
    expect(Number.isNaN(outcome.item.quantity)).toBe(true);
  });
});

describe("FoodResolver.resolveAll (Req 4.1)", () => {
  it("preserva a ordem dos itens de entrada", async () => {
    const arroz = makeFood({ id: "arroz", name: "arroz" });
    const feijao = makeFood({ id: "feijao", name: "feijao" });

    // Fake que resolve por nome exato conforme a chave recebida, e fornece
    // uma medida por alimento para alcançar RESOLVED.
    const byName: Record<string, Food> = { arroz, feijao };
    const measuresByFoodId: Record<string, FoodMeasure[]> = {
      arroz: [makeMeasure({ id: "m-arroz", foodId: "arroz", servingUnit: "colher" })],
      feijao: [makeMeasure({ id: "m-feijao", foodId: "feijao", servingUnit: "colher" })],
    };
    const repo: FoodRepo = {
      async findFoodByAliasExact(): Promise<Food | null> {
        return null;
      },
      async findFoodByNameExact(key: string): Promise<Food | null> {
        return byName[key] ?? null;
      },
      async findFoodCandidates(): Promise<Food[]> {
        return [];
      },
      async findMeasuresByFoodId(foodId: string): Promise<FoodMeasure[]> {
        return measuresByFoodId[foodId] ?? [];
      },
    };
    const resolver = new FoodResolver(repo);

    const items: InterpretedItem[] = [
      makeItem({ foodName: "arroz" }),
      makeItem({ foodName: "inexistente" }),
      makeItem({ foodName: "feijao" }),
    ];

    const outcomes: ResolutionOutcome[] = await resolver.resolveAll(items);

    expect(outcomes).toHaveLength(3);
    expect(outcomes[0]!.kind).toBe("RESOLVED");
    expect(outcomes[1]!.kind).toBe("UNRESOLVED");
    expect(outcomes[2]!.kind).toBe("RESOLVED");

    const first = outcomes[0]!;
    const third = outcomes[2]!;
    if (first.kind === "RESOLVED") expect(first.item.foodId).toBe("arroz");
    if (third.kind === "RESOLVED") expect(third.item.foodId).toBe("feijao");
  });
});
