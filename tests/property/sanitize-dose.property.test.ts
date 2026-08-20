import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { sanitizeInterpretation } from "../../src/domain/conversation/sanitize-interpretation.js";
import type { MealType, MissingInfo } from "../../src/domain/types.js";

/**
 * Teste de propriedade — sanitização ignora campo de dose do interpretador.
 *
 * Feature: glicia, Property 12: Sanitização ignora campo de dose do
 * interpretador
 *
 * Princípio arquitetural central:
 *   "IA interpreta. Banco fornece dados. Código calcula. Usuária confirma."
 *
 * O contrato MealInterpretation NUNCA contém dose de insulina. Se um
 * interpretador (ex.: OpenAI, na fase futura) retornar qualquer campo de dose
 * ("dose", "insulin", "insulinDose", "recommendedDose") — no nível do objeto ou
 * aninhado dentro de um item — o domínio DEVE ignorá-lo (Req 3.10).
 *
 * As propriedades abaixo verificam, para objetos crus arbitrários que INCLUEM
 * campos de dose:
 *   - o resultado tem exatamente as chaves {glucose, meal, items,
 *     missingInformation} (nenhuma chave de dose/insulina/extra sobrevive);
 *   - sanitizar o objeto COM dose produz resultado idêntico a sanitizar o mesmo
 *     objeto SEM os campos de dose (a dose não influencia a saída);
 *   - campos de dose aninhados nos itens são removidos, restando apenas
 *     {foodName, quantity, unit} em cada item.
 *
 * Validates: Requirements 3.10
 */
describe("Feature: glicia, Property 12: Sanitização ignora campo de dose do interpretador", () => {
  // --- Geradores dos campos do contrato ---

  const mealTypeArb = fc.constantFrom<MealType>(
    "BREAKFAST",
    "LUNCH",
    "SNACK",
    "DINNER",
  );

  const missingInfoArb = fc.constantFrom<MissingInfo>(
    "GLUCOSE",
    "MEAL",
    "FOOD_QUANTITY",
    "FOOD",
  );

  // Glicemia válida (> 0) ou ausente (null) — Req 3.3.
  const glucoseArb = fc.oneof(
    fc.constant(null),
    fc.integer({ min: 1, max: 600 }),
  );

  // Nome de alimento não vazio e sem espaços nas extremidades, garantindo que o
  // item sobreviva à sanitização (Req 3.5) para podermos inspecionar suas chaves.
  const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");
  const foodNameArb = fc
    .array(fc.constantFrom(...LETTERS), { minLength: 1, maxLength: 20 })
    .map((chars) => chars.join(""));

  const quantityArb = fc.oneof(
    fc.constant(null),
    fc.integer({ min: 1, max: 500 }),
  );

  const unitArb = fc.oneof(fc.constant(null), fc.string({ maxLength: 12 }));

  // Item cru contendo apenas os campos do contrato.
  const baseItemArb = fc.record({
    foodName: foodNameArb,
    quantity: quantityArb,
    unit: unitArb,
  });

  // --- Geradores de campos de dose (valores arbitrários) ---

  const doseValueArb = fc.oneof(
    fc.double({ noNaN: true }),
    fc.integer(),
    fc.string(),
    fc.boolean(),
    fc.constant(null),
    fc.record({ units: fc.integer(), unit: fc.string() }),
  );

  const DOSE_KEYS = [
    "dose",
    "insulin",
    "insulinDose",
    "recommendedDose",
  ] as const;

  // Sempre inclui pelo menos um campo de dose (mín. 1 chave), com valores
  // arbitrários, cobrindo qualquer combinação de nomes de dose conhecidos.
  const doseFieldsArb = fc
    .uniqueArray(fc.constantFrom(...DOSE_KEYS), {
      minLength: 1,
      maxLength: DOSE_KEYS.length,
    })
    .chain((keys) =>
      fc.record(
        Object.fromEntries(keys.map((key) => [key, doseValueArb])),
      ),
    );

  // Objeto de interpretação cru contendo somente os campos do contrato.
  const baseInterpretationArb = fc.record({
    glucose: glucoseArb,
    meal: fc.oneof(fc.constant(null), mealTypeArb),
    items: fc.array(baseItemArb, { maxLength: 10 }),
    missingInformation: fc.uniqueArray(missingInfoArb, { maxLength: 4 }),
  });

  const CONTRACT_KEYS = ["glucose", "items", "meal", "missingInformation"];

  it("ignora campos de dose no nível do objeto: chaves exatas do contrato e resultado idêntico com/sem dose (Req 3.10)", () => {
    fc.assert(
      fc.property(baseInterpretationArb, doseFieldsArb, (base, dose) => {
        const rawWithDose = { ...base, ...dose };

        const result = sanitizeInterpretation(rawWithDose);

        // O resultado expõe exatamente as quatro chaves do contrato: nenhuma
        // chave de dose/insulina/extra sobrevive.
        expect(Object.keys(result).sort()).toEqual(CONTRACT_KEYS);

        // Sanitizar com dose === sanitizar sem dose: a dose não influencia nada.
        const resultWithoutDose = sanitizeInterpretation(base);
        expect(result).toEqual(resultWithoutDose);
      }),
      { numRuns: 100 },
    );
  });

  it("remove campos de dose aninhados nos itens: cada item resta com {foodName, quantity, unit} (Req 3.10)", () => {
    // Itens crus que carregam campos de dose além dos campos do contrato.
    const itemWithDoseArb = fc
      .tuple(baseItemArb, doseFieldsArb)
      .map(([item, dose]) => ({ ...item, ...dose }));

    fc.assert(
      fc.property(
        fc.array(itemWithDoseArb, { minLength: 1, maxLength: 10 }),
        (itemsWithDose) => {
          const raw = {
            glucose: 120,
            meal: "LUNCH" as MealType,
            items: itemsWithDose,
            missingInformation: [] as MissingInfo[],
          };

          const result = sanitizeInterpretation(raw);

          // foodName é sempre não vazio, então todos os itens sobrevivem.
          expect(result.items.length).toBe(itemsWithDose.length);

          for (const item of result.items) {
            // Cada item preserva apenas as chaves do contrato de item; qualquer
            // campo de dose aninhado foi descartado.
            expect(Object.keys(item).sort()).toEqual([
              "foodName",
              "quantity",
              "unit",
            ]);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
