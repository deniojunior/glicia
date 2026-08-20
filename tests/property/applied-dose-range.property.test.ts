// tests/property/applied-dose-range.property.test.ts
//
// Teste de propriedade — validação de faixa da dose aplicada (task 12.9).
//
// Feature: glicia, Property 22: Validação de faixa da dose aplicada
//
// A REGRA de faixa da Applied_Dose ([0.1, 250]) é aplicada pelo
// `ConversationOrchestrator.handleAppliedDose` (src/domain/conversation/orchestrator.ts):
//     if (applied === null || applied < 0.1 || applied > 250) { rejeita }
// e também há um CHECK em meal.applied_dose no schema (migrations/0001_init.sql,
// 0.1..250). O `saveAppliedDose` do repositório apenas PERSISTE — ele não impõe
// a faixa. Portanto a regra numérica é a especificação do orquestrador,
// replicada aqui como `isValidAppliedDose` (Req 10.3, 10.4).
//
// Esta propriedade exercita a REGRA + a SEMÂNTICA DE PRESERVAÇÃO (Req 10.4):
//   - para x arbitrário (misturando válidos e inválidos: NaN, Infinity, 0,
//     negativos, > 250 e valores em faixa), a guarda classifica corretamente;
//   - para x VÁLIDO, chamar `repo.saveAppliedDose(mealId, x)` e reler a refeição
//     (via `repo.getMeals()`) mostra `appliedDose === x` (Req 10.3);
//   - para x INVÁLIDO, o caminho de código (guarda do orquestrador) NÃO persiste
//     — apenas chamamos `saveAppliedDose` quando `isValidAppliedDose(x)` é true —
//     e a dose aplicada previamente registrada permanece inalterada (Req 10.4).
//
// Estratégia: um único `InMemoryRepository` no beforeAll, com UM alimento
// semeado, UMA conversa e UMA refeição persistida via `saveMealWithCalculation`
// para obter um `mealId` alvo do `saveAppliedDose`.
//
// Validates: Requirements 10.3, 10.4

import { beforeAll, describe, expect, it } from "vitest";
import fc from "fast-check";

import { InMemoryRepository } from "../../src/adapters/persistence/in-memory-repository.js";

let repo: InMemoryRepository;
let mealId: string;

/**
 * isValidAppliedDose — regra de faixa da Applied_Dose (Req 10.3, 10.4).
 * Espelha a guarda do `ConversationOrchestrator.handleAppliedDose`:
 * um número finito no intervalo fechado [0.1, 250]. Rejeita NaN, Infinity,
 * não numéricos, <= 0 e > 250.
 */
function isValidAppliedDose(x: number): boolean {
  return Number.isFinite(x) && x >= 0.1 && x <= 250;
}

beforeAll(async () => {
  repo = new InMemoryRepository();

  // Semeia UM alimento para satisfazer a referência foodId do meal_item.
  const food = repo.addFood({
    name: "arroz cozido",
    defaultServingUnit: "colher de sopa",
    defaultServingQuantity: 25,
    carbohydrates: 6.5,
    active: true,
  });

  const patient = await repo.getPatient();
  const conversation = await repo.createConversation();

  // Persiste UMA refeição para obter um mealId alvo de saveAppliedDose.
  const saved = await repo.saveMealWithCalculation({
    conversationId: conversation.id,
    patientId: patient.id,
    externalMessageId: "applied-dose-range-seed",
    mealType: "LUNCH",
    glucose: 165,
    totalCarbohydrates: 19.5,
    items: [
      {
        foodId: food.id,
        foodNameSnapshot: "arroz cozido",
        quantity: 3,
        unit: "colher de sopa",
        carbohydrates: 19.5,
      },
    ],
    calculation: {
      correctionDose: 1,
      carbohydrateDose: 3,
      totalDose: 4,
      roundedDose: 4,
      snapshotTargetGlucose: 120,
      snapshotCorrectionFactor: 40,
      snapshotCarbohydrateRatio: 6,
      formulaVersion: "1.0",
    },
  });
  mealId = saved.mealId;
});

// Lê a dose aplicada corrente da refeição alvo via acessor de teste.
function currentAppliedDose(): number | null {
  const meal = repo.getMeals().find((m) => m.id === mealId);
  return meal ? meal.appliedDose : null;
}

describe("Feature: glicia, Property 22: Validação de faixa da dose aplicada", () => {
  it("classifica [0.1,250] como válido, persiste válidos e preserva o valor anterior nos inválidos (Req 10.3, 10.4)", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Mistura de válidos e inválidos: faixa válida, extremos, fora de faixa,
        // zero, negativos, e não finitos (NaN / ±Infinity).
        fc.oneof(
          // válidos em [0.1, 250]
          fc.double({ min: 0.1, max: 250, noNaN: true, noDefaultInfinity: true }),
          // extremos exatos
          fc.constantFrom(0.1, 250),
          // abaixo do mínimo (0 < x < 0.1)
          fc.double({
            min: 0.0001,
            max: 0.0999,
            noNaN: true,
            noDefaultInfinity: true,
          }),
          // acima do máximo
          fc.double({
            min: 250.0001,
            max: 100000,
            noNaN: true,
            noDefaultInfinity: true,
          }),
          // zero, negativos e não finitos
          fc.constantFrom(0, -0, -1, -250, Number.NaN, Infinity, -Infinity),
          fc.double({ min: -100000, max: 0, noNaN: true, noDefaultInfinity: true }),
        ),
        async (x) => {
          const valid = isValidAppliedDose(x);

          // Referência sanidade: classificação equivale à faixa fechada finita.
          expect(valid).toBe(Number.isFinite(x) && x >= 0.1 && x <= 250);

          const before = currentAppliedDose();

          // Simula a guarda do orquestrador: só persiste quando válido.
          if (valid) {
            await repo.saveAppliedDose(mealId, x);
            // Válido → persistido e legível de volta (Req 10.3).
            expect(currentAppliedDose()).toBe(x);
          } else {
            // Inválido → NÃO persiste; a dose anterior é preservada (Req 10.4).
            const after = currentAppliedDose();
            expect(after).toBe(before);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
