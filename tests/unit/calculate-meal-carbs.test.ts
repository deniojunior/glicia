import { describe, it, expect } from "vitest";
import {
  calculateMealCarbs,
  round2,
  type ResolvedItem,
} from "../../src/domain/meals/calculate-meal-carbs.js";

// Testes unitários de calculateMealCarbs e round2 (Req 5.1, 5.4, 5.5, 5.6).
//
// Regra por item (Req 5.1):
//   carbItem = round2(quantity * carbsPerServing / servingQuantity)
// Total (Req 5.2): round2(soma dos itens válidos).
// Itens com quantidade inválida (<= 0, NaN, Infinity, ausente) ou
// servingQuantity <= 0 são excluídos com reason INVALID_QUANTITY, sem
// interromper o cálculo dos demais (Req 5.5, 5.6).

// Fábrica de item resolvido válido, com overrides pontuais.
function makeItem(overrides: Partial<ResolvedItem> = {}): ResolvedItem {
  return {
    foodName: "arroz",
    quantity: 3,
    unit: "colher",
    carbsPerServing: 28,
    servingQuantity: 50,
    foodId: "food-arroz",
    ...overrides,
  };
}

describe("round2", () => {
  it("arredonda para 2 casas decimais (metade para cima em positivos)", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.345)).toBe(2.35);
    expect(round2(0.125)).toBe(0.13);
  });

  it("mantém valores já com <= 2 casas inalterados", () => {
    expect(round2(1.68)).toBe(1.68);
    expect(round2(10)).toBe(10);
    expect(round2(0)).toBe(0);
  });
});

describe("calculateMealCarbs — itens válidos (Req 5.1, 5.2, 5.4)", () => {
  it("multiplica o carboidrato por porções informadas em medidas caseiras", () => {
    const result = calculateMealCarbs([makeItem({ quantity: 2, quantityMode: "SERVINGS", carbsPerServing: 5, servingQuantity: 50, unit: "1 xícara de café" })]);
    expect(result.totalCarbohydrates).toBe(10);
  });
  it("calcula CHO por item e o total com arredondamento a 2 casas", () => {
    // arroz: 3 colheres, 28g CHO por porção de 50g → 3 * 28 / 50 = 1.68
    const arroz = makeItem();

    const result = calculateMealCarbs([arroz]);

    expect(result.perItem).toEqual([
      { foodId: "food-arroz", foodName: "arroz", carbohydrates: 1.68 },
    ]);
    expect(result.totalCarbohydrates).toBe(1.68);
    expect(result.unresolved).toEqual([]);
  });

  it("soma corretamente múltiplos itens válidos (Req 5.2)", () => {
    // arroz: 3 * 28 / 50 = 1.68
    const arroz = makeItem();
    // feijão: 1 * 15 / 80 = 0.1875 → 0.19
    const feijao = makeItem({
      foodName: "feijão",
      quantity: 1,
      carbsPerServing: 15,
      servingQuantity: 80,
      foodId: "food-feijao",
    });

    const result = calculateMealCarbs([arroz, feijao]);

    expect(result.perItem).toEqual([
      { foodId: "food-arroz", foodName: "arroz", carbohydrates: 1.68 },
      { foodId: "food-feijao", foodName: "feijão", carbohydrates: 0.19 },
    ]);
    // total = round2(1.68 + 0.19) = 1.87
    expect(result.totalCarbohydrates).toBe(1.87);
    expect(result.unresolved).toEqual([]);
  });
});

