// tests/property/dose-independence.property.test.ts
//
// Teste de propriedade — independência entre dose calculada e dose aplicada.
//
// Feature: glicia, Property 20: Independência entre dose calculada e dose aplicada
//
// A Calculated_Dose (persistida em insulin_calculation via
// `saveMealWithCalculation`) e a Applied_Dose (persistida em meal.applied_dose
// via `saveAppliedDose`) vivem em CAMPOS DISTINTOS E INDEPENDENTES (Req 10.1,
// 10.2). Registrar a Applied_Dose NÃO altera, preenche, copia nem infere a
// Calculated_Dose — e vice-versa.
//
// Esta propriedade exercita:
//   - INDEPENDÊNCIA (Req 10.1, 10.2): para uma dose calculada arbitrária gravada
//     no cálculo (roundedDose inteiro, totalDose finito) e uma dose aplicada
//     arbitrária em [0.1, 250], ler `getCalculation(mealId)` ANTES e DEPOIS de
//     `saveAppliedDose` produz EXATAMENTE os mesmos roundedDose/totalDose.
//   - CAMPO PRÓPRIO (Req 10.2): `getMeals()` mostra `appliedDose` igual ao valor
//     informado — armazenado em seu próprio campo, não derivado da calculada.
//   - DIFERENÇA EXIBIDA (Req 10.6): a diferença numérica que o sistema exibiria
//     é `appliedDose - roundedDose`; validamos que a aritmética se sustenta
//     sobre os valores efetivamente persistidos.
//   - AUSÊNCIA DE DOSE APLICADA (Req 10.5): uma refeição SEM `saveAppliedDose`
//     mantém `appliedDose === null` enquanto seu cálculo persiste intacto.
//
// Estratégia: um único `InMemoryRepository` (beforeAll) com UM alimento semeado
// e UMA conversa. Cada execução persiste uma refeição nova com
// `externalMessageId` único (randomUUID) para não colidir com a idempotência
// (Req 13.1) e para isolar o cálculo de cada iteração.
//
// Validates: Requirements 10.1, 10.2, 10.6

import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";
import fc from "fast-check";

import { InMemoryRepository } from "../../src/adapters/persistence/in-memory-repository.js";
import type { SaveMealInput } from "../../src/domain/ports/repository.js";

let repo: InMemoryRepository;
let patientId: string;
let conversationId: string;
let foodId: string;

// Normaliza -0 para +0 para comparação estrita estável (Object.is via toBe).
const noNegZero = (n: number): number => (Object.is(n, -0) ? 0 : n);

beforeAll(async () => {
  repo = new InMemoryRepository();

  const food = repo.addFood({
    name: "arroz cozido",
    defaultServingUnit: "colher de sopa",
    defaultServingQuantity: 25,
    carbohydrates: 6.5,
    active: true,
  });
  foodId = food.id;

  const patient = await repo.getPatient();
  patientId = patient.id;

  const conversation = await repo.createConversation();
  conversationId = conversation.id;
});

// Constrói um SaveMealInput válido com a dose calculada informada. Os campos de
// runtime (conversationId, patientId, externalMessageId) e um item mínimo são
// preenchidos aqui; apenas roundedDose/totalDose variam por execução.
function buildInput(
  roundedDose: number,
  totalDose: number,
  externalMessageId: string,
): SaveMealInput {
  return {
    conversationId,
    patientId,
    externalMessageId,
    mealType: "LUNCH",
    glucose: 165,
    totalCarbohydrates: 19.5,
    items: [
      {
        foodId,
        foodNameSnapshot: "arroz cozido",
        quantity: 3,
        unit: "colher de sopa",
        carbohydrates: 19.5,
      },
    ],
    calculation: {
      correctionDose: 1,
      carbohydrateDose: 3,
      totalDose,
      roundedDose,
      snapshotTargetGlucose: 120,
      snapshotCorrectionFactor: 40,
      snapshotCarbohydrateRatio: 6,
      formulaVersion: "1.0",
    },
  };
}

describe("Feature: glicia, Property 20: Independência entre dose calculada e dose aplicada", () => {
  it("registrar a dose aplicada não altera a dose calculada; a aplicada vive em campo próprio e a diferença exibida é appliedDose - roundedDose (Req 10.1, 10.2, 10.6)", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Dose calculada arbitrária: roundedDose inteiro, totalDose finito.
        fc.integer({ min: -100, max: 100 }),
        fc
          .double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true })
          .map(noNegZero),
        // Dose aplicada arbitrária dentro da faixa válida [0.1, 250].
        fc
          .double({ min: 0.1, max: 250, noNaN: true, noDefaultInfinity: true })
          .map(noNegZero),
        async (roundedDose, totalDose, appliedDose) => {
          const externalMessageId = randomUUID();

          const { mealId } = await repo.saveMealWithCalculation(
            buildInput(roundedDose, totalDose, externalMessageId),
          );

          // Cálculo ANTES de registrar a dose aplicada (Req 10.1, 10.2).
          const calcBefore = repo.getCalculation(mealId);
          expect(calcBefore).not.toBeNull();
          if (calcBefore === null) return;
          expect(calcBefore.roundedDose).toBe(roundedDose);
          expect(calcBefore.totalDose).toBe(totalDose);

          // A dose aplicada só existe quando explicitamente registrada (Req 10.5).
          const mealBefore = repo.getMeals().find((m) => m.id === mealId);
          expect(mealBefore?.appliedDose).toBeNull();

          // Registra a dose aplicada.
          await repo.saveAppliedDose(mealId, appliedDose);

          // Cálculo INALTERADO após registrar a aplicada (independência: Req 10.1, 10.2).
          const calcAfter = repo.getCalculation(mealId);
          expect(calcAfter).not.toBeNull();
          if (calcAfter === null) return;
          expect(calcAfter.roundedDose).toBe(calcBefore.roundedDose);
          expect(calcAfter.totalDose).toBe(calcBefore.totalDose);

          // A aplicada vive em seu próprio campo, com o valor informado (Req 10.2).
          const mealAfter = repo.getMeals().find((m) => m.id === mealId);
          expect(mealAfter).toBeDefined();
          expect(mealAfter?.appliedDose).toBe(appliedDose);

          // Diferença exibida = appliedDose - roundedDose (Req 10.6).
          const displayedDifference =
            (mealAfter?.appliedDose as number) - calcAfter.roundedDose;
          expect(displayedDifference).toBe(appliedDose - roundedDose);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("uma refeição sem dose aplicada mantém appliedDose === null enquanto seu cálculo persiste (Req 10.5)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: -100, max: 100 }),
        fc
          .double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true })
          .map(noNegZero),
        async (roundedDose, totalDose) => {
          const externalMessageId = randomUUID();

          const { mealId } = await repo.saveMealWithCalculation(
            buildInput(roundedDose, totalDose, externalMessageId),
          );

          // NÃO chamamos saveAppliedDose para esta refeição.
          const meal = repo.getMeals().find((m) => m.id === mealId);
          expect(meal).toBeDefined();
          expect(meal?.appliedDose).toBeNull();

          // O cálculo persiste independentemente da ausência de dose aplicada.
          const calc = repo.getCalculation(mealId);
          expect(calc).not.toBeNull();
          expect(calc?.roundedDose).toBe(roundedDose);
          expect(calc?.totalDose).toBe(totalDose);
        },
      ),
      { numRuns: 100 },
    );
  });
});
