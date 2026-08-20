import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  calculateMealCarbs,
  round2,
  type ResolvedItem,
} from "../../src/domain/meals/calculate-meal-carbs.js";

/**
 * Teste de propriedade — total de carboidratos é a soma dos itens.
 *
 * Feature: glicia, Property 6: Total de carboidratos é a soma dos itens
 *
 * Para uma lista de ResolvedItems VÁLIDOS (quantity > 0 finita,
 * servingQuantity > 0 finita, carbsPerServing finita >= 0):
 *   - o carboidrato de cada item é round2(quantity * carbsPerServing / servingQuantity) (Req 5.1)
 *   - o total é round2(soma dos carboidratos por item) (Req 5.2)
 *   - o cálculo é determinístico a partir do código, não do interpretador (Req 5.3)
 *   - cada item resolvido tem seu carboidrato registrado individualmente (Req 5.4)
 *   - como todos os itens são válidos, perItem.length === input.length e não há itens não resolvidos.
 *
 * Os geradores são limitados a faixas finitas razoáveis para evitar ruído de
 * ponto flutuante causado por magnitudes absurdas.
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4
 */
describe("Feature: glicia, Property 6: Total de carboidratos é a soma dos itens", () => {
  // Gerador de um ResolvedItem VÁLIDO dentro de faixas finitas e realistas.
  // quantity > 0, servingQuantity > 0 e carbsPerServing >= 0, todos finitos.
  const validItem: fc.Arbitrary<ResolvedItem> = fc.record({
    foodName: fc.string({ minLength: 1, maxLength: 30 }),
    quantity: fc.double({
      min: Math.fround(0.01),
      max: 1000,
      noNaN: true,
      noDefaultInfinity: true,
    }),
    unit: fc.option(fc.string({ maxLength: 10 }), { nil: null }),
    carbsPerServing: fc.double({
      min: 0,
      max: 500,
      noNaN: true,
      noDefaultInfinity: true,
    }),
    servingQuantity: fc.double({
      min: Math.fround(0.01),
      max: 1000,
      noNaN: true,
      noDefaultInfinity: true,
    }),
    foodId: fc.string({ minLength: 1, maxLength: 12 }),
  });

  it("total é round2 da soma dos carboidratos por item e todos os itens são resolvidos", () => {
    fc.assert(
      fc.property(fc.array(validItem, { maxLength: 50 }), (items) => {
        const result = calculateMealCarbs(items);

        // Todos os itens são válidos → nenhum não resolvido (Req 5.5 inverso).
        expect(result.unresolved).toEqual([]);
        // Cada item de entrada produz exatamente um item no resultado (Req 5.4).
        expect(result.perItem.length).toBe(items.length);

        // Cada perItem é round2(quantity * carbsPerServing / servingQuantity) (Req 5.1).
        items.forEach((item, index) => {
          const expectedItemCarbs = round2(
            (item.quantity * item.carbsPerServing) / item.servingQuantity,
          );
          expect(result.perItem[index].carbohydrates).toBe(expectedItemCarbs);
        });

        // O total é round2 da soma dos carboidratos por item (Req 5.2, 5.3).
        const expectedTotal = round2(
          result.perItem.reduce((sum, p) => sum + p.carbohydrates, 0),
        );
        expect(result.totalCarbohydrates).toBe(expectedTotal);
      }),
      { numRuns: 100 },
    );
  });
});