describe("calculateMealCarbs — quantidade inválida (Req 5.6)", () => {
  it("exclui item com quantity <= 0 e mantém os demais", () => {
    const invalido = makeItem({ foodName: "salada", quantity: 0, foodId: "food-salada" });
    const arroz = makeItem();

    const result = calculateMealCarbs([invalido, arroz]);

    expect(result.perItem).toEqual([
      { foodId: "food-arroz", foodName: "arroz", carbohydrates: 1.68 },
    ]);
    expect(result.totalCarbohydrates).toBe(1.68);
    expect(result.unresolved).toEqual([
      { foodName: "salada", reason: "INVALID_QUANTITY" },
    ]);
  });

  it("exclui item com quantity negativa", () => {
    const invalido = makeItem({ foodName: "pão", quantity: -2, foodId: "food-pao" });

    const result = calculateMealCarbs([invalido]);

    expect(result.perItem).toEqual([]);
    expect(result.totalCarbohydrates).toBe(0);
    expect(result.unresolved).toEqual([
      { foodName: "pão", reason: "INVALID_QUANTITY" },
    ]);
  });

  it("exclui item com quantity NaN (quantidade ausente/não numérica)", () => {
    const invalido = makeItem({ foodName: "macarrão", quantity: NaN, foodId: "food-macarrao" });
    const arroz = makeItem();

    const result = calculateMealCarbs([arroz, invalido]);

    expect(result.perItem).toEqual([
      { foodId: "food-arroz", foodName: "arroz", carbohydrates: 1.68 },
    ]);
    expect(result.totalCarbohydrates).toBe(1.68);
    expect(result.unresolved).toEqual([
      { foodName: "macarrão", reason: "INVALID_QUANTITY" },
    ]);
  });

  it("exclui item com quantity Infinity (não finita)", () => {
    const invalido = makeItem({
      foodName: "batata",
      quantity: Number.POSITIVE_INFINITY,
      foodId: "food-batata",
    });

    const result = calculateMealCarbs([invalido]);

    expect(result.perItem).toEqual([]);
    expect(result.totalCarbohydrates).toBe(0);
    expect(result.unresolved).toEqual([
      { foodName: "batata", reason: "INVALID_QUANTITY" },
    ]);
  });
});

describe("calculateMealCarbs — servingQuantity inválida (Req 5.6)", () => {
  it("exclui item com servingQuantity <= 0 (evita divisão inválida)", () => {
    const invalido = makeItem({
      foodName: "bolo",
      servingQuantity: 0,
      foodId: "food-bolo",
    });
    const arroz = makeItem();

    const result = calculateMealCarbs([invalido, arroz]);

    expect(result.perItem).toEqual([
      { foodId: "food-arroz", foodName: "arroz", carbohydrates: 1.68 },
    ]);
    expect(result.totalCarbohydrates).toBe(1.68);
    expect(result.unresolved).toEqual([
      { foodName: "bolo", reason: "INVALID_QUANTITY" },
    ]);
  });
});

describe("calculateMealCarbs — mistura de válidos e inválidos (Req 5.5, 5.6)", () => {
  it("soma apenas os itens válidos e lista todos os inválidos", () => {
    const arroz = makeItem(); // 1.68
    const feijao = makeItem({
      foodName: "feijão",
      quantity: 1,
      carbsPerServing: 15,
      servingQuantity: 80,
      foodId: "food-feijao",
    }); // 0.19
    const semQuantidade = makeItem({
      foodName: "alface",
      quantity: NaN,
      foodId: "food-alface",
    });
    const quantidadeZero = makeItem({
      foodName: "tomate",
      quantity: 0,
      foodId: "food-tomate",
    });

    const result = calculateMealCarbs([
      arroz,
      semQuantidade,
      feijao,
      quantidadeZero,
    ]);

    // Apenas arroz e feijão entram no total.
    expect(result.perItem).toEqual([
      { foodId: "food-arroz", foodName: "arroz", carbohydrates: 1.68 },
      { foodId: "food-feijao", foodName: "feijão", carbohydrates: 0.19 },
    ]);
    expect(result.totalCarbohydrates).toBe(1.87);
    expect(result.unresolved).toEqual([
      { foodName: "alface", reason: "INVALID_QUANTITY" },
      { foodName: "tomate", reason: "INVALID_QUANTITY" },
    ]);
  });
});

describe("calculateMealCarbs — lista vazia", () => {
  it("retorna total 0, perItem vazio e unresolved vazio", () => {
    const result = calculateMealCarbs([]);

    expect(result.perItem).toEqual([]);
    expect(result.totalCarbohydrates).toBe(0);
    expect(result.unresolved).toEqual([]);
  });
});
