// tests/e2e/complete-message.e2e.test.ts
//
// Teste end-to-end — mensagem completa (task 15.2).
//
// Exercita o pipeline COMPLETO sobre a aplicação composta por `buildApp`:
//   interpretar → resolver alimentos → calcular CHO → apresentar para
//   confirmação → confirmar ("sim") → calcular dose determinística →
//   persistir com Parameter_Snapshot e formula_version "1.0" → registrar
//   dose aplicada e exibir a diferença.
//
// Requisitos cobertos:
//   - Req 18.5: teste de fluxo end-to-end offline sobre a composição real.
//   - Req 19.1/19.2/19.3: fluxo principal (interpretação → confirmação →
//     cálculo determinístico → persistência).
//   - Req 19.4: persistência com Parameter_Snapshot + Formula_Version "1.0".
//
// Estratégia de composição (conforme building blocks da task):
//   - `buildApp` com `dbPath: ":memory:"`, um `InMemoryChannel` de teste e um
//     `MockInterpreter` ROTEIRIZADO (mapa texto → MealInterpretation) para
//     interpretação 100% determinística da mensagem completa.
//   - `seedFoods: false` + `seedArrozFixture` semeiam, na MESMA conexão do
//     repositório, um único alimento "Arroz branco cozido" (alias "arroz") com
//     UMA medida — determinístico e desacoplado da base de produção.
//   - Como `:memory:` é por-conexão, a inspeção do banco usa
//     `repo.getDatabase()` (a MESMA conexão), nunca uma conexão nova.
//
// Cálculo esperado (jantar / DINNER):
//   Food "Arroz branco cozido": serving_quantity = 25, carbohydrates = 6.2.
//   CHO do item = round2(3 * 6.2 / 25) = round2(0.744) = 0.74 g  → total = 0.74 g
//   Parâmetros DINNER: target = 120, factor = 40, ratio = 10.
//   correctionDose   = (165 - 120) / 40 = 1.125
//   carbohydrateDose = 0.74 / 10       = 0.074
//   totalDose        = 1.199
//   roundedDose      = round(1.199)    = 1   (inteiro)
//
// 100% offline e determinístico (Req 1.7, 18.6).

import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/app/wiring.js";
import { MockInterpreter } from "../../src/adapters/interpreter-mock/mock-interpreter.js";
import { InMemoryChannel } from "../../src/adapters/persistence/in-memory-repository.js";
import type { MealInterpretation } from "../../src/domain/types.js";
import { seedArrozFixture } from "./food-fixture.js";

// Linha crua da junção insulin_calculation ⋈ meal, lida via repo.getDatabase().
interface CalculationJoinRow {
  meal_id: string;
  external_message_id: string;
  applied_dose: number | null;
  glucose: number;
  total_carbohydrates: number;
  correction_dose: number;
  carbohydrate_dose: number;
  total_dose: number;
  rounded_dose: number;
  snapshot_target_glucose: number;
  snapshot_correction_factor: number;
  snapshot_carbohydrate_ratio: number;
  formula_version: string;
}

