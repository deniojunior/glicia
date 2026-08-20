import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  calculateInsulin,
  type InsulinInput,
} from "../../src/domain/insulin/calculate-insulin.js";

/**
 * Teste de propriedade — composição da dose de insulina.
 *
 * Feature: glicia, Property 1: Composição da dose de insulina
 *
 * Para toda entrada válida finita com correctionFactor != 0 e
 * carbohydrateRatio != 0, `calculateInsulin` produz:
 *   - correctionDose  = (glucose - targetGlucose) / correctionFactor
 *   - carbohydrateDose = carbohydrates / carbohydrateRatio
 *   - totalDose        = correctionDose + carbohydrateDose
 *
 * Os geradores são limitados a faixas finitas razoáveis para evitar ruído de
 * ponto flutuante causado por magnitudes absurdas; a igualdade é aproximada
 * (toBeCloseTo) para acomodar a aritmética de ponto flutuante.
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.5, 7.9, 7.10, 7.11
 */
describe("Feature: glicia, Property 1: Composição da dose de insulina", () => {
  // Gerador de entradas válidas dentro de faixas finitas e realistas.
  // correctionFactor e carbohydrateRatio são estritamente > 0 (nunca zero).
  const validInput: fc.Arbitrary<InsulinInput> = fc.record({
    glucose: fc.double({ min: 1, max: 600, noNaN: true, noDefaultInfinity: true }),
    targetGlucose: fc.double({ min: 1, max: 300, noNaN: true, noDefaultInfinity: true }),
    correctionFactor: fc.double({ min: 1, max: 999, noNaN: true, noDefaultInfinity: true }),
    carbohydrates: fc.double({ min: 0, max: 500, noNaN: true, noDefaultInfinity: true }),
    carbohydrateRatio: fc.double({
      min: Math.fround(0.0001),
      max: 999,
      noNaN: true,
      noDefaultInfinity: true,
    }),
  });

  it("compõe correctionDose, carbohydrateDose e totalDose corretamente", () => {
    fc.assert(
      fc.property(validInput, (input) => {
        const result = calculateInsulin(input);

        const expectedCorrection =
          (input.glucose - input.targetGlucose) / input.correctionFactor;
        const expectedCarb = input.carbohydrates / input.carbohydrateRatio;

        // Dose de correção (Req 7.1, 7.9, 7.10).
        expect(result.correctionDose).toBeCloseTo(expectedCorrection, 8);
        // Dose de carboidrato (Req 7.2, 7.11).
        expect(result.carbohydrateDose).toBeCloseTo(expectedCarb, 8);
        // Dose total bruta é a soma das partes (Req 7.3, 7.5).
        expect(result.totalDose).toBeCloseTo(
          result.correctionDose + result.carbohydrateDose,
          8,
        );
      }),
      { numRuns: 100 },
    );
  });
});
