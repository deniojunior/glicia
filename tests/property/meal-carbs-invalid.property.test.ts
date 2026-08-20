import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  calculateMealCarbs,
  round2,
  type ResolvedItem,
} from "../../src/domain/meals/calculate-meal-carbs.js";

/**
 * Teste de propriedade — itens inválidos/não resolvidos são excluídos.
 *
 * Feature: glicia, Property 7: Itens inválidos ou não resolvidos são
 * excluídos, preservando os válidos.
 *
 * Dada uma lista mista de itens válidos e inválidos (inválido = quantity <= 0 /
 * NaN / +Infinity, ou servingQuantity <= 0), `calculateMealCarbs`:
 *   - inclui exatamente os itens válidos em `perItem` (a contagem coincide);
 *   - lista exatamente os itens inválidos em `unresolved` com reason
 *     INVALID_QUANTITY (a contagem coincide);
 *   - `totalCarbohydrates` é igual a round2(soma apenas dos carbs válidos), ou
 *     seja, itens inválidos nunca afetam o total;
 *   - os carbs computados dos itens válidos são preservados independentemente de
 *     quantos itens inválidos são intercalados.
 *
 * A estratégia gera itens etiquetados como válidos/inválidos e os intercala
 * aleatoriamente. A verificação de preservação compara o resultado da lista
 * mista com o resultado de uma execução contendo apenas os itens válidos.
 *
 * Validates: Requirements 5.5, 5.6, 4.8
 */
describe("Feature: glicia, Property 7: Itens inválidos ou não resolvidos são excluídos, preservando os válidos", () => {
  // Gerador de um item VÁLIDO: quantity > 0 finita, servingQuantity > 0 finita
  // e carbsPerServing finito.
  const validEntry = fc
    .record({
      foodName: fc.string({ minLength: 1, maxLength: 20 }),
      unit: fc.oneof(fc.constant(null), fc.string({ maxLength: 8 })),
      quantity: fc.double({
        min: Math.fround(0.0001),
        max: 1000,
        noNaN: true,
        noDefaultInfinity: true,
      }),
      servingQuantity: fc.double({
        min: Math.fround(0.0001),
        max: 1000,
        noNaN: true,
        noDefaultInfinity: true,
      }),
      carbsPerServing: fc.double({
        min: 0,
        max: 500,
        noNaN: true,
        noDefaultInfinity: true,
      }),
    })
    .map((r) => ({ valid: true as const, ...r }));

  // Gerador de uma quantity INVÁLIDA: <= 0, NaN ou +Infinity.
  const invalidQuantity = fc.oneof(
    fc.double({ min: -1000, max: 0, noNaN: true, noDefaultInfinity: true }),
    fc.constant(Number.NaN),
    fc.constant(Number.POSITIVE_INFINITY),
  );

  // Gerador de um item INVÁLIDO. Duas famílias garantem invalidez:
  //   (a) quantity inválida (<= 0 / NaN / +Infinity) com servingQuantity válida;
  //   (b) quantity válida com servingQuantity <= 0.
  // Em ambos os casos carbsPerServing é finito, isolando o motivo da rejeição.
  const invalidEntry = fc
    .oneof(
      fc.record({
        foodName: fc.string({ minLength: 1, maxLength: 20 }),
        unit: fc.oneof(fc.constant(null), fc.string({ maxLength: 8 })),
        quantity: invalidQuantity,
        servingQuantity: fc.double({
          min: Math.fround(0.0001),
          max: 1000,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        carbsPerServing: fc.double({
          min: 0,
          max: 500,
          noNaN: true,
          noDefaultInfinity: true,
        }),
      }),
      fc.record({
        foodName: fc.string({ minLength: 1, maxLength: 20 }),
        unit: fc.oneof(fc.constant(null), fc.string({ maxLength: 8 })),
        quantity: fc.double({
          min: Math.fround(0.0001),
          max: 1000,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        servingQuantity: fc.double({
          min: -1000,
          max: 0,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        carbsPerServing: fc.double({
          min: 0,
          max: 500,
          noNaN: true,
          noDefaultInfinity: true,
        }),
      }),
    )
    .map((r) => ({ valid: false as const, ...r }));

  // Lista mista, intercalando válidos e inválidos aleatoriamente.
  const mixedList = fc.array(fc.oneof(validEntry, invalidEntry), {
    maxLength: 30,
  });

  it("exclui inválidos, preserva válidos e mantém o total independente dos inválidos", () => {
    fc.assert(
      fc.property(mixedList, (entries) => {
        // Atribui foodName/foodId únicos por posição para asserções exatas.
        const tagged = entries.map((e, i) => ({
          valid: e.valid,
          item: {
            foodName: `${e.foodName}#${i}`,
            quantity: e.quantity,
            unit: e.unit,
            carbsPerServing: e.carbsPerServing,
            servingQuantity: e.servingQuantity,
            foodId: `food-${i}`,
          } satisfies ResolvedItem,
        }));

        const items = tagged.map((t) => t.item);
        const validItems = tagged.filter((t) => t.valid).map((t) => t.item);
        const invalidItems = tagged.filter((t) => !t.valid).map((t) => t.item);

        const result = calculateMealCarbs(items);
        // Execução de referência apenas com os itens válidos.
        const validOnly = calculateMealCarbs(validItems);

        // perItem contém exatamente os itens válidos (contagem coincide).
        expect(result.perItem.length).toBe(validItems.length);

        // unresolved contém exatamente os itens inválidos, todos com
        // reason INVALID_QUANTITY (contagem coincide).
        expect(result.unresolved.length).toBe(invalidItems.length);
        expect(
          result.unresolved.every((u) => u.reason === "INVALID_QUANTITY"),
        ).toBe(true);
        expect(result.unresolved.map((u) => u.foodName)).toEqual(
          invalidItems.map((i) => i.foodName),
        );

        // Os carbs computados dos válidos são preservados, independentemente de
        // quantos inválidos foram intercalados.
        expect(result.perItem).toEqual(validOnly.perItem);

        // O total é a soma apenas dos carbs válidos (inválidos não afetam).
        const expectedTotal = round2(
          validOnly.perItem.reduce((acc, p) => acc + p.carbohydrates, 0),
        );
        expect(result.totalCarbohydrates).toBe(expectedTotal);
        expect(result.totalCarbohydrates).toBe(validOnly.totalCarbohydrates);
      }),
      { numRuns: 100 },
    );
  });
});