describe("E2E — mensagem completa (task 15.2)", () => {
  it("interpreta, confirma, calcula, persiste com snapshot/formula_version e registra dose aplicada", async () => {
    // Mensagem completa da paciente (glicemia + jantar + item com quantidade).
    const completeMessage =
      "Minha glicemia está 165 e vou jantar 3 colheres de arroz.";

    // Roteiro determinístico: a mensagem completa mapeia diretamente para uma
    // MealInterpretation sem informação ausente. "arroz" (alias SBD) resolverá
    // ao Food "Arroz branco cozido".
    const scripted = new Map<string, MealInterpretation>([
      [
        completeMessage,
        {
          glucose: 165,
          meal: "DINNER",
          items: [{ foodName: "arroz", quantity: 3, unit: "colher de sopa" }],
          missingInformation: [],
        },
      ],
    ]);

    const interpreter = new MockInterpreter(scripted);
    const channel = new InMemoryChannel();
    // Relógio fixo: mantém a janela de confirmação (10 min) sempre válida.
    const fixedNow = new Date("2025-01-01T12:00:00.000Z");
    const clock = (): Date => fixedNow;

    const app = buildApp({
      dbPath: ":memory:",
      interpreter,
      channel,
      clock,
      seedFoods: false, // usa fixture controlado, não a base de produção
    });

    // Semeia o fixture determinístico (alimento "Arroz branco cozido" + alias
    // "arroz") na MESMA conexão do repositório, antes de iniciar o canal.
    seedArrozFixture(app.repo.getDatabase());

    await app.start();

    try {
      // A conexão de inspeção é a MESMA do repositório (:memory: é por-conexão).
      const db = app.repo.getDatabase();

      // Sanidade: o seed populou os alimentos e o alias "arroz".
      const foodCount = db
        .prepare("SELECT COUNT(*) AS n FROM food")
        .get() as { n: number };
      expect(foodCount.n).toBeGreaterThan(0);

      // --- 1) Mensagem completa → apresentação para confirmação (Req 6.1, 19.1/19.2)
      await channel.receive(completeMessage);

      const afterInterpret = channel.getSent();
      // O sistema apresenta a interpretação + total de CHO para confirmação.
      expect(afterInterpret.length).toBeGreaterThan(0);
      const confirmationPrompt = afterInterpret.join("\n");
      expect(confirmationPrompt).toContain("Total de carboidratos");
      // O total de CHO é o valor determinístico calculado pelo código.
      expect(confirmationPrompt).toContain("0.74");

      // Ainda não há refeição persistida antes da confirmação (Req 6.4/6.5).
      const beforeConfirm = db
        .prepare("SELECT COUNT(*) AS n FROM meal")
        .get() as { n: number };
      expect(beforeConfirm.n).toBe(0);

      // --- 2) Confirmação "sim" → cálculo determinístico + persistência (Req 6.3, 19.3/19.4)
      await channel.receive("sim");

      // Exatamente uma refeição persistida (repo é fonte de verdade).
      const mealCount = db
        .prepare("SELECT COUNT(*) AS n FROM meal")
        .get() as { n: number };
      expect(mealCount.n).toBe(1);

      // A dose calculada é reportada ao usuário.
      const afterConfirm = channel.getSent().join("\n");
      expect(afterConfirm).toContain("Dose calculada");

      // Inspeção do cálculo persistido (insulin_calculation ⋈ meal).
      const calc = db
        .prepare(
          "SELECT c.meal_id, m.external_message_id, m.applied_dose, " +
            "c.glucose, c.total_carbohydrates, c.correction_dose, " +
            "c.carbohydrate_dose, c.total_dose, c.rounded_dose, " +
            "c.snapshot_target_glucose, c.snapshot_correction_factor, " +
            "c.snapshot_carbohydrate_ratio, c.formula_version " +
            "FROM insulin_calculation c JOIN meal m ON m.id = c.meal_id " +
            "LIMIT 1",
        )
        .get() as CalculationJoinRow | undefined;

      expect(calc).toBeDefined();
      const row = calc!;

      // Formula_Version "1.0" (Req 9.6, 19.4).
      expect(row.formula_version).toBe("1.0");

      // Parameter_Snapshot igual aos parâmetros default do jantar (Req 9.5).
      expect(row.snapshot_target_glucose).toBe(120);
      expect(row.snapshot_correction_factor).toBe(40);
      expect(row.snapshot_carbohydrate_ratio).toBe(10);

      // Entradas e componentes do cálculo determinístico (Req 7, 19.3).
      expect(row.glucose).toBe(165);
      expect(row.total_carbohydrates).toBeCloseTo(0.74, 5);
      expect(row.correction_dose).toBeCloseTo(1.125, 5);
      expect(row.carbohydrate_dose).toBeCloseTo(0.074, 5);
      expect(row.total_dose).toBeCloseTo(1.199, 5);

      // A dose arredondada é um inteiro (Req 7.4).
      expect(Number.isInteger(row.rounded_dose)).toBe(true);
      expect(row.rounded_dose).toBe(1);

      // Antes de informar a dose aplicada, ela permanece não registrada (Req 10.5).
      expect(row.applied_dose).toBeNull();

      // --- 3) Dose aplicada "apliquei 6" → diferença aplicada vs calculada (Req 10.6)
      await channel.receive("apliquei 6");

      const afterApplied = channel.getSent().join("\n");
      // A resposta mostra a dose aplicada e a diferença.
      expect(afterApplied).toContain("Dose aplicada");
      expect(afterApplied).toContain("Diferença");

      // A dose aplicada é persistida de forma independente da calculada (Req 10.1).
      const appliedRow = db
        .prepare(
          "SELECT applied_dose FROM meal WHERE id = ? LIMIT 1",
        )
        .get(row.meal_id) as { applied_dose: number | null } | undefined;
      expect(appliedRow).toBeDefined();
      expect(appliedRow!.applied_dose).toBe(6);
    } finally {
      await app.stop();
    }
  });
});
