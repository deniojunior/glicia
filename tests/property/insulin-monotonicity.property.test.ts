import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  calculateInsulin,
  type InsulinInput,
} from "../../src/domain/insulin/calculate-insulin.js";

// Teste de propriedade — Property 3 do design.
//
// Validates: Requirements 7.1, 7.9
//
// Monotonicidade da correção em relação à glicemia: fixando targetGlucose,
// correctionFactor > 0, carbohydrates e carbohydrateRatio > 0, a Correction_Dose
// (e, por consequência, a Total_Dose) é estritamente crescente em relação à
// glicemia. Ou seja, para g1 < g2 → correctionDose(g2) > correctionDose(g1);
// e para glicemias iguais → correctionDose iguais.
//
// A correção é (glucose - targetGlucose) / correctionFactor (Req 7.1). Com
// correctionFactor > 0, aumentar a glicemia aumenta estritamente a dose de
// correção; quando glucose < targetGlucose a correção é negativa (Req 7.9),
// mas a monotonia se mantém.

describe("Feature: glicia, Property 3: Monotonicidade da correção em relação à glicemia", () => {
  // Geradores restritos ao espaço de entrada válido do cálculo:
  // - glicemia em mg/dL é, na prática, um valor inteiro dentro de uma faixa
  //   clínica ampla; usar inteiros garante um intervalo mínimo significativo
  //   entre g1 e g2 (>= 1 mg/dL), evitando que dois doubles adjacentes colapsem
  //   na mesma dose após a divisão (artefato de ponto flutuante).
  // - divisores estritamente positivos (correctionFactor, carbohydrateRatio)
  const finiteGlucose = fc.integer({ min: 1, max: 1000 });
  const positiveFactor = fc.double({
    min: 1,
    max: 500,
    noNaN: true,
    noDefaultInfinity: true,
  });
  const nonNegativeCarbs = fc.double({
    min: 0,
    max: 500,
    noNaN: true,
    noDefaultInfinity: true,
  });
  const targetGlucose = fc.integer({ min: 1, max: 300 });

  it("glicemia maior produz Correction_Dose (e Total_Dose) estritamente maior quando correctionFactor > 0", () => {
    fc.assert(
      fc.property(
        finiteGlucose,
        finiteGlucose,
        targetGlucose,
        positiveFactor,
        nonNegativeCarbs,
        positiveFactor,
        (gA, gB, target, correctionFactor, carbohydrates, carbohydrateRatio) => {
          // Ordena para garantir g1 < g2 estritamente; descarta empates.
          const g1 = Math.min(gA, gB);
          const g2 = Math.max(gA, gB);
          fc.pre(g1 < g2);

          const base: Omit<InsulinInput, "glucose"> = {
            targetGlucose: target,
            correctionFactor,
            carbohydrates,
            carbohydrateRatio,
          };

          const r1 = calculateInsulin({ ...base, glucose: g1 });
          const r2 = calculateInsulin({ ...base, glucose: g2 });

          // correctionFactor > 0 → correção estritamente crescente na glicemia.
          expect(r2.correctionDose).toBeGreaterThan(r1.correctionDose);

          // A dose de carboidrato é idêntica (mesmos parâmetros), portanto a
          // Total_Dose herda a monotonicidade estrita da correção (Req 7.1).
          expect(r2.totalDose).toBeGreaterThan(r1.totalDose);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("glicemias iguais produzem Correction_Dose (e Total_Dose) iguais", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 1000, noNaN: true, noDefaultInfinity: true }),
        targetGlucose,
        positiveFactor,
        nonNegativeCarbs,
        positiveFactor,
        (glucose, target, correctionFactor, carbohydrates, carbohydrateRatio) => {
          const input: InsulinInput = {
            glucose,
            targetGlucose: target,
            correctionFactor,
            carbohydrates,
            carbohydrateRatio,
          };

          const r1 = calculateInsulin(input);
          const r2 = calculateInsulin({ ...input });

          expect(r2.correctionDose).toBe(r1.correctionDose);
          expect(r2.totalDose).toBe(r1.totalDose);
        },
      ),
      { numRuns: 100 },
    );
  });
});
