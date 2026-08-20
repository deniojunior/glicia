import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  calculateInsulin,
  type InsulinInput,
  type InsulinResult,
} from "../../src/domain/insulin/calculate-insulin.js";

// Teste de propriedade — Determinismo do Insulin_Calculator.
//
// Validates: Requirements 7.6, 2.7, 17.1
//
// Req 7.6: entradas idênticas → saídas idênticas em qualquer execução.
// Req 2.7: trocar canal/interpretador não altera Total_Dose/Rounded_Dose para
//   as mesmas entradas numéricas e parâmetros.
// Req 17.1: o sistema executa de forma determinística apenas o protocolo
//   configurado.
//
// Executado offline, sem dependências externas (Req 7.7, 18.6).

/**
 * Gera um número finito válido para o cálculo (sem NaN/Infinity), em uma faixa
 * clinicamente plausível porém ampla o suficiente para exercitar o cálculo.
 */
const finiteNumber = fc.double({
  min: -1_000_000,
  max: 1_000_000,
  noNaN: true,
  noDefaultInfinity: true,
});

/**
 * Gera um divisor não-nulo (correctionFactor / carbohydrateRatio). O cálculo
 * exige divisores diferentes de zero (Req 7.12), por isso restringimos o
 * espaço de entrada para valores válidos ao testar determinismo.
 */
const nonzeroDivisor = fc
  .double({ min: -1_000, max: 1_000, noNaN: true, noDefaultInfinity: true })
  .filter((n) => n !== 0);

/** Gera uma entrada válida com divisores não-nulos. */
const validInput: fc.Arbitrary<InsulinInput> = fc.record({
  glucose: finiteNumber,
  carbohydrates: finiteNumber,
  targetGlucose: finiteNumber,
  correctionFactor: nonzeroDivisor,
  carbohydrateRatio: nonzeroDivisor,
});

/** Compara dois resultados campo a campo (igualdade estrita). */
function expectSameResult(a: InsulinResult, b: InsulinResult): void {
  expect(a.correctionDose).toBe(b.correctionDose);
  expect(a.carbohydrateDose).toBe(b.carbohydrateDose);
  expect(a.totalDose).toBe(b.totalDose);
  expect(a.roundedDose).toBe(b.roundedDose);
}

describe("Feature: glicia, Property 2: Determinismo do Insulin_Calculator", () => {
  it("chamar calculateInsulin duas vezes com a MESMA entrada produz resultados profundamente iguais (Req 7.6)", () => {
    fc.assert(
      fc.property(validInput, (input) => {
        const first = calculateInsulin(input);
        const second = calculateInsulin(input);

        // Igualdade profunda entre as duas execuções.
        expect(second).toEqual(first);
        expectSameResult(first, second);
      }),
      { numRuns: 100 },
    );
  });

  it("ordem/independência: calcular A, depois B, depois A novamente produz resultado idêntico para A (Req 2.7, 17.1)", () => {
    fc.assert(
      fc.property(validInput, validInput, (inputA, inputB) => {
        const firstA = calculateInsulin(inputA);
        // Uma chamada intermediária com outra entrada não deve influenciar A.
        calculateInsulin(inputB);
        const secondA = calculateInsulin(inputA);

        expect(secondA).toEqual(firstA);
        expectSameResult(firstA, secondA);
      }),
      { numRuns: 100 },
    );
  });
});
