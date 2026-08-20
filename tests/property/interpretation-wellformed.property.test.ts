import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { MockInterpreter } from "../../src/adapters/interpreter-mock/mock-interpreter.js";
import type { MealType, MissingInfo } from "../../src/domain/types.js";

/**
 * Teste de propriedade — MealInterpretation bem-formada e sem dose.
 *
 * Feature: glicia, Property 11: MealInterpretation bem-formada e sem dose
 *
 * Para QUALQUER texto (incluindo unicode aleatório, espaços em branco e
 * strings longas), MockInterpreter.interpret(text) SEMPRE retorna uma
 * MealInterpretation bem-formada:
 *   - as chaves são exatamente {glucose, meal, items, missingInformation};
 *     NENHUM campo de dose (Req 3.1, 3.9)
 *   - glucose é null ou um número > 0 (Req 3.3)
 *   - meal é null ou um valor de Meal_Type (Req 3.4)
 *   - items é um array com no máximo 50 itens; cada item tem foodName (texto
 *     não vazio), quantity (null ou número > 0) e unit (null ou texto) (Req 3.5)
 *   - missingInformation é um array cujas entradas pertencem a
 *     {GLUCOSE, MEAL, FOOD_QUANTITY, FOOD}, sem duplicatas (Req 3.6)
 *
 * Como interpret é assíncrono, usa-se fc.asyncProperty.
 *
 * Validates: Requirements 3.1, 3.3, 3.4, 3.5, 3.6, 3.9
 */
describe("Feature: glicia, Property 11: MealInterpretation bem-formada e sem dose", () => {
  const VALID_MEAL_TYPES: ReadonlySet<MealType> = new Set<MealType>([
    "BREAKFAST",
    "LUNCH",
    "SNACK",
    "DINNER",
  ]);

  const VALID_MISSING_INFO: ReadonlySet<MissingInfo> = new Set<MissingInfo>([
    "GLUCOSE",
    "MEAL",
    "FOOD_QUANTITY",
    "FOOD",
  ]);

  const CONTRACT_KEYS = ["glucose", "meal", "items", "missingInformation"];

  // Gerador de textos arbitrários: strings quaisquer, incluindo unicode,
  // espaços em branco e strings longas (até 4000 chars, faixa do domínio).
  const arbitraryText: fc.Arbitrary<string> = fc.oneof(
    fc.string(),
    fc.string({ maxLength: 4000 }),
    fc.stringMatching(/^\s*$/),
    fc.fullUnicodeString(),
  );

  it("interpret(text) sempre retorna uma MealInterpretation bem-formada e sem campo de dose", async () => {
    const interpreter = new MockInterpreter();

    await fc.assert(
      fc.asyncProperty(arbitraryText, async (text) => {
        const result = await interpreter.interpret(text);

        // As chaves são exatamente as do contrato; nenhum campo de dose (Req 3.1, 3.9).
        expect(Object.keys(result).sort()).toEqual([...CONTRACT_KEYS].sort());
        expect(result).not.toHaveProperty("dose");
        expect(result).not.toHaveProperty("insulin");
        expect(result).not.toHaveProperty("insulinDose");

        // glucose é null ou número > 0 (Req 3.3).
        if (result.glucose !== null) {
          expect(typeof result.glucose).toBe("number");
          expect(Number.isFinite(result.glucose)).toBe(true);
          expect(result.glucose).toBeGreaterThan(0);
        }

        // meal é null ou um Meal_Type válido (Req 3.4).
        if (result.meal !== null) {
          expect(VALID_MEAL_TYPES.has(result.meal)).toBe(true);
        }

        // items é um array com no máximo 50 itens (Req 3.5).
        expect(Array.isArray(result.items)).toBe(true);
        expect(result.items.length).toBeLessThanOrEqual(50);

        for (const item of result.items) {
          // foodName é texto não vazio (Req 3.5).
          expect(typeof item.foodName).toBe("string");
          expect(item.foodName.length).toBeGreaterThan(0);

          // quantity é null ou número > 0 (Req 3.5).
          if (item.quantity !== null) {
            expect(typeof item.quantity).toBe("number");
            expect(Number.isFinite(item.quantity)).toBe(true);
            expect(item.quantity).toBeGreaterThan(0);
          }

          // unit é null ou texto (Req 3.5).
          if (item.unit !== null) {
            expect(typeof item.unit).toBe("string");
          }
        }

        // missingInformation é um array de valores válidos, sem duplicatas (Req 3.6).
        expect(Array.isArray(result.missingInformation)).toBe(true);
        for (const info of result.missingInformation) {
          expect(VALID_MISSING_INFO.has(info)).toBe(true);
        }
        expect(new Set(result.missingInformation).size).toBe(
          result.missingInformation.length,
        );
      }),
      { numRuns: 100 },
    );
  });
});
