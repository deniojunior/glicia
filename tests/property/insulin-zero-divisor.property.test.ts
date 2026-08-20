import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  calculateInsulin,
  InsulinCalculationError,
  type InsulinInput,
} from "../../src/domain/insulin/calculate-insulin.js";

/**
 * Teste de propriedade — divisor zero / entrada inválida.
 *
 * Feature: glicia, Property 5: Erro em divisor zero ou entrada inválida
 *
 * Duas propriedades independentes:
 *   1. Quando `correctionFactor === 0` OU `carbohydrateRatio === 0` (com todas
 *      as demais entradas sendo números finitos válidos), `calculateInsulin`
 *      lança `InsulinCalculationError` com código "ZERO_DIVISOR" (Req 7.12).
 *   2. Quando qualquer entrada numérica obrigatória é inválida
 *      (NaN/Infinity/-Infinity/null/undefined/não-número), `calculateInsulin`
 *      lança `InsulinCalculationError` com código "MISSING_OR_INVALID_INPUT"
 *      (Req 7.13).
 *
 * Nota de precedência: a validação de MISSING_OR_INVALID_INPUT ocorre ANTES da
 * verificação de ZERO_DIVISOR na implementação. Por isso, na propriedade de
 * ZERO_DIVISOR todas as demais entradas são mantidas como números finitos
 * válidos, garantindo que o único motivo do erro seja o divisor zero.
 *
 * Validates: Requirements 7.12, 7.13
 */
describe("Feature: glicia, Property 5: Erro em divisor zero ou entrada inválida", () => {
  // ---------------------------------------------------------------------------
  // Propriedade 1: divisor zero → ZERO_DIVISOR (Req 7.12)
  // ---------------------------------------------------------------------------

  // Números finitos válidos para os campos que NÃO são o divisor sob teste.
  const finiteNumber = (min: number, max: number): fc.Arbitrary<number> =>
    fc.double({ min, max, noNaN: true, noDefaultInfinity: true });

  it("lança ZERO_DIVISOR quando correctionFactor === 0 ou carbohydrateRatio === 0", () => {
    fc.assert(
      fc.property(
        finiteNumber(1, 600), // glucose
        finiteNumber(1, 300), // targetGlucose
        finiteNumber(0, 500), // carbohydrates
        finiteNumber(Math.fround(0.0001), 999), // divisor não-zero de apoio
        // qual divisor deve ser zerado: correctionFactor, carbohydrateRatio ou ambos
        fc.constantFrom("correctionFactor", "carbohydrateRatio", "both"),
        (glucose, targetGlucose, carbohydrates, nonZero, whichZero) => {
          const input: InsulinInput = {
            glucose,
            targetGlucose,
            carbohydrates,
            // Ambos os divisores começam como números finitos válidos != 0,
            // e apenas o(s) selecionado(s) é(são) zerado(s).
            correctionFactor:
              whichZero === "correctionFactor" || whichZero === "both"
                ? 0
                : nonZero,
            carbohydrateRatio:
              whichZero === "carbohydrateRatio" || whichZero === "both"
                ? 0
                : nonZero,
          };

          expect(() => calculateInsulin(input)).toThrow(
            InsulinCalculationError,
          );

          try {
            calculateInsulin(input);
          } catch (err) {
            expect(err).toBeInstanceOf(InsulinCalculationError);
            expect((err as InsulinCalculationError).code).toBe("ZERO_DIVISOR");
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ---------------------------------------------------------------------------
  // Propriedade 2: entrada inválida → MISSING_OR_INVALID_INPUT (Req 7.13)
  // ---------------------------------------------------------------------------

  // Valores inválidos para uma entrada numérica obrigatória. O zero NÃO entra
  // aqui: zero é um número finito VÁLIDO para glucose/targetGlucose/carbohydrates
  // (para os divisores, zero é tratado pela propriedade de ZERO_DIVISOR).
  const invalidValue: fc.Arbitrary<unknown> = fc.constantFrom<unknown[]>(
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    null,
    undefined,
    "not-a-number",
  );

  const requiredFields = [
    "glucose",
    "carbohydrates",
    "targetGlucose",
    "correctionFactor",
    "carbohydrateRatio",
  ] as const;

  it("lança MISSING_OR_INVALID_INPUT quando algum campo obrigatório é inválido", () => {
    fc.assert(
      fc.property(
        // Base válida (todos os divisores finitos e != 0).
        fc.record({
          glucose: finiteNumber(1, 600),
          targetGlucose: finiteNumber(1, 300),
          carbohydrates: finiteNumber(0, 500),
          correctionFactor: finiteNumber(Math.fround(0.0001), 999),
          carbohydrateRatio: finiteNumber(Math.fround(0.0001), 999),
        }),
        // Campo a ser corrompido e valor inválido a aplicar.
        fc.constantFrom(...requiredFields),
        invalidValue,
        (validBase, field, badValue) => {
          // Corrompe exatamente um campo com um valor inválido.
          const corrupted = { ...validBase, [field]: badValue } as InsulinInput;

          // Garante que o campo corrompido é de fato inválido (não um número finito).
          const corruptedField = corrupted[field] as unknown;
          expect(
            typeof corruptedField === "number" &&
              Number.isFinite(corruptedField),
          ).toBe(false);

          expect(() => calculateInsulin(corrupted)).toThrow(
            InsulinCalculationError,
          );

          try {
            calculateInsulin(corrupted);
          } catch (err) {
            expect(err).toBeInstanceOf(InsulinCalculationError);
            expect((err as InsulinCalculationError).code).toBe(
              "MISSING_OR_INVALID_INPUT",
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
